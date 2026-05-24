"""Load cohort scores and compute live / final percentiles for tests, papers, and challenges."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.repositories.attempt_repository import AttemptRepository
from app.repositories.challenge_repository import ChallengeRepository
from app.repositories.paper_repository import PaperRepository
from app.utils.cohort_percentile import percentile_among_ranked_attempts, percentile_vs_scores


class CohortPercentileService:
    def __init__(self) -> None:
        self._papers = PaperRepository()
        self._challenges = ChallengeRepository()
        self._attempts = AttemptRepository()

    async def for_paper(self, paper_id: str, total_marks: float) -> Dict[str, Any]:
        docs = await self._papers.list_scored_attempts_for_paper(paper_id)
        scores = [float(d["total_marks"]) for d in docs if d.get("total_marks") is not None]
        pct, n = percentile_vs_scores(total_marks, scores)
        return {
            "cohort_percentile": pct,
            "cohort_ranked_count": n,
            "percentile_is_final": False,
        }

    async def for_challenge(
        self,
        challenge_id: str,
        student_username: str,
        *,
        challenge_ended: bool,
    ) -> Dict[str, Any]:
        ranked = await self._challenges.list_ranked_attempts_for_challenge(challenge_id)
        pct, n = percentile_among_ranked_attempts(student_username, ranked)
        return {
            "cohort_percentile": pct,
            "cohort_ranked_count": n,
            "percentile_is_final": bool(challenge_ended and pct is not None),
        }

    async def for_standalone(
        self,
        *,
        subject: Optional[str],
        topic: Optional[str],
        exam_tag: Optional[str],
        percentage: float,
    ) -> Dict[str, Any]:
        scores = await self._attempts.list_standalone_cohort_percentages(
            subject=subject,
            topic=topic,
            exam_tag=exam_tag,
        )
        pct, n = percentile_vs_scores(percentage, scores)
        return {
            "cohort_percentile": pct,
            "cohort_ranked_count": n,
            "percentile_is_final": False,
        }
