import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorCollection

from app.db.mongodb import get_database
from app.models.domain import AttemptStatus
from app.utils.attempt_scoring import standalone_accuracy_stats
from app.utils.ids import oid_str


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class AttemptRepository:
    def __init__(self) -> None:
        self._col: AsyncIOMotorCollection = get_database()["test_attempts"]

    async def ensure_indexes(self) -> None:
        await self._col.create_index([("student_name", 1), ("started_at", -1)])
        await self._col.create_index([("status", 1)])
        await self._col.create_index([("answers.question_id", 1)])

    async def insert(self, doc: Dict[str, Any]) -> str:
        doc.setdefault("started_at", _utc_now())
        res = await self._col.insert_one(doc)
        return oid_str(res.inserted_id)

    async def get(self, attempt_id: str) -> Optional[Dict[str, Any]]:
        return await self._col.find_one({"_id": ObjectId(attempt_id)})

    async def list_by_ids(self, attempt_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        oids: List[ObjectId] = []
        seen: set[str] = set()
        for raw in attempt_ids:
            s = str(raw).strip()
            if not s or s in seen or not ObjectId.is_valid(s):
                continue
            seen.add(s)
            oids.append(ObjectId(s))
        if not oids:
            return {}
        out: Dict[str, Dict[str, Any]] = {}
        async for doc in self._col.find({"_id": {"$in": oids}}):
            out[oid_str(doc["_id"])] = doc
        return out

    async def update(self, attempt_id: str, patch: Dict[str, Any]) -> bool:
        res = await self._col.update_one({"_id": ObjectId(attempt_id)}, {"$set": patch})
        return res.matched_count > 0

    async def list_recent(
        self,
        skip: int = 0,
        limit: int = 50,
        student_name: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        filt: Dict[str, Any] = {}
        if student_name:
            filt["student_name"] = {"$regex": f"^{student_name}$", "$options": "i"}
        cursor = self._col.find(filt).sort("started_at", -1).skip(skip).limit(limit)
        return [d async for d in cursor]

    async def list_standalone_for_student(
        self,
        student_name: str,
        *,
        limit: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """Test attempts not tied to a question paper (no paper_attempt_id)."""
        sn = student_name.strip()
        filt: Dict[str, Any] = {
            "student_name": {"$regex": f"^{re.escape(sn)}$", "$options": "i"},
            "status": {"$in": [AttemptStatus.COMPLETED.value, AttemptStatus.IN_PROGRESS.value]},
            "$or": [
                {"paper_attempt_id": {"$exists": False}},
                {"paper_attempt_id": None},
                {"paper_attempt_id": ""},
            ],
        }
        cursor = self._col.find(filt).sort("started_at", -1)
        if limit is not None:
            cursor = cursor.limit(limit)
        return [d async for d in cursor]

    async def count_standalone_for_student(self, student_username: str) -> int:
        """Standalone practice attempts (started), excluding question-paper sessions."""
        sn = student_username.strip()
        filt: Dict[str, Any] = {
            "status": {"$in": [AttemptStatus.COMPLETED.value, AttemptStatus.IN_PROGRESS.value, "ended_early"]},
            "$and": [
                {
                    "$or": [
                        {"paper_attempt_id": {"$exists": False}},
                        {"paper_attempt_id": None},
                        {"paper_attempt_id": ""},
                    ],
                },
                {
                    "$or": [
                        {"student_username": sn},
                        {
                            "student_username": {"$exists": False},
                            "student_name": {"$regex": f"^{re.escape(sn)}$", "$options": "i"},
                        },
                        {
                            "student_username": None,
                            "student_name": {"$regex": f"^{re.escape(sn)}$", "$options": "i"},
                        },
                        {
                            "student_username": "",
                            "student_name": {"$regex": f"^{re.escape(sn)}$", "$options": "i"},
                        },
                    ],
                },
            ],
        }
        return await self._col.count_documents(filt)

    async def count(self, filt: Optional[Dict[str, Any]] = None) -> int:
        return await self._col.count_documents(filt or {})

    async def count_attempts_in_month_for_students(
        self,
        student_usernames: List[str],
        month_start: datetime,
        month_end: datetime,
    ) -> int:
        if not student_usernames:
            return 0
        names = [u.strip() for u in student_usernames if u and str(u).strip()]
        if not names:
            return 0
        return await self._col.count_documents(
            {
                "student_username": {"$in": names},
                "started_at": {"$gte": month_start, "$lt": month_end},
            }
        )

    async def find_all(self, limit: int = 50000) -> List[Dict[str, Any]]:
        cursor = self._col.find({}).sort("started_at", -1).limit(limit)
        return [d async for d in cursor]

    async def list_standalone_cohort_percentages(
        self,
        *,
        subject: Optional[str] = None,
        topic: Optional[str] = None,
        exam_tag: Optional[str] = None,
        limit: int = 5000,
    ) -> List[float]:
        """Completed standalone attempts in the same subject/topic/exam lens (for percentiles)."""
        filt: Dict[str, Any] = {
            "status": AttemptStatus.COMPLETED.value,
            "$or": [
                {"paper_attempt_id": {"$exists": False}},
                {"paper_attempt_id": None},
                {"paper_attempt_id": ""},
            ],
            "$or": [
                {"challenge_attempt_id": {"$exists": False}},
                {"challenge_attempt_id": None},
                {"challenge_attempt_id": ""},
            ],
        }
        if subject and str(subject).strip():
            filt["subject_filter"] = str(subject).strip()
        if topic and str(topic).strip():
            filt["topic_filter"] = str(topic).strip()
        if exam_tag and str(exam_tag).strip():
            filt["exam_tag_filter"] = str(exam_tag).strip().upper()

        cursor = self._col.find(
            filt,
            {
                "score": 1,
                "total_questions": 1,
                "planned_total_questions": 1,
                "answers": 1,
                "questions_answered": 1,
                "question_ids": 1,
                "completion_reason": 1,
            },
        ).limit(limit)
        out: List[float] = []
        async for doc in cursor:
            _, _, pct = standalone_accuracy_stats(list(doc.get("answers") or []), doc)
            out.append(float(pct))
        return out

    async def list_completed_by_student(self, student_name: str) -> List[Dict[str, Any]]:
        cursor = (
            self._col.find(
                {
                    "student_name": {"$regex": f"^{student_name.strip()}$", "$options": "i"},
                    "status": AttemptStatus.COMPLETED.value,
                }
            )
            .sort("started_at", -1)
        )
        return [d async for d in cursor]

    async def list_standalone_history_for_student(self, student_username: str) -> List[Dict[str, Any]]:
        """Completed standalone practice attempts for My results (excludes paper/challenge sections)."""
        sn = student_username.strip()
        filt: Dict[str, Any] = {
            "status": {"$in": [AttemptStatus.COMPLETED.value, "ended_early"]},
            "$and": [
                {
                    "$or": [
                        {"paper_attempt_id": {"$exists": False}},
                        {"paper_attempt_id": None},
                        {"paper_attempt_id": ""},
                    ],
                },
                {
                    "$or": [
                        {"challenge_attempt_id": {"$exists": False}},
                        {"challenge_attempt_id": None},
                        {"challenge_attempt_id": ""},
                    ],
                },
                {
                    "$or": [
                        {"student_username": sn},
                        {
                            "student_username": {"$exists": False},
                            "student_name": {"$regex": f"^{re.escape(sn)}$", "$options": "i"},
                        },
                        {
                            "student_username": None,
                            "student_name": {"$regex": f"^{re.escape(sn)}$", "$options": "i"},
                        },
                        {
                            "student_username": "",
                            "student_name": {"$regex": f"^{re.escape(sn)}$", "$options": "i"},
                        },
                    ],
                },
            ],
        }
        cursor = self._col.find(filt).sort("started_at", -1)
        return [d async for d in cursor]

    async def list_trend_attempts_for_student(self, student_name: str, limit: int = 2000) -> List[Dict[str, Any]]:
        """Completed or ended-early attempts with at least one answer, newest first (for analytics filtering)."""
        sn = student_name.strip()
        filt: Dict[str, Any] = {
            "student_name": {"$regex": f"^{re.escape(sn)}$", "$options": "i"},
            "status": {"$in": [AttemptStatus.COMPLETED.value, "ended_early"]},
            "answers": {"$exists": True, "$ne": []},
        }
        cursor = self._col.find(filt).sort("started_at", -1).limit(limit)
        return [d async for d in cursor]

    async def list_answer_slices_for_questions(self, question_ids: List[str]) -> List[Dict[str, Any]]:
        """Flatten answers for analytics: one row per (attempt, answer) for the given question ids.

        Matches whether ``question_id`` was stored as a string or ObjectId (must align with bank ids).
        """
        if not question_ids:
            return []
        qids = list({str(q) for q in question_ids})
        pipeline = [
            {"$match": {"answers": {"$exists": True, "$ne": []}}},
            {"$unwind": "$answers"},
            {"$match": {"$expr": {"$in": [{"$toString": "$answers.question_id"}, qids]}}},
            {
                "$project": {
                    "_id": 0,
                    "qid": {"$toString": "$answers.question_id"},
                    "attempt_id": {"$toString": "$_id"},
                    "time": "$answers.time_spent_seconds",
                    "correct": {"$cond": ["$answers.is_correct", 1, 0]},
                }
            },
        ]
        cursor = self._col.aggregate(pipeline)
        return [d async for d in cursor]
