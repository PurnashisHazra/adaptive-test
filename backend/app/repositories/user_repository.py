from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorCollection

from app.db.mongodb import get_database
from app.utils.roles import normalize_admin_code


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class UserRepository:
    def __init__(self) -> None:
        self._col: AsyncIOMotorCollection = get_database()["users"]

    async def ensure_indexes(self) -> None:
        await self._col.create_index([("username", 1)], unique=True)
        await self._col.create_index(
            [("admin_code", 1)],
            unique=True,
            partialFilterExpression={"admin_code": {"$type": "string"}},
        )
        await self._col.create_index([("assigned_admin_code", 1), ("role", 1)])
        await self._col.create_index([("role", 1), ("created_at", -1)])

    async def get_by_username(self, username: str) -> Optional[Dict[str, Any]]:
        return await self._col.find_one({"username": username.strip()})

    async def get_admin_by_code(self, admin_code: str) -> Optional[Dict[str, Any]]:
        code = normalize_admin_code(admin_code)
        if not code:
            return None
        return await self._col.find_one({"role": "admin", "admin_code": code})

    async def insert_user(self, doc: Dict[str, Any]) -> None:
        doc = dict(doc)
        doc.setdefault("created_at", _utc_now())
        doc.setdefault("updated_at", _utc_now())
        if doc.get("admin_code"):
            doc["admin_code"] = normalize_admin_code(doc["admin_code"])
        if doc.get("assigned_admin_code"):
            doc["assigned_admin_code"] = normalize_admin_code(doc["assigned_admin_code"])
        await self._col.insert_one(doc)

    async def update_user(self, username: str, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        doc = dict(patch)
        doc["updated_at"] = _utc_now()
        if "admin_code" in doc and doc["admin_code"] is not None:
            doc["admin_code"] = normalize_admin_code(doc["admin_code"])
        if "assigned_admin_code" in doc and doc["assigned_admin_code"] is not None:
            doc["assigned_admin_code"] = normalize_admin_code(doc["assigned_admin_code"])
        await self._col.update_one({"username": username.strip()}, {"$set": doc})
        return await self.get_by_username(username)

    async def list_by_role(self, role: str, limit: int = 500) -> List[Dict[str, Any]]:
        cur = self._col.find({"role": role}).sort("username", 1).limit(limit)
        return [d async for d in cur]

    async def list_students_by_admin_code(self, admin_code: str, limit: int = 500) -> List[Dict[str, Any]]:
        code = normalize_admin_code(admin_code)
        cur = self._col.find({"role": "student", "assigned_admin_code": code}).sort("username", 1).limit(limit)
        return [d async for d in cur]

    async def count_students_by_admin_code(self, admin_code: str) -> int:
        code = normalize_admin_code(admin_code)
        return await self._col.count_documents({"role": "student", "assigned_admin_code": code})

    async def list_all_users(self, limit: int = 2000) -> List[Dict[str, Any]]:
        cur = self._col.find({}).sort("username", 1).limit(limit)
        return [d async for d in cur]

    async def count_by_role(self, role: str) -> int:
        return await self._col.count_documents({"role": str(role).strip()})

    async def admin_code_taken(self, admin_code: str, *, except_username: Optional[str] = None) -> bool:
        code = normalize_admin_code(admin_code)
        filt: Dict[str, Any] = {"admin_code": code}
        if except_username:
            filt["username"] = {"$ne": except_username.strip()}
        n = await self._col.count_documents(filt, limit=1)
        return n > 0

    async def list_recent_students(self, *, limit: int = 12) -> List[Dict[str, Any]]:
        cur = (
            self._col.find(
                {
                    "role": "student",
                    "username": {"$not": {"$regex": "^guest_"}},
                },
                projection={"username": 1, "created_at": 1, "role": 1},
            )
            .sort("created_at", -1)
            .limit(int(limit))
        )
        return [d async for d in cur]
