from typing import Any, Dict, List, Optional, Tuple

from app.repositories.attempt_repository import AttemptRepository
from app.repositories.challenge_repository import ChallengeRepository
from app.repositories.paper_repository import PaperRepository
from app.schemas.attempt import AttemptListItem, StudentHistoryStats
from app.services.challenge_service import _max_marks as challenge_max_marks
from app.services.challenge_service import _sorted_sections as challenge_sorted_sections
from app.services.challenge_service import _window_status
from app.services.cohort_percentile_service import CohortPercentileService
from app.services.paper_service import _max_marks as paper_max_marks
from app.services.paper_service import _sorted_sections as paper_sorted_sections
from app.utils.attempt_scoring import (
    standalone_accuracy_stats,
    standalone_result_counts,
    standalone_test_name,
    structured_attempt_stats,
    structured_counts_from_live_answers,
    structured_section_totals,
)
from app.utils.ids import oid_str


def _paper_full_max(paper: Optional[Dict[str, Any]], mpc: float) -> float:
    if not paper:
        return 0.0
    return paper_max_marks(paper, mpc)


def _challenge_full_max(challenge: Optional[Dict[str, Any]], mpc: float) -> float:
    if not challenge:
        return 0.0
    return challenge_max_marks(challenge, mpc)


def _section_attempt_ids(row: Dict[str, Any]) -> List[str]:
    ids: List[str] = []
    for raw in row.get("section_attempt_ids") or []:
        s = str(raw).strip()
        if s:
            ids.append(s)
    for r in row.get("section_results") or []:
        s = str(r.get("attempt_id") or "").strip()
        if s:
            ids.append(s)
    active = str(row.get("active_attempt_id") or "").strip()
    if active:
        ids.append(active)
    return ids


def _planned_question_total(sections: List[Dict[str, Any]], fallback_results: List[Dict[str, Any]]) -> int:
    planned = sum(int(s.get("total_questions") or 0) for s in sections)
    if planned > 0:
        return planned
    return sum(int(r.get("total_questions") or 0) for r in fallback_results)


class StudentHistoryService:
    def __init__(self) -> None:
        self._attempts = AttemptRepository()
        self._papers = PaperRepository()
        self._challenges = ChallengeRepository()
        self._cohort = CohortPercentileService()

    async def _standalone_items(self, username: str) -> List[AttemptListItem]:
        rows = await self._attempts.list_standalone_history_for_student(username)
        out: List[AttemptListItem] = []
        for a in rows:
            answers = list(a.get("answers") or [])
            correct, wrong, not_attempted = standalone_result_counts(a, answers)
            _, attempted, pct = standalone_accuracy_stats(answers)
            if attempted <= 0 and not answers and not_attempted <= 0:
                continue

            cohort = await self._cohort.for_standalone(
                subject=a.get("subject_filter"),
                topic=a.get("topic_filter"),
                exam_tag=a.get("exam_tag_filter"),
                percentage=round(pct, 2),
            )
            out.append(
                AttemptListItem(
                    id=oid_str(a["_id"]),
                    student_name=a.get("student_name", ""),
                    status=str(a.get("status", "")),
                    session_type="standalone",
                    test_name=standalone_test_name(a),
                    correct=correct,
                    wrong=wrong,
                    not_attempted=not_attempted,
                    score=correct,
                    total_questions=max(correct + wrong + not_attempted, attempted),
                    percentage=round(pct, 2),
                    cohort_percentile=cohort.get("cohort_percentile"),
                    cohort_ranked_count=int(cohort.get("cohort_ranked_count") or 0),
                    subject=a.get("subject_filter"),
                    topic=a.get("topic_filter"),
                    started_at=a["started_at"],
                    completed_at=a.get("completed_at"),
                )
            )
        return out

    async def _live_structured_counts(
        self,
        row: Dict[str, Any],
        sections: List[Dict[str, Any]],
        attempts_by_id: Dict[str, Dict[str, Any]],
    ) -> Tuple[int, int, int]:
        section_results = list(row.get("section_results") or [])
        planned = _planned_question_total(sections, section_results)
        live_answers: List[List[Dict[str, Any]]] = []
        seen: set[str] = set()
        for aid in _section_attempt_ids(row):
            if aid in seen:
                continue
            seen.add(aid)
            att = attempts_by_id.get(aid)
            if att:
                live_answers.append(list(att.get("answers") or []))
        if live_answers:
            return structured_counts_from_live_answers(planned_total=planned, section_answers=live_answers)
        correct, wrong, not_attempted = structured_section_totals(section_results)
        if planned > 0:
            not_attempted = max(0, planned - correct - wrong)
        return correct, wrong, not_attempted

    async def _paper_items(self, username: str) -> List[AttemptListItem]:
        rows = await self._papers.list_paper_attempts_for_student(username)
        if not rows:
            return []
        paper_ids = list({str(pa["paper_id"]) for pa in rows})
        papers_by_id = await self._papers.get_papers_by_ids(paper_ids)
        attempt_ids: List[str] = []
        for pa in rows:
            attempt_ids.extend(_section_attempt_ids(pa))
        attempts_by_id = await self._attempts.list_by_ids(attempt_ids)
        out: List[AttemptListItem] = []
        for pa in rows:
            pid = str(pa["paper_id"])
            paper = papers_by_id.get(pid)
            title = str(paper["title"]) if paper else "Question paper"
            mpc = float(paper.get("marks_per_correct", 1)) if paper else 1.0
            st = str(pa.get("status", ""))
            ended_early = st == "ended_early"
            section_results = list(pa.get("section_results") or [])
            sections = paper_sorted_sections(paper) if paper else []
            full_max = _paper_full_max(paper, mpc)
            total_marks_raw = pa.get("total_marks")
            total_marks = float(total_marks_raw) if total_marks_raw is not None else None
            _, _, _, pct = structured_attempt_stats(
                section_results,
                mpc=mpc,
                full_max=full_max,
                ended_early=ended_early or st == "in_progress",
                total_marks=total_marks,
            )
            correct, wrong, not_attempted = await self._live_structured_counts(pa, sections, attempts_by_id)

            cohort_pct: Optional[float] = None
            cohort_n = 0
            if st in ("completed", "ended_early") and total_marks is not None:
                cohort = await self._cohort.for_paper(pid, float(total_marks))
                cohort_pct = cohort.get("cohort_percentile")
                cohort_n = int(cohort.get("cohort_ranked_count") or 0)

            out.append(
                AttemptListItem(
                    id=oid_str(pa["_id"]),
                    student_name=str(pa.get("student_username") or username),
                    status=st,
                    session_type="paper",
                    test_name=title,
                    correct=correct,
                    wrong=wrong,
                    not_attempted=not_attempted,
                    score=correct,
                    total_questions=correct + wrong + not_attempted,
                    percentage=round(pct, 2),
                    cohort_percentile=cohort_pct,
                    cohort_ranked_count=cohort_n,
                    subject=None,
                    topic=None,
                    started_at=pa["started_at"],
                    completed_at=pa.get("completed_at"),
                )
            )
        return out

    async def _challenge_items(self, username: str) -> List[AttemptListItem]:
        rows = await self._challenges.list_challenge_attempts_for_student(username)
        if not rows:
            return []
        challenge_ids = list({str(ca["challenge_id"]) for ca in rows})
        challenges_by_id = await self._challenges.get_challenges_by_ids(challenge_ids)
        attempt_ids: List[str] = []
        for ca in rows:
            attempt_ids.extend(_section_attempt_ids(ca))
        attempts_by_id = await self._attempts.list_by_ids(attempt_ids)
        out: List[AttemptListItem] = []
        for ca in rows:
            cid = str(ca["challenge_id"])
            challenge = challenges_by_id.get(cid)
            title = str(challenge["title"]) if challenge else "Challenge"
            mpc = float(challenge.get("marks_per_correct", 1)) if challenge else 1.0
            st = str(ca.get("status", ""))
            ended_early = st == "ended_early"
            section_results = list(ca.get("section_results") or [])
            sections = challenge_sorted_sections(challenge) if challenge else []
            full_max = _challenge_full_max(challenge, mpc)
            total_marks_raw = ca.get("total_marks")
            total_marks = float(total_marks_raw) if total_marks_raw is not None else None
            _, _, _, pct = structured_attempt_stats(
                section_results,
                mpc=mpc,
                full_max=full_max,
                ended_early=ended_early or st == "in_progress",
                total_marks=total_marks,
            )
            correct, wrong, not_attempted = await self._live_structured_counts(ca, sections, attempts_by_id)

            cohort_pct: Optional[float] = None
            cohort_n = 0
            if st in ("completed", "ended_early") and total_marks is not None and challenge:
                ch_status, _, _ = _window_status(challenge["launch_at"], challenge["end_at"])
                cohort = await self._cohort.for_challenge(
                    cid,
                    username,
                    challenge_ended=ch_status == "ended",
                )
                cohort_pct = cohort.get("cohort_percentile")
                cohort_n = int(cohort.get("cohort_ranked_count") or 0)

            out.append(
                AttemptListItem(
                    id=oid_str(ca["_id"]),
                    student_name=str(ca.get("student_username") or username),
                    status=st,
                    session_type="challenge",
                    test_name=title,
                    correct=correct,
                    wrong=wrong,
                    not_attempted=not_attempted,
                    score=correct,
                    total_questions=correct + wrong + not_attempted,
                    percentage=round(pct, 2),
                    cohort_percentile=cohort_pct,
                    cohort_ranked_count=cohort_n,
                    subject=None,
                    topic=None,
                    started_at=ca["started_at"],
                    completed_at=ca.get("completed_at"),
                )
            )
        return out

    @staticmethod
    def _aggregate_stats(items: List[AttemptListItem]) -> Tuple[int, float, float, float]:
        tests_taken = len(items)
        scores = [i.correct for i in items]
        pcts = [i.percentage for i in items]
        avg_score = sum(scores) / tests_taken if tests_taken else 0.0
        best_score = max(scores) if scores else 0.0
        best_pct = max(pcts) if pcts else 0.0
        return tests_taken, avg_score, best_score, best_pct

    async def get_history(self, student_username: str) -> StudentHistoryStats:
        username = student_username.strip()
        items: List[AttemptListItem] = []
        items.extend(await self._standalone_items(username))
        items.extend(await self._paper_items(username))
        items.extend(await self._challenge_items(username))
        items.sort(key=lambda x: x.started_at, reverse=True)

        tests_taken, avg_score, best_score, best_pct = self._aggregate_stats(items)

        return StudentHistoryStats(
            student_name=username,
            tests_taken=tests_taken,
            average_score=round(avg_score, 2),
            best_score=float(best_score),
            best_percentage=round(best_pct, 2),
            recent_attempts=items,
        )
