from datetime import datetime
from typing import Any, Dict, List, Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorCollection

from app.db.mongodb import get_database
from app.utils.ids import oid_str
from app.utils.ist_time import ensure_utc, utc_now


class MentorshipBookingRepository:
    def __init__(self) -> None:
        self._col: AsyncIOMotorCollection = get_database()["mentorship_bookings"]

    async def ensure_indexes(self) -> None:
        await self._col.create_index([("student_username", 1), ("created_at", -1)])
        await self._col.create_index([("status", 1), ("created_at", -1)])

    async def insert(self, doc: Dict[str, Any]) -> str:
        now = utc_now()
        doc.setdefault("created_at", now)
        doc.setdefault("updated_at", now)
        res = await self._col.insert_one(doc)
        return oid_str(res.inserted_id)

    async def get(self, booking_id: str) -> Optional[Dict[str, Any]]:
        try:
            return await self._col.find_one({"_id": ObjectId(booking_id)})
        except Exception:
            return None

    async def list_pending_admin(self) -> List[Dict[str, Any]]:
        cur = self._col.find({"status": {"$in": ["pending_payment", "under_review"]}}).sort("created_at", -1)
        return [d async for d in cur]

    async def update_status(
        self,
        booking_id: str,
        *,
        from_statuses: List[str],
        to_status: str,
        extra: Optional[Dict[str, Any]] = None,
    ) -> bool:
        patch: Dict[str, Any] = {"status": to_status, "updated_at": utc_now()}
        if extra:
            patch.update(extra)
        res = await self._col.update_one(
            {"_id": ObjectId(booking_id), "status": {"$in": from_statuses}},
            {"$set": patch},
        )
        return res.matched_count > 0

    async def mark_under_review_if_expired(self, booking_id: str, deadline: datetime) -> bool:
        now = utc_now()
        deadline = ensure_utc(deadline)
        if now <= deadline:
            return False
        res = await self._col.update_one(
            {"_id": ObjectId(booking_id), "status": "pending_payment"},
            {"$set": {"status": "under_review", "updated_at": now}},
        )
        return res.matched_count > 0
