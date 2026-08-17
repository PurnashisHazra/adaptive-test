from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorCollection

from app.db.mongodb import get_database


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class QuestionBankFolderRepository:
    KIND_CATEGORY = "category"
    KIND_SUBJECT = "subject"

    def __init__(self) -> None:
        self._col: AsyncIOMotorCollection = get_database()["question_bank_folders"]

    async def ensure_indexes(self) -> None:
        await self._col.create_index(
            [("kind", 1), ("category_key", 1), ("subject_key", 1)],
            unique=True,
        )
        await self._col.create_index([("category_key", 1)])

    async def list_all(self) -> List[Dict[str, Any]]:
        cur = self._col.find({}).sort([("sort_order", 1), ("category_key", 1), ("subject_key", 1)])
        return [d async for d in cur]

    async def get_category(self, category_key: str) -> Optional[Dict[str, Any]]:
        return await self._col.find_one(
            {"kind": self.KIND_CATEGORY, "category_key": category_key},
        )

    async def get_subject(self, category_key: str, subject_key: str) -> Optional[Dict[str, Any]]:
        return await self._col.find_one(
            {
                "kind": self.KIND_SUBJECT,
                "category_key": category_key,
                "subject_key": subject_key,
            },
        )

    async def insert_category(self, category_key: str, display_name: str, sort_order: int = 0) -> Dict[str, Any]:
        now = _utc_now()
        doc = {
            "kind": self.KIND_CATEGORY,
            "category_key": category_key,
            "subject_key": None,
            "display_name": display_name,
            "sort_order": sort_order,
            "created_at": now,
            "updated_at": now,
        }
        await self._col.insert_one(doc)
        return doc

    async def insert_subject(self, category_key: str, subject_key: str, sort_order: int = 0) -> Dict[str, Any]:
        now = _utc_now()
        doc = {
            "kind": self.KIND_SUBJECT,
            "category_key": category_key,
            "subject_key": subject_key,
            "display_name": subject_key,
            "sort_order": sort_order,
            "created_at": now,
            "updated_at": now,
        }
        await self._col.insert_one(doc)
        return doc

    async def update_category(self, category_key: str, patch: Dict[str, Any]) -> bool:
        patch = dict(patch)
        patch["updated_at"] = _utc_now()
        res = await self._col.update_one(
            {"kind": self.KIND_CATEGORY, "category_key": category_key},
            {"$set": patch},
        )
        return res.matched_count > 0

    async def update_subject(self, category_key: str, subject_key: str, patch: Dict[str, Any]) -> bool:
        patch = dict(patch)
        patch["updated_at"] = _utc_now()
        res = await self._col.update_one(
            {
                "kind": self.KIND_SUBJECT,
                "category_key": category_key,
                "subject_key": subject_key,
            },
            {"$set": patch},
        )
        return res.matched_count > 0

    async def rename_category_key(self, old_key: str, new_key: str) -> int:
        res = await self._col.update_many(
            {"category_key": old_key},
            {"$set": {"category_key": new_key, "updated_at": _utc_now()}},
        )
        return int(res.modified_count)

    async def rename_subject_key(self, category_key: str, old_subject: str, new_subject: str) -> int:
        res = await self._col.update_many(
            {
                "kind": self.KIND_SUBJECT,
                "category_key": category_key,
                "subject_key": old_subject,
            },
            {"$set": {"subject_key": new_subject, "display_name": new_subject, "updated_at": _utc_now()}},
        )
        return int(res.modified_count)

    async def delete_category_tree(self, category_key: str) -> int:
        res = await self._col.delete_many({"category_key": category_key})
        return int(res.deleted_count)

    async def delete_subject(self, category_key: str, subject_key: str) -> bool:
        res = await self._col.delete_one(
            {
                "kind": self.KIND_SUBJECT,
                "category_key": category_key,
                "subject_key": subject_key,
            },
        )
        return res.deleted_count > 0
