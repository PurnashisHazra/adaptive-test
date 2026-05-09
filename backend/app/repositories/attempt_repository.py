import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorCollection

from app.db.mongodb import get_database
from app.models.domain import AttemptStatus
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

    async def count(self, filt: Optional[Dict[str, Any]] = None) -> int:
        return await self._col.count_documents(filt or {})

    async def find_all(self, limit: int = 50000) -> List[Dict[str, Any]]:
        cursor = self._col.find({}).sort("started_at", -1).limit(limit)
        return [d async for d in cursor]

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
