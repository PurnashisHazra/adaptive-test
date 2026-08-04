from datetime import datetime
from typing import Any, Dict, List, Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorCollection

from app.db.mongodb import get_database
from app.utils.ids import oid_str
from app.utils.ist_time import utc_now


class ReadingPassageRepository:
    def __init__(self) -> None:
        self._col: AsyncIOMotorCollection = get_database()["reading_passages"]

    async def ensure_indexes(self) -> None:
        await self._col.create_index([("created_at", -1)])
        await self._col.create_index([("title", "text")])

    async def insert(self, doc: Dict[str, Any]) -> str:
        now = utc_now()
        doc.setdefault("created_at", now)
        doc.setdefault("updated_at", now)
        res = await self._col.insert_one(doc)
        return oid_str(res.inserted_id)

    async def get(self, passage_id: str) -> Optional[Dict[str, Any]]:
        try:
            return await self._col.find_one({"_id": ObjectId(passage_id)})
        except Exception:
            return None

    async def update(self, passage_id: str, patch: Dict[str, Any]) -> bool:
        patch["updated_at"] = utc_now()
        res = await self._col.update_one({"_id": ObjectId(passage_id)}, {"$set": patch})
        return res.matched_count > 0

    async def delete(self, passage_id: str) -> bool:
        res = await self._col.delete_one({"_id": ObjectId(passage_id)})
        return res.deleted_count > 0

    async def list_all(self, *, limit: int = 200) -> List[Dict[str, Any]]:
        cur = self._col.find({}).sort("created_at", -1).limit(limit)
        return [d async for d in cur]

    @staticmethod
    def to_admin_dict(doc: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "id": oid_str(doc["_id"]),
            "title": str(doc.get("title", "")),
            "passage_text": str(doc.get("passage_text", "")),
            "image_url": doc.get("image_url"),
            "subject": str(doc.get("subject", "Verbal Ability")),
            "topic": str(doc.get("topic", "Reading Comprehension")),
            "tags": list(doc.get("tags") or []),
            "sub_question_count": int(doc.get("sub_question_count", 0)),
            "created_at": doc["created_at"],
            "updated_at": doc["updated_at"],
        }
