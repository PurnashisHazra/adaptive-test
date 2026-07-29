from datetime import datetime
from typing import Any, Dict, List, Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorCollection

from app.db.mongodb import get_database
from app.utils.ids import oid_str
from app.utils.ist_time import utc_now


class LeaderConnectRepository:
    def __init__(self) -> None:
        self._col: AsyncIOMotorCollection = get_database()["leader_connect_requests"]

    async def ensure_indexes(self) -> None:
        await self._col.create_index([("status", 1), ("created_at", -1)])
        await self._col.create_index([("created_at", -1)])

    async def insert(self, doc: Dict[str, Any]) -> str:
        now = utc_now()
        doc.setdefault("status", "pending")
        doc.setdefault("created_at", now)
        res = await self._col.insert_one(doc)
        return oid_str(res.inserted_id)

    async def get(self, request_id: str) -> Optional[Dict[str, Any]]:
        try:
            return await self._col.find_one({"_id": ObjectId(request_id)})
        except Exception:
            return None

    async def list_for_admin(self, *, limit: int = 200) -> List[Dict[str, Any]]:
        cur = self._col.find({}).sort("created_at", -1).limit(limit)
        return [d async for d in cur]

    async def mark_reviewed(self, request_id: str) -> bool:
        res = await self._col.update_one(
            {"_id": ObjectId(request_id), "status": "pending"},
            {"$set": {"status": "reviewed", "reviewed_at": utc_now()}},
        )
        return res.matched_count > 0
