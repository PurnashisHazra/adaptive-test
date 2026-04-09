from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorCollection

from app.db.mongodb import get_database


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class UserRepository:
    def __init__(self) -> None:
        self._col: AsyncIOMotorCollection = get_database()["users"]

    async def ensure_indexes(self) -> None:
        await self._col.create_index([("username", 1)], unique=True)

    async def get_by_username(self, username: str) -> Optional[Dict[str, Any]]:
        return await self._col.find_one({"username": username})

    async def insert_user(self, doc: Dict[str, Any]) -> None:
        doc = dict(doc)
        doc.setdefault("created_at", _utc_now())
        doc.setdefault("updated_at", _utc_now())
        await self._col.insert_one(doc)

    async def list_by_role(self, role: str, limit: int = 500) -> List[Dict[str, Any]]:
        cur = self._col.find({"role": role}).sort("username", 1).limit(limit)
        return [d async for d in cur]

