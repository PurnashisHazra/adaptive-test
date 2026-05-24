import random
from datetime import datetime, timezone
from time import perf_counter
from typing import Any, Dict, List, Optional, Tuple

from app.models.domain import AttemptStatus, Difficulty
from app.repositories.attempt_repository import AttemptRepository
from app.repositories.config_repository import ConfigRepository
from app.repositories.question_repository import QuestionRepository
from app.schemas.attempt import (
    AttemptSessionFilters,
    AttemptSummary,
    QuestionAtIndexResponse,
    QuestionPayload,
    SubmitAnswerResponse,
    TestStartResponse,
)
from app.services.ai_question_generator import AIQuestionGenerator
from app.services.adaptive_engine import get_next_difficulty, get_next_question_id
from app.utils.ids import oid_str


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _attempt_filters_from_doc(doc: Dict[str, Any]) -> AttemptSessionFilters:
    et = doc.get("exam_tag_filter")
    exam = str(et).strip().upper() if et else None
    return AttemptSessionFilters(
        subject=str(doc["subject_filter"]).strip() if doc.get("subject_filter") else None,
        topic=str(doc["topic_filter"]).strip() if doc.get("topic_filter") else None,
        exam_tag=exam or None,
    )


def _explanation_from_qdoc(qdoc: Dict[str, Any]) -> tuple[Optional[str], Optional[str]]:
    expl_raw = qdoc.get("explanation")
    explanation = str(expl_raw).strip() if expl_raw else None
    img_raw = qdoc.get("explanation_image_url")
    explanation_image_url = str(img_raw).strip() if img_raw else None
    return explanation, explanation_image_url


def _to_student_payload(doc: Dict[str, Any]) -> QuestionPayload:
    raw_img = doc.get("image_url")
    img = str(raw_img).strip() if raw_img else None
    return QuestionPayload(
        id=oid_str(doc["_id"]),
        question_text=doc["question_text"],
        question_type=doc["question_type"],
        options=doc.get("options", []),
        subject=doc.get("subject", "General"),
        topic=doc.get("topic", "General"),
        image_url=img or None,
    )


def _answers_equal(correct: str, chosen: str, question_type: str) -> bool:
    c = correct.strip().lower()
    ch = chosen.strip().lower()
    return c == ch


def _skipped_indices(att: Dict[str, Any]) -> List[int]:
    return sorted(int(x) for x in (att.get("skipped_indices") or []))


def _is_adaptive_attempt(att: Dict[str, Any]) -> bool:
    return bool(att.get("is_adaptive", True))


def _question_index_for_id(att: Dict[str, Any], question_id: str) -> Optional[int]:
    served = list(att.get("question_ids", []))
    for i, qid in enumerate(served):
        if str(qid) == str(question_id):
            return i + 1
    return None


def _index_has_answer(att: Dict[str, Any], index: int) -> bool:
    served = list(att.get("question_ids", []))
    if index < 1 or index > len(served):
        return False
    qid = str(served[index - 1])
    return any(str(a.get("question_id")) == qid for a in att.get("answers", []))


def _can_submit_index(att: Dict[str, Any], index: int) -> bool:
    if index in _skipped_indices(att):
        return False
    if _index_has_answer(att, index):
        return False
    if _is_adaptive_attempt(att):
        return index == int(att.get("questions_answered", 0)) + 1
    served = list(att.get("question_ids", []))
    return 1 <= index <= len(served)


def _max_reachable_index(att: Dict[str, Any]) -> int:
    if _is_adaptive_attempt(att):
        return len(list(att.get("question_ids", [])))
    return int(att["total_questions"])


def _next_unanswered_index(att: Dict[str, Any], after: int = 0) -> Optional[int]:
    total = int(att["total_questions"])
    skipped = set(_skipped_indices(att))
    for i in range(1, total + 1):
        if i <= after:
            continue
        if i in skipped:
            continue
        if _index_has_answer(att, i):
            continue
        return i
    return None


def _chosen_answer_for_index(att: Dict[str, Any], index: int) -> Optional[str]:
    served = list(att.get("question_ids", []))
    if index < 1 or index > len(served):
        return None
    qid = str(served[index - 1])
    for a in att.get("answers", []):
        if str(a.get("question_id")) == qid:
            raw = a.get("chosen_answer")
            if a.get("skipped"):
                return None
            return None if raw is None else str(raw)
    return None


def _is_hard_correct_same_topic_pair(answers: List[Dict[str, Any]]) -> Optional[str]:
    """Return topic when latest two answers are HARD+correct on same topic."""
    if len(answers) < 2:
        return None
    a1 = answers[-2]
    a2 = answers[-1]
    if not bool(a1.get("is_correct")) or not bool(a2.get("is_correct")):
        return None
    if str(a1.get("difficulty_when_served", "")).upper() != "HARD":
        return None
    if str(a2.get("difficulty_when_served", "")).upper() != "HARD":
        return None
    t1 = str(a1.get("topic_when_served", "")).strip()
    t2 = str(a2.get("topic_when_served", "")).strip()
    if not t1 or not t2:
        return None
    if t1.lower() != t2.lower():
        return None
    return t2


def _parse_difficulty_sequence(cfg: Dict[str, Any]) -> List[Difficulty]:
    out: List[Difficulty] = []
    raw = cfg.get("difficulty_sequence", []) or []
    for x in raw:
        try:
            out.append(Difficulty(str(x).upper()))
        except Exception:
            continue
    return out


def _default_transition_map() -> Dict[Difficulty, Dict[str, Difficulty]]:
    return {
        Difficulty.EASY: {"if_correct": Difficulty.MEDIUM, "if_wrong": Difficulty.EASY},
        Difficulty.MEDIUM: {"if_correct": Difficulty.HARD, "if_wrong": Difficulty.EASY},
        Difficulty.HARD: {"if_correct": Difficulty.EXPERT, "if_wrong": Difficulty.MEDIUM},
        Difficulty.EXPERT: {"if_correct": Difficulty.EXPERT, "if_wrong": Difficulty.HARD},
    }


def _parse_transition_map(cfg: Dict[str, Any]) -> Dict[Difficulty, Dict[str, Difficulty]]:
    base = _default_transition_map()
    raw = cfg.get("difficulty_transition_map", {}) or {}
    if not isinstance(raw, dict):
        return base
    for k, v in raw.items():
        try:
            cur = Difficulty(str(k).upper())
        except Exception:
            continue
        if not isinstance(v, dict):
            continue
        for outcome in ("if_correct", "if_wrong"):
            try:
                nxt = Difficulty(str(v.get(outcome, "")).upper())
            except Exception:
                continue
            base[cur][outcome] = nxt
    return base


class TestService:
    def __init__(self) -> None:
        self._attempts = AttemptRepository()
        self._questions = QuestionRepository()
        self._config = ConfigRepository()
        self._ai_generator = AIQuestionGenerator()

    async def _preload_question_ids(
        self,
        total: int,
        subject: Optional[str],
        topic: Optional[str],
        exam_tag: Optional[str],
        pool: Optional[List[str]],
    ) -> List[str]:
        if pool and len(pool) >= total:
            return random.sample(list(pool), total)
        ids: List[str] = []
        used: List[str] = []
        for _ in range(total):
            qid = await get_next_question_id(
                self._questions,
                Difficulty.EASY,
                used,
                subject,
                topic,
                exam_tag,
                None,
            )
            if not qid:
                break
            ids.append(qid)
            used.append(qid)
        if len(ids) < total:
            raise ValueError(
                "Not enough questions available for a non-adaptive section (check filters or question set)."
            )
        return ids

    async def start_test(
        self,
        student_name: str,
        subject: Optional[str],
        topic: Optional[str],
        exam_tag: Optional[str],
        total_questions: int,
        time_limit_seconds: Optional[int],
        paper_context: Optional[Dict[str, Any]] = None,
        question_pool_ids: Optional[List[str]] = None,
    ) -> TestStartResponse:
        cfg = await self._config.get_or_create()
        pool = [str(x).strip() for x in question_pool_ids] if question_pool_ids else []
        pool = [x for x in pool if x] or None
        if not pool:
            if not cfg.get("subject_filter_enabled", True):
                subject = None
            if not cfg.get("topic_filter_enabled", True):
                topic = None

        if time_limit_seconds is None:
            time_limit_seconds = int(cfg.get("default_time_limit_seconds", 1800))

        is_adaptive = True
        if paper_context is not None:
            is_adaptive = bool(paper_context.get("is_adaptive", True))

        if is_adaptive:
            seq = _parse_difficulty_sequence(cfg)
            wave_enabled = bool(cfg.get("difficulty_wave_enabled", False))
            first_diff = seq[0] if (wave_enabled and seq) else Difficulty.EASY
            question_ids = [
                await get_next_question_id(
                    self._questions,
                    first_diff,
                    [],
                    subject,
                    topic,
                    exam_tag,
                    pool,
                )
            ]
            if not question_ids[0]:
                raise ValueError(
                    "No questions available for this section (check filters or question set and difficulty mix)."
                )
            max_reach = 1
        else:
            question_ids = await self._preload_question_ids(
                total_questions, subject, topic, exam_tag, pool
            )
            max_reach = total_questions

        doc: Dict[str, Any] = {
            "student_name": student_name.strip(),
            "status": AttemptStatus.IN_PROGRESS.value,
            "total_questions": total_questions,
            "questions_answered": 0,
            "score": 0,
            "question_ids": question_ids,
            "answers": [],
            "marked_for_review": [],
            "skipped_indices": [],
            "is_adaptive": is_adaptive,
            "subject_filter": subject,
            "topic_filter": topic,
            "exam_tag_filter": exam_tag,
            "time_limit_seconds": time_limit_seconds,
        }
        if pool:
            doc["question_pool_ids"] = pool
        if paper_context:
            doc["paper_attempt_id"] = paper_context["paper_attempt_id"]
            doc["paper_section_index"] = int(paper_context["paper_section_index"])
        aid = await self._attempts.insert(doc)
        first_id = question_ids[0]
        qdoc = await self._questions.get_by_id(first_id)
        assert qdoc is not None
        return TestStartResponse(
            attempt_id=aid,
            question=_to_student_payload(qdoc),
            question_index=1,
            total_questions=total_questions,
            time_limit_seconds=time_limit_seconds,
            started_at=doc["started_at"],
            marked_for_review=[],
            skipped_indices=[],
            questions_answered=0,
            max_reachable_index=max_reach,
            can_submit=True,
            is_adaptive=is_adaptive,
        )

    async def submit_answer(
        self,
        attempt_id: str,
        question_id: str,
        chosen_answer: str,
        time_spent_seconds: Optional[int] = None,
    ) -> SubmitAnswerResponse:
        cfg = await self._config.get_or_create()
        att = await self._attempts.get(attempt_id)
        if not att:
            raise ValueError("Attempt not found")
        if att.get("status") != AttemptStatus.IN_PROGRESS.value:
            raise ValueError("Attempt already completed")

        total = int(att["total_questions"])
        answered = int(att.get("questions_answered", 0))
        served_ids: List[str] = list(att.get("question_ids", []))
        is_adaptive = _is_adaptive_attempt(att)

        if answered >= total:
            raise ValueError("All questions already answered")

        q_index = _question_index_for_id(att, question_id)
        if q_index is None:
            raise ValueError("Question does not match this attempt")
        if not _can_submit_index(att, q_index):
            raise ValueError("Cannot submit on this question")
        if is_adaptive and q_index != answered + 1:
            raise ValueError("Question does not match current step")

        qdoc = await self._questions.get_by_id(question_id)
        if not qdoc:
            raise ValueError("Question not found")

        last_diff = Difficulty(qdoc["difficulty"])
        is_correct = _answers_equal(qdoc["correct_answer"], chosen_answer, qdoc["question_type"])
        new_score = int(att.get("score", 0)) + (1 if is_correct else 0)

        transition_enabled = bool(cfg.get("difficulty_transition_enabled", True))
        transition_map = _parse_transition_map(cfg)
        if transition_enabled:
            next_diff = transition_map[last_diff]["if_correct" if is_correct else "if_wrong"]
        else:
            next_diff = get_next_difficulty(last_diff, is_correct)
        seq = _parse_difficulty_sequence(cfg)
        wave_enabled = bool(cfg.get("difficulty_wave_enabled", False))
        # If wave is enabled, set next target by question position (index of next question).
        if wave_enabled and seq:
            seq_idx = min(answered, len(seq) - 1)
            next_diff = seq[seq_idx]

        answer_entry: Dict[str, Any] = {
            "question_id": question_id,
            "chosen_answer": chosen_answer.strip(),
            "is_correct": is_correct,
            "difficulty_when_served": last_diff.value,
            "topic_when_served": str(qdoc.get("topic", "")).strip() or None,
            "target_difficulty_after": next_diff.value,
        }
        if time_spent_seconds is not None:
            answer_entry["time_spent_seconds"] = int(time_spent_seconds)
        answers = list(att.get("answers", []))
        answers.append(answer_entry)
        new_answered = answered + 1

        patch: Dict[str, Any] = {
            "questions_answered": new_answered,
            "score": new_score,
            "answers": answers,
        }

        if new_answered >= total:
            patch["status"] = AttemptStatus.COMPLETED.value
            patch["completed_at"] = _utc_now()
            await self._attempts.update(attempt_id, patch)
            att_done = await self._attempts.get(attempt_id) or att
            mf = list(att_done.get("marked_for_review", []) or [])
            expl, expl_img = _explanation_from_qdoc(qdoc)
            return await self._submit_completed_response(
                att_done=att_done,
                attempt_id=attempt_id,
                is_correct=is_correct,
                explanation=expl,
                explanation_image_url=expl_img,
                new_answered=new_answered,
                answers=answers,
                new_score=new_score,
                mf=mf,
            )

        if not is_adaptive:
            return await self._respond_non_adaptive_continue(
                attempt_id=attempt_id,
                att=att,
                patch=patch,
                answers=answers,
                new_answered=new_answered,
                new_score=new_score,
                is_correct=is_correct,
                skipped=False,
                explanation=_explanation_from_qdoc(qdoc)[0],
                explanation_image_url=_explanation_from_qdoc(qdoc)[1],
                after_index=q_index,
            )

        used_after = served_ids  # includes current question already
        next_qid: Optional[str] = None
        generation_started = perf_counter()
        generated = False
        hard_pair_topic = _is_hard_correct_same_topic_pair(answers)
        pool_raw = att.get("question_pool_ids")
        pool_active = isinstance(pool_raw, list) and len([x for x in pool_raw if str(x).strip()]) > 0
        should_generate_expert = not pool_active and (
            (last_diff == Difficulty.EXPERT and is_correct) or (hard_pair_topic is not None)
        )
        if should_generate_expert:
            # If student succeeds at EXPERT OR solves two HARD questions in same topic,
            # create a fresh EXPERT question via AI.
            next_qid = await self._ai_generator.generate_and_store_expert_question(
                subject=att.get("subject_filter") or qdoc.get("subject"),
                topic=hard_pair_topic or att.get("topic_filter") or qdoc.get("topic"),
            )
            generated = bool(next_qid)

        generation_seconds = int(max(0.0, perf_counter() - generation_started))
        if generated and generation_seconds > 0:
            base = int(answer_entry.get("time_spent_seconds", 0) or 0)
            answer_entry["time_spent_seconds"] = base + generation_seconds
            answers[-1] = answer_entry
            patch["answers"] = answers

        if not next_qid:
            pool_for_next: Optional[List[str]] = None
            pr = att.get("question_pool_ids")
            if isinstance(pr, list) and pr:
                pool_for_next = [str(x).strip() for x in pr if str(x).strip()]
            next_qid = await get_next_question_id(
                self._questions,
                next_diff,
                used_after,
                att.get("subject_filter"),
                att.get("topic_filter"),
                att.get("exam_tag_filter"),
                pool_for_next,
            )
        if not next_qid:
            patch["status"] = AttemptStatus.COMPLETED.value
            patch["completed_at"] = _utc_now()
            patch["completion_reason"] = "no_more_questions"
            patch["total_questions"] = new_answered
            await self._attempts.update(attempt_id, patch)
            att_done = await self._attempts.get(attempt_id) or att
            mf = list(att_done.get("marked_for_review", []) or [])
            expl, expl_img = _explanation_from_qdoc(qdoc)
            return await self._submit_completed_response(
                att_done=att_done,
                attempt_id=attempt_id,
                is_correct=is_correct,
                explanation=expl,
                explanation_image_url=expl_img,
                new_answered=new_answered,
                answers=answers,
                new_score=new_score,
                mf=mf,
            )

        served_ids.append(next_qid)
        patch["question_ids"] = served_ids
        await self._attempts.update(attempt_id, patch)

        nq = await self._questions.get_by_id(next_qid)
        assert nq is not None
        att_after = await self._attempts.get(attempt_id) or att
        qids_after = list(att_after.get("question_ids", []))
        mf = list(att_after.get("marked_for_review", []) or [])
        expl, expl_img = _explanation_from_qdoc(qdoc)
        return SubmitAnswerResponse(
            is_correct=is_correct,
            skipped=False,
            explanation=expl,
            explanation_image_url=expl_img,
            completed=False,
            next_question=_to_student_payload(nq),
            question_index=new_answered + 1,
            summary=None,
            marked_for_review=mf,
            skipped_indices=_skipped_indices(att_after),
            questions_answered=int(att_after.get("questions_answered", new_answered)),
            max_reachable_index=_max_reachable_index(att_after),
            is_adaptive=True,
            paper_next=None,
            paper_summary=None,
        )

    async def _respond_non_adaptive_continue(
        self,
        *,
        attempt_id: str,
        att: Dict[str, Any],
        patch: Dict[str, Any],
        answers: List[Dict[str, Any]],
        new_answered: int,
        new_score: int,
        is_correct: bool,
        skipped: bool,
        explanation: Optional[str],
        explanation_image_url: Optional[str],
        after_index: int,
    ) -> SubmitAnswerResponse:
        await self._attempts.update(attempt_id, patch)
        att_after = await self._attempts.get(attempt_id) or att
        mf = list(att_after.get("marked_for_review", []) or [])
        next_idx = _next_unanswered_index(att_after, after=after_index)
        if next_idx is None:
            patch_done = {
                "status": AttemptStatus.COMPLETED.value,
                "completed_at": _utc_now(),
            }
            await self._attempts.update(attempt_id, patch_done)
            att_done = await self._attempts.get(attempt_id) or att_after
            return await self._submit_completed_response(
                att_done=att_done,
                attempt_id=attempt_id,
                is_correct=is_correct,
                explanation=explanation,
                explanation_image_url=explanation_image_url,
                new_answered=new_answered,
                answers=answers,
                new_score=new_score,
                mf=mf,
            )
        served = list(att_after.get("question_ids", []))
        nqid = served[next_idx - 1]
        nq = await self._questions.get_by_id(nqid)
        assert nq is not None
        return SubmitAnswerResponse(
            is_correct=is_correct,
            skipped=skipped,
            explanation=explanation,
            explanation_image_url=explanation_image_url,
            completed=False,
            next_question=_to_student_payload(nq),
            question_index=next_idx,
            summary=None,
            marked_for_review=mf,
            skipped_indices=_skipped_indices(att_after),
            questions_answered=new_answered,
            max_reachable_index=_max_reachable_index(att_after),
            is_adaptive=False,
            paper_next=None,
            paper_summary=None,
        )

    async def skip_question(
        self,
        attempt_id: str,
        question_id: str,
        time_spent_seconds: Optional[int] = None,
    ) -> SubmitAnswerResponse:
        att = await self._attempts.get(attempt_id)
        if not att:
            raise ValueError("Attempt not found")
        if att.get("status") != AttemptStatus.IN_PROGRESS.value:
            raise ValueError("Attempt already completed")

        total = int(att["total_questions"])
        answered = int(att.get("questions_answered", 0))
        is_adaptive = _is_adaptive_attempt(att)

        if answered >= total:
            raise ValueError("All questions already answered")

        q_index = _question_index_for_id(att, question_id)
        if q_index is None:
            raise ValueError("Question does not match this attempt")
        if not _can_submit_index(att, q_index):
            raise ValueError("Cannot skip this question")
        if is_adaptive and q_index != answered + 1:
            raise ValueError("Question does not match current step")

        qdoc = await self._questions.get_by_id(question_id)
        if not qdoc:
            raise ValueError("Question not found")

        last_diff = Difficulty(qdoc["difficulty"])
        new_score = int(att.get("score", 0))
        cfg = await self._config.get_or_create()
        transition_enabled = bool(cfg.get("difficulty_transition_enabled", True))
        transition_map = _parse_transition_map(cfg)
        if transition_enabled:
            next_diff = transition_map[last_diff]["if_wrong"]
        else:
            next_diff = get_next_difficulty(last_diff, False)
        seq = _parse_difficulty_sequence(cfg)
        wave_enabled = bool(cfg.get("difficulty_wave_enabled", False))
        if wave_enabled and seq:
            seq_idx = min(answered, len(seq) - 1)
            next_diff = seq[seq_idx]

        answer_entry: Dict[str, Any] = {
            "question_id": question_id,
            "chosen_answer": "",
            "is_correct": False,
            "skipped": True,
            "difficulty_when_served": last_diff.value,
            "topic_when_served": str(qdoc.get("topic", "")).strip() or None,
            "target_difficulty_after": next_diff.value,
        }
        if time_spent_seconds is not None:
            answer_entry["time_spent_seconds"] = int(time_spent_seconds)

        answers = list(att.get("answers", []))
        answers.append(answer_entry)
        new_answered = answered + 1
        skipped_list = sorted(set(_skipped_indices(att)) | {q_index})

        patch: Dict[str, Any] = {
            "questions_answered": new_answered,
            "score": new_score,
            "answers": answers,
            "skipped_indices": skipped_list,
        }

        expl, expl_img = _explanation_from_qdoc(qdoc)

        if new_answered >= total:
            patch["status"] = AttemptStatus.COMPLETED.value
            patch["completed_at"] = _utc_now()
            await self._attempts.update(attempt_id, patch)
            att_done = await self._attempts.get(attempt_id) or att
            mf = list(att_done.get("marked_for_review", []) or [])
            return await self._submit_completed_response(
                att_done=att_done,
                attempt_id=attempt_id,
                is_correct=False,
                explanation=expl,
                explanation_image_url=expl_img,
                new_answered=new_answered,
                answers=answers,
                new_score=new_score,
                mf=mf,
            )

        if not is_adaptive:
            return await self._respond_non_adaptive_continue(
                attempt_id=attempt_id,
                att=att,
                patch=patch,
                answers=answers,
                new_answered=new_answered,
                new_score=new_score,
                is_correct=False,
                skipped=True,
                explanation=expl,
                explanation_image_url=expl_img,
                after_index=q_index,
            )

        served_ids: List[str] = list(att.get("question_ids", []))
        pool_for_next: Optional[List[str]] = None
        pr = att.get("question_pool_ids")
        if isinstance(pr, list) and pr:
            pool_for_next = [str(x).strip() for x in pr if str(x).strip()]
        next_qid = await get_next_question_id(
            self._questions,
            next_diff,
            served_ids,
            att.get("subject_filter"),
            att.get("topic_filter"),
            att.get("exam_tag_filter"),
            pool_for_next,
        )
        if not next_qid:
            patch["status"] = AttemptStatus.COMPLETED.value
            patch["completed_at"] = _utc_now()
            patch["completion_reason"] = "no_more_questions"
            patch["total_questions"] = new_answered
            await self._attempts.update(attempt_id, patch)
            att_done = await self._attempts.get(attempt_id) or att
            mf = list(att_done.get("marked_for_review", []) or [])
            return await self._submit_completed_response(
                att_done=att_done,
                attempt_id=attempt_id,
                is_correct=False,
                explanation=expl,
                explanation_image_url=expl_img,
                new_answered=new_answered,
                answers=answers,
                new_score=new_score,
                mf=mf,
            )

        served_ids.append(next_qid)
        patch["question_ids"] = served_ids
        await self._attempts.update(attempt_id, patch)
        nq = await self._questions.get_by_id(next_qid)
        assert nq is not None
        att_after = await self._attempts.get(attempt_id) or att
        mf = list(att_after.get("marked_for_review", []) or [])
        return SubmitAnswerResponse(
            is_correct=False,
            skipped=True,
            explanation=expl,
            explanation_image_url=expl_img,
            completed=False,
            next_question=_to_student_payload(nq),
            question_index=new_answered + 1,
            summary=None,
            marked_for_review=mf,
            skipped_indices=_skipped_indices(att_after),
            questions_answered=new_answered,
            max_reachable_index=_max_reachable_index(att_after),
            is_adaptive=True,
            paper_next=None,
            paper_summary=None,
        )

    async def force_complete_attempt_timeout(self, attempt_id: str) -> None:
        att = await self._attempts.get(attempt_id)
        if not att:
            raise ValueError("Attempt not found")
        if att.get("status") != AttemptStatus.IN_PROGRESS.value:
            raise ValueError("Attempt already completed")
        answered = int(att.get("questions_answered", 0))
        patch: Dict[str, Any] = {
            "status": AttemptStatus.COMPLETED.value,
            "completed_at": _utc_now(),
            "completion_reason": "section_time_exceeded",
            "total_questions": answered,
        }
        await self._attempts.update(attempt_id, patch)

    async def _submit_completed_response(
        self,
        *,
        att_done: Dict[str, Any],
        attempt_id: str,
        is_correct: bool,
        explanation: Optional[str],
        explanation_image_url: Optional[str] = None,
        new_answered: int,
        answers: List[Dict[str, Any]],
        new_score: int,
        mf: List[int],
    ) -> SubmitAnswerResponse:
        summary = await self._build_summary(
            att_done, attempt_id, new_score, len(answers), answers, ended_early=False
        )
        if att_done.get("paper_attempt_id"):
            from app.services.paper_service import PaperService

            return await PaperService().after_section_attempt_completed(
                attempt_id=attempt_id,
                att_done=att_done,
                section_summary=summary,
                is_correct=is_correct,
                explanation=explanation,
                explanation_image_url=explanation_image_url,
                mf=mf,
                new_answered=new_answered,
            )
        return SubmitAnswerResponse(
            is_correct=is_correct,
            skipped=False,
            explanation=explanation,
            explanation_image_url=explanation_image_url,
            completed=True,
            next_question=None,
            question_index=None,
            summary=summary,
            marked_for_review=mf,
            skipped_indices=_skipped_indices(att_done),
            questions_answered=new_answered,
            max_reachable_index=_max_reachable_index(att_done),
            is_adaptive=_is_adaptive_attempt(att_done),
            paper_next=None,
            paper_summary=None,
        )

    async def get_question_at_index(self, attempt_id: str, question_index: int) -> QuestionAtIndexResponse:
        att = await self._attempts.get(attempt_id)
        if not att:
            raise ValueError("Attempt not found")
        if att.get("status") != AttemptStatus.IN_PROGRESS.value:
            raise ValueError("Attempt already completed")
        served_ids = list(att.get("question_ids", []))
        max_reach = _max_reachable_index(att)
        if question_index < 1 or question_index > max_reach:
            raise ValueError("Question does not exist yet")
        if question_index in _skipped_indices(att):
            raise ValueError("This question was skipped and cannot be reopened")
        if question_index > len(served_ids):
            raise ValueError("Question does not exist yet")
        answered = int(att.get("questions_answered", 0))
        qid = served_ids[question_index - 1]
        qdoc = await self._questions.get_by_id(qid)
        if not qdoc:
            raise ValueError("Question not found")
        chosen_answer = _chosen_answer_for_index(att, question_index)
        can_submit = _can_submit_index(att, question_index)
        mf = [int(x) for x in (att.get("marked_for_review") or [])]
        return QuestionAtIndexResponse(
            question=_to_student_payload(qdoc),
            question_index=question_index,
            chosen_answer=chosen_answer,
            can_submit=can_submit,
            is_skipped=False,
            total_questions=int(att["total_questions"]),
            max_reachable_index=max_reach,
            questions_answered=answered,
            marked_for_review=mf,
            skipped_indices=_skipped_indices(att),
            is_adaptive=_is_adaptive_attempt(att),
        )

    async def set_mark_review(self, attempt_id: str, question_index: int, marked: bool) -> List[int]:
        att = await self._attempts.get(attempt_id)
        if not att:
            raise ValueError("Attempt not found")
        if att.get("status") != AttemptStatus.IN_PROGRESS.value:
            raise ValueError("Attempt already completed")
        max_reach = _max_reachable_index(att)
        if question_index < 1 or question_index > max_reach:
            raise ValueError("Invalid question index")
        if question_index in _skipped_indices(att):
            raise ValueError("Cannot mark a skipped question for review")
        s = {int(x) for x in (att.get("marked_for_review") or [])}
        if marked:
            s.add(question_index)
        else:
            s.discard(question_index)
        out = sorted(s)
        await self._attempts.update(attempt_id, {"marked_for_review": out})
        return out

    async def end_test_early(self, attempt_id: str, *, allow_paper: bool = False) -> AttemptSummary:
        att = await self._attempts.get(attempt_id)
        if not att:
            raise ValueError("Attempt not found")
        if att.get("status") != AttemptStatus.IN_PROGRESS.value:
            raise ValueError("Attempt already completed")
        if att.get("paper_attempt_id") and not allow_paper:
            raise ValueError("This attempt is part of a question paper. End the paper from the paper screen.")

        answered = int(att.get("questions_answered", 0))
        answers = list(att.get("answers", []))
        score = int(att.get("score", 0))

        patch: Dict[str, Any] = {
            "status": AttemptStatus.COMPLETED.value,
            "completed_at": _utc_now(),
            "completion_reason": "ended_early",
            "total_questions": answered,
        }
        await self._attempts.update(attempt_id, patch)
        att_done = await self._attempts.get(attempt_id) or att

        effective_total = answered if answered > 0 else 0
        return await self._build_summary(
            att_done,
            attempt_id,
            score,
            effective_total,
            answers,
            ended_early=True,
        )

    async def _build_summary(
        self,
        att: Dict[str, Any],
        attempt_id: str,
        score: int,
        effective_total: int,
        answers: List[Dict[str, Any]],
        ended_early: bool = False,
    ) -> AttemptSummary:
        from app.schemas.attempt import AnswerRecord

        total = effective_total
        pct = (score / total * 100.0) if total else 0.0
        recs: List[AnswerRecord] = []
        for a in answers:
            recs.append(
                AnswerRecord(
                    question_id=a["question_id"],
                    chosen_answer=a.get("chosen_answer") or "",
                    is_correct=a["is_correct"],
                    difficulty_when_served=Difficulty(a["difficulty_when_served"]),
                    topic_when_served=a.get("topic_when_served"),
                    target_difficulty_after=(
                        Difficulty(a["target_difficulty_after"])
                        if a.get("target_difficulty_after")
                        else None
                    ),
                    time_spent_seconds=a.get("time_spent_seconds"),
                    skipped=bool(a.get("skipped")),
                )
            )
        return AttemptSummary(
            attempt_id=attempt_id,
            student_name=att["student_name"],
            score=score,
            total_questions=total,
            percentage=round(pct, 2),
            subject=att.get("subject_filter"),
            topic=att.get("topic_filter"),
            started_at=att["started_at"],
            completed_at=att.get("completed_at") or _utc_now(),
            answers=recs,
            ended_early=ended_early,
        )
