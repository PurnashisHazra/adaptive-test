import random
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorCollection

from app.db.mongodb import get_database
from app.models.domain import Difficulty, QuestionType
from app.utils.ids import oid_str


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class QuestionRepository:
    def __init__(self) -> None:
        self._col: AsyncIOMotorCollection = get_database()["questions"]

    async def ensure_indexes(self) -> None:
        await self._col.create_index([("subject", 1), ("topic", 1), ("difficulty", 1)])
        await self._col.create_index([("question_text", "text")])

    def _doc_to_admin(self, doc: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "id": oid_str(doc["_id"]),
            "question_text": doc["question_text"],
            "question_type": doc["question_type"],
            "options": doc.get("options", []),
            "correct_answer": doc["correct_answer"],
            "explanation": doc.get("explanation"),
            "image_url": doc.get("image_url"),
            "difficulty": doc["difficulty"],
            "subject": doc.get("subject", "General"),
            "topic": doc.get("topic", "General"),
            "tags": doc.get("tags", []),
            "is_ai_generated": bool(doc.get("is_ai_generated", False)),
            "created_at": doc["created_at"],
            "updated_at": doc["updated_at"],
        }

    async def insert_one(self, data: Dict[str, Any]) -> str:
        now = _utc_now()
        data.setdefault("created_at", now)
        data.setdefault("updated_at", now)
        res = await self._col.insert_one(data)
        return oid_str(res.inserted_id)

    async def update_one(self, qid: str, patch: Dict[str, Any]) -> bool:
        oid = ObjectId(qid)
        patch["updated_at"] = _utc_now()
        res = await self._col.update_one({"_id": oid}, {"$set": patch})
        return res.matched_count > 0

    async def delete_one(self, qid: str) -> bool:
        res = await self._col.delete_one({"_id": ObjectId(qid)})
        return res.deleted_count > 0

    async def delete_all(self) -> int:
        res = await self._col.delete_many({})
        return int(res.deleted_count)

    async def iter_all_docs(self):
        cursor = self._col.find({}).sort("updated_at", -1)
        async for doc in cursor:
            yield doc

    async def get_by_id(self, qid: str) -> Optional[Dict[str, Any]]:
        doc = await self._col.find_one({"_id": ObjectId(qid)})
        return doc

    async def count(self, query: Optional[Dict[str, Any]] = None) -> int:
        return await self._col.count_documents(query or {})

    def _build_filter(
        self,
        subject: Optional[str] = None,
        topic: Optional[str] = None,
        difficulty: Optional[Difficulty] = None,
        search: Optional[str] = None,
        question_type: Optional[str] = None,
    ) -> Dict[str, Any]:
        q: Dict[str, Any] = {}
        if subject:
            q["subject"] = subject
        if topic:
            q["topic"] = topic
        if difficulty:
            q["difficulty"] = difficulty.value
        if question_type and str(question_type).strip():
            q["question_type"] = str(question_type).strip().lower()
        if search:
            q["$or"] = [
                {"question_text": {"$regex": search, "$options": "i"}},
                {"tags": {"$regex": search, "$options": "i"}},
            ]
        return q

    async def list_paginated(
        self,
        subject: Optional[str] = None,
        topic: Optional[str] = None,
        difficulty: Optional[Difficulty] = None,
        search: Optional[str] = None,
        question_type: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[List[Dict[str, Any]], int]:
        filt = self._build_filter(subject, topic, difficulty, search, question_type)
        total = await self._col.count_documents(filt)
        cursor = (
            self._col.find(filt)
            .sort("updated_at", -1)
            .skip((page - 1) * page_size)
            .limit(page_size)
        )
        items = [self._doc_to_admin(d) async for d in cursor]
        return items, total

    async def find_ids_by_text_hash(self, question_text: str) -> List[str]:
        """Simple duplicate detection by normalized text."""
        norm = " ".join(question_text.lower().split())
        cursor = self._col.find({"question_text_norm": norm}, {"_id": 1})
        return [oid_str(d["_id"]) async for d in cursor]

    async def list_ids_by_difficulty_excluding(
        self,
        difficulty: Difficulty,
        exclude_ids: Sequence[str],
        subject: Optional[str] = None,
        topic: Optional[str] = None,
        exam_tag: Optional[str] = None,
    ) -> List[ObjectId]:
        filt: Dict[str, Any] = {"difficulty": difficulty.value}
        if exclude_ids:
            filt["_id"] = {"$nin": [ObjectId(x) for x in exclude_ids]}
        if subject:
            filt["subject"] = subject
        if topic:
            filt["topic"] = topic
        if exam_tag:
            filt["tags"] = {"$in": [str(exam_tag).strip().upper()]}
        cursor = self._col.find(filt, {"_id": 1})
        return [d["_id"] async for d in cursor]

    async def pick_random_id(
        self,
        difficulty: Difficulty,
        exclude_ids: Sequence[str],
        subject: Optional[str] = None,
        topic: Optional[str] = None,
        exam_tag: Optional[str] = None,
    ) -> Optional[str]:
        ids = await self.list_ids_by_difficulty_excluding(difficulty, exclude_ids, subject, topic, exam_tag)
        if not ids:
            return None
        return oid_str(random.choice(ids))

    async def list_topics(self, subject: Optional[str] = None) -> List[str]:
        filt: Dict[str, Any] = {}
        if subject:
            filt["subject"] = subject
        vals = await self._col.distinct("topic", filt)
        cleaned = [str(v).strip() for v in vals if str(v).strip()]
        return sorted(set(cleaned), key=lambda x: x.lower())

    async def list_subjects(self) -> List[str]:
        vals = await self._col.distinct("subject", {})
        cleaned = [str(v).strip() for v in vals if str(v).strip()]
        return sorted(set(cleaned), key=lambda x: x.lower())
