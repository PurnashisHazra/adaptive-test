from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorCollection

from app.db.mongodb import get_database
from app.utils.ids import oid_str


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class PracticeAttemptRequestRepository:
    def __init__(self) -> None:
        self._col: AsyncIOMotorCollection = get_database()["practice_attempt_requests"]

    async def ensure_indexes(self) -> None:
        await self._col.create_index([("student_username", 1), ("status", 1)])
        await self._col.create_index([("status", 1), ("requested_at", -1)])

    async def insert(self, doc: Dict[str, Any]) -> str:
        doc.setdefault("requested_at", _utc_now())
        res = await self._col.insert_one(doc)
        return oid_str(res.inserted_id)

    async def get(self, request_id: str) -> Optional[Dict[str, Any]]:
        try:
            return await self._col.find_one({"_id": ObjectId(request_id)})
        except Exception:
            return None

    async def find_pending_for_student(self, student_username: str) -> Optional[Dict[str, Any]]:
        return await self._col.find_one(
            {"student_username": student_username.strip(), "status": "pending"},
        )

    async def list_pending_for_students(self, usernames: List[str]) -> List[Dict[str, Any]]:
        names = [u.strip() for u in usernames if u.strip()]
        if not names:
            return []
        cur = self._col.find({"student_username": {"$in": names}, "status": "pending"}).sort(
            "requested_at", -1
        )
        return [d async for d in cur]

    async def resolve(
        self,
        request_id: str,
        *,
        status: str,
        resolved_by: str,
    ) -> bool:
        res = await self._col.update_one(
            {"_id": ObjectId(request_id), "status": "pending"},
            {
                "$set": {
                    "status": status,
                    "resolved_at": _utc_now(),
                    "resolved_by": resolved_by.strip(),
                }
            },
        )
        return res.matched_count > 0
