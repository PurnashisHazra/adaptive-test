from typing import List

from app.repositories.attempt_repository import AttemptRepository
from app.schemas.attempt import AttemptListItem, StudentHistoryStats
from app.utils.ids import oid_str


class StudentHistoryService:
    def __init__(self) -> None:
        self._attempts = AttemptRepository()

    async def get_history(self, student_name: str) -> StudentHistoryStats:
        name = student_name.strip()
        rows = await self._attempts.list_completed_by_student(name)

        items: List[AttemptListItem] = []
        scores: List[int] = []
        pcts: List[float] = []
        for a in rows:
            tq = int(a.get("total_questions", 1))
            sc = int(a.get("score", 0))
            pct = (sc / tq * 100.0) if tq else 0.0
            scores.append(sc)
            pcts.append(pct)
            items.append(
                AttemptListItem(
                    id=oid_str(a["_id"]),
                    student_name=a.get("student_name", ""),
                    status=a.get("status", ""),
                    score=sc,
                    total_questions=tq,
                    percentage=round(pct, 2),
                    subject=a.get("subject_filter"),
                    topic=a.get("topic_filter"),
                    started_at=a["started_at"],
                    completed_at=a.get("completed_at"),
                )
            )

        tests_taken = len(rows)
        avg_score = sum(scores) / tests_taken if tests_taken else 0.0
        best_score = max(scores) if scores else 0.0
        best_pct = max(pcts) if pcts else 0.0

        return StudentHistoryStats(
            student_name=name,
            tests_taken=tests_taken,
            average_score=round(avg_score, 2),
            best_score=float(best_score),
            best_percentage=round(best_pct, 2),
            recent_attempts=items[:20],
        )
