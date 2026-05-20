from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorCollection

from app.db.mongodb import get_database
from app.utils.ids import oid_str


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ChallengeRepository:
    def __init__(self) -> None:
        db = get_database()
        self._challenges: AsyncIOMotorCollection = db["challenges"]
        self._assign: AsyncIOMotorCollection = db["challenge_assignments"]
        self._attempts: AsyncIOMotorCollection = db["challenge_attempts"]

    async def ensure_indexes(self) -> None:
        await self._challenges.create_index([("launch_at", -1)])
        await self._assign.create_index([("challenge_id", 1), ("student_username", 1)], unique=True)
        await self._attempts.create_index([("challenge_id", 1), ("student_username", 1)], unique=True)

    async def insert_challenge(self, doc: Dict[str, Any]) -> str:
        doc.setdefault("created_at", _utc_now())
        doc.setdefault("updated_at", _utc_now())
        res = await self._challenges.insert_one(doc)
        return oid_str(res.inserted_id)

    async def get_challenge(self, challenge_id: str) -> Optional[Dict[str, Any]]:
        return await self._challenges.find_one({"_id": ObjectId(challenge_id)})

    async def update_challenge(self, challenge_id: str, patch: Dict[str, Any]) -> bool:
        patch = dict(patch)
        patch["updated_at"] = _utc_now()
        res = await self._challenges.update_one({"_id": ObjectId(challenge_id)}, {"$set": patch})
        return res.matched_count > 0

    async def list_challenges(self, skip: int = 0, limit: int = 200) -> List[Dict[str, Any]]:
        cur = self._challenges.find({}).sort("launch_at", -1).skip(skip).limit(limit)
        return [d async for d in cur]

    async def upsert_assignment(self, challenge_id: str, student_username: str) -> None:
        await self._assign.update_one(
            {"challenge_id": challenge_id, "student_username": student_username.strip()},
            {
                "$set": {
                    "challenge_id": challenge_id,
                    "student_username": student_username.strip(),
                    "assigned_at": _utc_now(),
                }
            },
            upsert=True,
        )

    async def sync_assignments_for_challenge(self, challenge_id: str, usernames: List[str]) -> None:
        normalized = sorted({u.strip() for u in usernames if u and str(u).strip()})
        if normalized:
            await self._assign.delete_many({"challenge_id": challenge_id, "student_username": {"$nin": normalized}})
        else:
            await self._assign.delete_many({"challenge_id": challenge_id})
        for u in normalized:
            await self.upsert_assignment(challenge_id, u)

    async def remove_assignment(self, challenge_id: str, student_username: str) -> bool:
        res = await self._assign.delete_one(
            {"challenge_id": challenge_id, "student_username": student_username.strip()}
        )
        return res.deleted_count > 0

    async def list_assignments_for_challenge(self, challenge_id: str) -> List[Dict[str, Any]]:
        cur = self._assign.find({"challenge_id": challenge_id}).sort("assigned_at", -1)
        return [d async for d in cur]

    async def list_assignments_for_student(self, student_username: str) -> List[Dict[str, Any]]:
        cur = self._assign.find({"student_username": student_username.strip()}).sort("assigned_at", -1)
        return [d async for d in cur]

    async def has_assignment(self, challenge_id: str, student_username: str) -> bool:
        n = await self._assign.count_documents(
            {"challenge_id": challenge_id, "student_username": student_username.strip()}, limit=1
        )
        return n > 0

    async def insert_challenge_attempt(self, doc: Dict[str, Any]) -> str:
        doc.setdefault("started_at", _utc_now())
        res = await self._attempts.insert_one(doc)
        return oid_str(res.inserted_id)

    async def get_challenge_attempt(self, challenge_attempt_id: str) -> Optional[Dict[str, Any]]:
        return await self._attempts.find_one({"_id": ObjectId(challenge_attempt_id)})

    async def find_challenge_attempt(self, challenge_id: str, student_username: str) -> Optional[Dict[str, Any]]:
        return await self._attempts.find_one(
            {"challenge_id": challenge_id, "student_username": student_username.strip()}
        )

    async def update_challenge_attempt(self, challenge_attempt_id: str, patch: Dict[str, Any]) -> bool:
        res = await self._attempts.update_one({"_id": ObjectId(challenge_attempt_id)}, {"$set": patch})
        return res.matched_count > 0

    async def list_attempts_for_challenge(self, challenge_id: str, limit: int = 500) -> List[Dict[str, Any]]:
        cur = (
            self._attempts.find({"challenge_id": challenge_id})
            .sort("started_at", -1)
            .limit(limit)
        )
        return [d async for d in cur]

    async def list_ranked_attempts_for_challenge(self, challenge_id: str) -> List[Dict[str, Any]]:
        """Attempts with a final score, for leaderboard percentiles."""
        cur = self._attempts.find(
            {
                "challenge_id": challenge_id,
                "status": {"$in": ["completed", "ended_early"]},
                "total_marks": {"$exists": True, "$ne": None},
            },
            projection={"student_username": 1, "total_marks": 1, "status": 1},
        )
        return [d async for d in cur]
