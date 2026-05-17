from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorCollection

from app.db.mongodb import get_database


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_exam_tags(tags: List[str]) -> List[str]:
    out: List[str] = []
    seen: set[str] = set()
    for raw in tags:
        t = str(raw).strip().upper()
        if not t or t in seen:
            continue
        seen.add(t)
        out.append(t)
    return sorted(out)


class StudentProfileRepository:
    def __init__(self) -> None:
        self._col: AsyncIOMotorCollection = get_database()["student_profiles"]

    async def ensure_indexes(self) -> None:
        await self._col.create_index([("student_username", 1)], unique=True)

    async def get(self, student_username: str) -> Optional[Dict[str, Any]]:
        return await self._col.find_one({"student_username": student_username.strip()})

    async def upsert(self, student_username: str, patch: Dict[str, Any]) -> Dict[str, Any]:
        uname = student_username.strip()
        doc = dict(patch)
        doc["student_username"] = uname
        if "allowed_exam_tags" in doc:
            doc["allowed_exam_tags"] = _normalize_exam_tags(list(doc["allowed_exam_tags"]))
        doc["updated_at"] = _utc_now()
        await self._col.update_one(
            {"student_username": uname},
            {"$set": doc, "$setOnInsert": {"created_at": _utc_now()}},
            upsert=True,
        )
        row = await self.get(uname)
        assert row is not None
        return row

    async def list_all(self, limit: int = 500) -> List[Dict[str, Any]]:
        cur = self._col.find({}).sort("student_username", 1).limit(limit)
        return [d async for d in cur]
