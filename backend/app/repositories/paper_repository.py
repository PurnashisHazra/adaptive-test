from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorCollection

from app.db.mongodb import get_database
from app.utils.ids import oid_str


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class PaperRepository:
    def __init__(self) -> None:
        db = get_database()
        self._papers: AsyncIOMotorCollection = db["question_papers"]
        self._assign: AsyncIOMotorCollection = db["paper_assignments"]
        self._attempts: AsyncIOMotorCollection = db["paper_attempts"]

    async def ensure_indexes(self) -> None:
        await self._papers.create_index([("created_at", -1)])
        await self._assign.create_index([("paper_id", 1), ("student_username", 1)], unique=True)
        await self._attempts.create_index([("paper_id", 1), ("student_username", 1)], unique=True)

    async def insert_paper(self, doc: Dict[str, Any]) -> str:
        doc.setdefault("created_at", _utc_now())
        doc.setdefault("updated_at", _utc_now())
        res = await self._papers.insert_one(doc)
        return oid_str(res.inserted_id)

    async def get_paper(self, paper_id: str) -> Optional[Dict[str, Any]]:
        return await self._papers.find_one({"_id": ObjectId(paper_id)})

    async def update_paper(self, paper_id: str, patch: Dict[str, Any]) -> bool:
        patch = dict(patch)
        patch["updated_at"] = _utc_now()
        res = await self._papers.update_one({"_id": ObjectId(paper_id)}, {"$set": patch})
        return res.matched_count > 0

    async def list_papers(self, skip: int = 0, limit: int = 200) -> List[Dict[str, Any]]:
        cur = self._papers.find({}).sort("created_at", -1).skip(skip).limit(limit)
        return [d async for d in cur]

    async def upsert_assignment(self, paper_id: str, student_username: str) -> None:
        await self._assign.update_one(
            {"paper_id": paper_id, "student_username": student_username.strip()},
            {
                "$set": {
                    "paper_id": paper_id,
                    "student_username": student_username.strip(),
                    "assigned_at": _utc_now(),
                }
            },
            upsert=True,
        )

    async def sync_assignments_for_paper(self, paper_id: str, usernames: List[str]) -> None:
        normalized = sorted({u.strip() for u in usernames if u and str(u).strip()})
        if normalized:
            await self._assign.delete_many({"paper_id": paper_id, "student_username": {"$nin": normalized}})
        else:
            await self._assign.delete_many({"paper_id": paper_id})
        for u in normalized:
            await self.upsert_assignment(paper_id, u)

    async def remove_assignment(self, paper_id: str, student_username: str) -> bool:
        res = await self._assign.delete_one({"paper_id": paper_id, "student_username": student_username.strip()})
        return res.deleted_count > 0

    async def list_assignments_for_paper(self, paper_id: str) -> List[Dict[str, Any]]:
        cur = self._assign.find({"paper_id": paper_id}).sort("assigned_at", -1)
        return [d async for d in cur]

    async def list_assignments_for_student(self, student_username: str) -> List[Dict[str, Any]]:
        cur = self._assign.find({"student_username": student_username.strip()}).sort("assigned_at", -1)
        return [d async for d in cur]

    async def has_assignment(self, paper_id: str, student_username: str) -> bool:
        n = await self._assign.count_documents(
            {"paper_id": paper_id, "student_username": student_username.strip()}, limit=1
        )
        return n > 0

    async def insert_paper_attempt(self, doc: Dict[str, Any]) -> str:
        doc.setdefault("started_at", _utc_now())
        res = await self._attempts.insert_one(doc)
        return oid_str(res.inserted_id)

    async def get_paper_attempt(self, paper_attempt_id: str) -> Optional[Dict[str, Any]]:
        return await self._attempts.find_one({"_id": ObjectId(paper_attempt_id)})

    async def list_paper_attempts_for_student(self, student_username: str, limit: int = 100) -> List[Dict[str, Any]]:
        cur = self._attempts.find({"student_username": student_username.strip()}).sort("started_at", -1).limit(limit)
        return [d async for d in cur]

    async def find_paper_attempt(self, paper_id: str, student_username: str) -> Optional[Dict[str, Any]]:
        return await self._attempts.find_one(
            {"paper_id": paper_id, "student_username": student_username.strip()}
        )

    async def update_paper_attempt(self, paper_attempt_id: str, patch: Dict[str, Any]) -> bool:
        res = await self._attempts.update_one({"_id": ObjectId(paper_attempt_id)}, {"$set": patch})
        return res.matched_count > 0

    async def list_scored_attempts_for_paper(self, paper_id: str) -> List[Dict[str, Any]]:
        """Paper attempts with a final score (completed or ended early), for cohort percentiles."""
        cur = self._attempts.find(
            {
                "paper_id": paper_id,
                "status": {"$in": ["completed", "ended_early"]},
                "total_marks": {"$exists": True, "$ne": None},
            },
            projection={"_id": 1, "total_marks": 1},
        )
        return [d async for d in cur]
