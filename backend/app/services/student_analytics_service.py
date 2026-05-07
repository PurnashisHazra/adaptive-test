from collections import defaultdict
from typing import Any, Dict, List, Optional

from bson import ObjectId

from app.models.domain import AttemptStatus
from app.repositories.attempt_repository import AttemptRepository
from app.repositories.paper_repository import PaperRepository
from app.repositories.question_repository import QuestionRepository
from app.schemas.student_analytics import (
    StudentPaperDetail,
    StudentPaperSectionReview,
    StudentQuestionOptionOut,
    StudentQuestionReview,
    StudentSessionSummary,
    StudentStandaloneDetail,
)
from app.utils.ids import oid_str


def _sorted_sections(paper: Dict[str, Any]) -> List[Dict[str, Any]]:
    return sorted(paper.get("sections", []), key=lambda s: int(s.get("order", 0)))


def _section_title(paper: Optional[Dict[str, Any]], section_index: int) -> str:
    if not paper:
        return f"Section {section_index + 1}"
    secs = _sorted_sections(paper)
    if 0 <= section_index < len(secs):
        return str(secs[section_index].get("title") or f"Section {section_index + 1}")
    return f"Section {section_index + 1}"


def _paper_max_marks(paper: Dict[str, Any], mpc: float) -> float:
    return sum(int(s.get("total_questions", 0)) for s in _sorted_sections(paper)) * mpc


def _option_label(options: List[dict], key: str) -> str:
    for o in options:
        if str(o.get("key", "")) == str(key):
            return str(o.get("label", key))
    return str(key)


def _attempt_id_str(x: Any) -> str:
    if isinstance(x, ObjectId):
        return str(x)
    return str(x)


class StudentAnalyticsService:
    def __init__(self) -> None:
        self._attempts = AttemptRepository()
        self._papers = PaperRepository()
        self._questions = QuestionRepository()

    def _owns_test_attempt(self, att: Dict[str, Any], username: str) -> bool:
        return str(att.get("student_name", "")).strip().lower() == username.strip().lower()

    def _owns_paper_attempt(self, pa: Dict[str, Any], username: str) -> bool:
        return str(pa.get("student_username", "")).strip().lower() == username.strip().lower()

    def _difficulty_served(self, answer: Dict[str, Any], qdoc: Optional[Dict[str, Any]]) -> Optional[str]:
        raw = answer.get("difficulty_when_served")
        if raw is None and qdoc:
            raw = qdoc.get("difficulty")
        if raw is None:
            return None
        s = str(raw).strip().upper()
        return s if s else None

    def _apply_peer_stats(self, reviews: List[StudentQuestionReview], rows: List[Dict[str, Any]]) -> None:
        by_q: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        for row in rows:
            qid = str(row.get("qid", "") or "")
            if qid:
                by_q[qid].append(row)

        for r in reviews:
            r.peer_answer_count = 0
            r.peer_accuracy_percent = None
            r.peer_avg_time_seconds = None
            r.peer_time_peer_sample_count = 0
            r.your_time_faster_than_peer_percent = None

            qid = r.question_id
            if qid == "unknown":
                continue
            bucket = by_q.get(qid, [])
            n = len(bucket)
            if n == 0:
                continue
            correct_n = sum(int(x.get("correct", 0) or 0) for x in bucket)
            r.peer_answer_count = n
            r.peer_accuracy_percent = round(100.0 * correct_n / n, 1)

            aid = (r.answer_attempt_id or "").strip()
            peers = [x for x in bucket if str(x.get("attempt_id", "")) != aid]
            peer_times: List[int] = []
            for x in peers:
                t = x.get("time")
                if t is not None and isinstance(t, (int, float)) and int(t) >= 0:
                    peer_times.append(int(t))
            r.peer_time_peer_sample_count = len(peer_times)
            if peer_times:
                r.peer_avg_time_seconds = round(sum(peer_times) / len(peer_times), 1)

            st = r.time_spent_seconds
            if st is not None and peer_times:
                t_self = int(st)
                slower = sum(1 for t in peer_times if t > t_self)
                r.your_time_faster_than_peer_percent = round(100.0 * slower / len(peer_times), 1)

    async def _reviews_from_answers(
        self, answers: List[Dict[str, Any]], answer_attempt_id: str
    ) -> List[StudentQuestionReview]:
        out: List[StudentQuestionReview] = []
        for i, a in enumerate(answers, start=1):
            qid = str(a.get("question_id", ""))
            chosen = str(a.get("chosen_answer", ""))
            qdoc = await self._questions.get_by_id(qid) if qid else None
            diff_served = self._difficulty_served(a, qdoc)
            if not qdoc:
                out.append(
                    StudentQuestionReview(
                        index=i,
                        question_id=qid or "unknown",
                        question_text="This question is no longer in the bank.",
                        image_url=None,
                        question_type="unknown",
                        options=[],
                        chosen_answer=chosen,
                        correct_answer="",
                        chosen_label=chosen,
                        correct_label="—",
                        is_correct=bool(a.get("is_correct")),
                        explanation=None,
                        time_spent_seconds=a.get("time_spent_seconds"),
                        difficulty_when_served=diff_served,
                        answer_attempt_id=answer_attempt_id,
                    )
                )
                continue
            raw_opts = list(qdoc.get("options") or [])
            opts = [
                StudentQuestionOptionOut(key=str(o.get("key", "")), label=str(o.get("label", "")))
                for o in raw_opts
                if o.get("key") is not None
            ]
            correct_key = str(qdoc.get("correct_answer", ""))
            raw_img = qdoc.get("image_url")
            img = str(raw_img).strip() if raw_img else None
            out.append(
                StudentQuestionReview(
                    index=i,
                    question_id=oid_str(qdoc["_id"]),
                    question_text=str(qdoc.get("question_text", "")),
                    image_url=img or None,
                    question_type=str(qdoc.get("question_type", "")),
                    options=opts,
                    chosen_answer=chosen,
                    correct_answer=correct_key,
                    chosen_label=_option_label(raw_opts, chosen),
                    correct_label=_option_label(raw_opts, correct_key),
                    is_correct=bool(a.get("is_correct")),
                    explanation=qdoc.get("explanation"),
                    time_spent_seconds=a.get("time_spent_seconds"),
                    difficulty_when_served=diff_served,
                    answer_attempt_id=answer_attempt_id,
                )
            )
        return out

    async def list_sessions(self, username: str) -> List[StudentSessionSummary]:
        uname = username.strip()
        items: List[StudentSessionSummary] = []

        for pa in await self._papers.list_paper_attempts_for_student(uname):
            pdoc = await self._papers.get_paper(pa["paper_id"])
            title = str(pdoc["title"]) if pdoc else "Question paper"
            st = str(pa.get("status", ""))
            sub_parts: List[str] = [st.replace("_", " ").title()]
            if st in ("completed", "ended_early") and pa.get("total_marks") is not None:
                sub_parts.append(f"{float(pa['total_marks']):.2f} marks")
            items.append(
                StudentSessionSummary(
                    session_type="paper",
                    id=oid_str(pa["_id"]),
                    title=title,
                    subtitle=" · ".join(sub_parts),
                    started_at=pa["started_at"],
                    completed_at=pa.get("completed_at"),
                    status=st,
                    kind_label="Question paper",
                )
            )

        for att in await self._attempts.list_standalone_for_student(uname):
            subj = att.get("subject_filter") or None
            top = att.get("topic_filter") or None
            st = str(att.get("status", ""))
            score = int(att.get("score", 0))
            total = max(1, int(att.get("total_questions", 1)))
            title = "Adaptive test"
            sub_bits: List[str] = []
            if subj:
                sub_bits.append(subj)
            if top:
                sub_bits.append(top)
            if st == AttemptStatus.COMPLETED.value:
                sub_bits.append(f"Score {score}/{total}")
            elif st == AttemptStatus.IN_PROGRESS.value:
                sub_bits.append("In progress")
            items.append(
                StudentSessionSummary(
                    session_type="standalone",
                    id=oid_str(att["_id"]),
                    title=title,
                    subtitle=" · ".join(sub_bits) if sub_bits else None,
                    started_at=att["started_at"],
                    completed_at=att.get("completed_at"),
                    status=st,
                    kind_label="Standalone test",
                )
            )

        items.sort(key=lambda x: x.started_at, reverse=True)
        return items

    async def standalone_detail(self, username: str, attempt_id: str) -> StudentStandaloneDetail:
        att = await self._attempts.get(attempt_id)
        if not att or not self._owns_test_attempt(att, username):
            raise ValueError("Not found")
        if str(att.get("paper_attempt_id") or "").strip():
            raise ValueError("Not found")
        answers = list(att.get("answers") or [])
        reviews = await self._reviews_from_answers(answers, oid_str(att["_id"]))
        qids = [r.question_id for r in reviews if r.question_id != "unknown"]
        rows = await self._attempts.list_answer_slices_for_questions(qids)
        self._apply_peer_stats(reviews, rows)
        score = int(att.get("score", 0))
        total = max(1, int(att.get("total_questions", 1)))
        pct = round((score / total) * 100.0, 2) if total else None
        ended_early = str(att.get("completion_reason", "")) == "ended_early"
        subj = att.get("subject_filter")
        top = att.get("topic_filter")
        hint_parts = [x for x in (subj, top) if x]
        title = "Adaptive test" + (f" ({' · '.join(str(x) for x in hint_parts)})" if hint_parts else "")

        return StudentStandaloneDetail(
            attempt_id=oid_str(att["_id"]),
            title=title,
            subject=subj,
            topic=top,
            status=str(att.get("status", "")),
            started_at=att["started_at"],
            completed_at=att.get("completed_at"),
            score=score,
            total_questions=int(att.get("total_questions", total)),
            percentage=pct,
            ended_early=ended_early,
            questions=reviews,
        )

    async def paper_detail(self, username: str, paper_attempt_id: str) -> StudentPaperDetail:
        pa = await self._papers.get_paper_attempt(paper_attempt_id)
        if not pa or not self._owns_paper_attempt(pa, username):
            raise ValueError("Not found")
        paper = await self._papers.get_paper(pa["paper_id"])
        paper_title = str(paper["title"]) if paper else "Question paper"
        mpc = float(paper.get("marks_per_correct", 1)) if paper else 1.0
        max_m = _paper_max_marks(paper, mpc) if paper else None

        st = str(pa.get("status", ""))
        ended_early = st == "ended_early"
        total_marks = float(pa["total_marks"]) if pa.get("total_marks") is not None else None
        pct: Optional[float] = None
        if total_marks is not None and max_m and max_m > 0:
            pct = round(max(0.0, min(100.0, total_marks / max_m * 100.0)), 2)

        pa_id = oid_str(pa["_id"])
        sections_out: List[StudentPaperSectionReview] = []
        all_reviews: List[StudentQuestionReview] = []
        for aid in pa.get("section_attempt_ids") or []:
            aid_s = _attempt_id_str(aid)
            att = await self._attempts.get(aid_s)
            if not att or not self._owns_test_attempt(att, username):
                continue
            if str(att.get("paper_attempt_id") or "").strip() != pa_id:
                continue
            sec_idx = int(att.get("paper_section_index", 0))
            sec_title = _section_title(paper, sec_idx)
            answers = list(att.get("answers") or [])
            reviews = await self._reviews_from_answers(answers, aid_s)
            all_reviews.extend(reviews)
            sections_out.append(
                StudentPaperSectionReview(
                    section_index=sec_idx,
                    section_title=sec_title,
                    attempt_id=aid_s,
                    status=str(att.get("status", "")),
                    questions=reviews,
                )
            )

        sections_out.sort(key=lambda s: s.section_index)
        qids = [r.question_id for r in all_reviews if r.question_id != "unknown"]
        rows = await self._attempts.list_answer_slices_for_questions(qids)
        self._apply_peer_stats(all_reviews, rows)

        cohort_docs = await self._papers.list_scored_attempts_for_paper(str(pa["paper_id"]))
        cohort_marks = [float(d["total_marks"]) for d in cohort_docs if d.get("total_marks") is not None]
        cohort_n = len(cohort_marks)
        better_pct: Optional[float] = None
        if total_marks is not None and cohort_n > 1:
            ym = float(total_marks)
            below = sum(1 for m in cohort_marks if m < ym - 1e-9)
            better_pct = round(100.0 * below / cohort_n, 1)

        return StudentPaperDetail(
            paper_attempt_id=oid_str(pa["_id"]),
            paper_id=str(pa["paper_id"]),
            paper_title=paper_title,
            status=st,
            started_at=pa["started_at"],
            completed_at=pa.get("completed_at"),
            total_marks=total_marks,
            max_marks=max_m,
            percentage=pct,
            ended_early=ended_early,
            cohort_scored_attempt_count=cohort_n,
            your_score_better_than_percent=better_pct,
            sections=sections_out,
        )
