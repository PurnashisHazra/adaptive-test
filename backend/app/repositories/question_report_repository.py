from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorCollection

from app.db.mongodb import get_database
from app.utils.ids import oid_str


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class QuestionReportRepository:
    def __init__(self) -> None:
        self._col: AsyncIOMotorCollection = get_database()["question_reports"]

    async def ensure_indexes(self) -> None:
        await self._col.create_index([("created_at", -1)])
        await self._col.create_index([("student_username", 1), ("created_at", -1)])
        await self._col.create_index([("question_id", 1)])

    async def insert(self, doc: Dict[str, Any]) -> str:
        doc.setdefault("created_at", _utc_now())
        res = await self._col.insert_one(doc)
        return oid_str(res.inserted_id)

    async def get_by_id(self, report_id: str) -> Optional[Dict[str, Any]]:
        try:
            oid = ObjectId(report_id)
        except Exception:
            return None
        return await self._col.find_one({"_id": oid})

    async def list_paginated(self, *, page: int = 1, page_size: int = 25) -> Tuple[List[Dict[str, Any]], int]:
        total = await self._col.count_documents({})
        skip = max(0, (page - 1) * page_size)
        cursor = self._col.find({}).sort("created_at", -1).skip(skip).limit(page_size)
        return [d async for d in cursor], total
