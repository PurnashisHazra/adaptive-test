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
        await self._challenges.create_index([("created_at", -1)])
        await self._challenges.create_index([("launch_at", -1)])
        await self._assign.create_index([("challenge_id", 1), ("student_username", 1)], unique=True)
        await self._attempts.create_index(
            [("challenge_id", 1), ("student_username", 1)],
            unique=True,
        )
        await self._attempts.create_index([("challenge_id", 1), ("status", 1)])
        await self._attempts.create_index([("completed_at", -1), ("total_marks", -1)])

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
        cur = self._challenges.find({}).sort("created_at", -1).skip(skip).limit(limit)
        return [d async for d in cur]

    async def count_challenges(self) -> int:
        return int(await self._challenges.count_documents({}))

    async def list_challenges_by_created(self, skip: int, limit: int) -> List[Dict[str, Any]]:
        cur = self._challenges.find({}).sort("created_at", -1).skip(skip).limit(limit)
        return [d async for d in cur]

    async def list_all_challenges(self) -> List[Dict[str, Any]]:
        cur = self._challenges.find({})
        return [d async for d in cur]

    async def list_assigned_challenge_ids(self, student_username: str) -> List[str]:
        cur = self._assign.find(
            {"student_username": student_username.strip()},
            {"challenge_id": 1},
        )
        return [str(d["challenge_id"]) async for d in cur]

    async def find_attempts_for_student_on_challenges(
        self,
        student_username: str,
        challenge_ids: List[str],
    ) -> Dict[str, Dict[str, Any]]:
        if not challenge_ids:
            return {}
        cur = self._attempts.find(
            {
                "student_username": student_username.strip(),
                "challenge_id": {"$in": challenge_ids},
            }
        )
        out: Dict[str, Dict[str, Any]] = {}
        async for doc in cur:
            out[str(doc["challenge_id"])] = doc
        return out

    async def aggregate_attempt_counts(self, challenge_ids: List[str]) -> Dict[str, Dict[str, int]]:
        """Per challenge: participants_count (any attempt), ranked_count (scored)."""
        if not challenge_ids:
            return {}
        pipeline = [
            {"$match": {"challenge_id": {"$in": challenge_ids}}},
            {
                "$group": {
                    "_id": "$challenge_id",
                    "participants_count": {"$sum": 1},
                    "ranked_count": {
                        "$sum": {
                            "$cond": [
                                {
                                    "$and": [
                                        {"$in": ["$status", ["completed", "ended_early"]]},
                                        {"$in": [{"$type": "$total_marks"}, ["double", "int", "long", "decimal"]]},
                                    ]
                                },
                                1,
                                0,
                            ]
                        }
                    },
                }
            },
        ]
        out: Dict[str, Dict[str, int]] = {}
        async for row in self._attempts.aggregate(pipeline):
            cid = str(row["_id"])
            out[cid] = {
                "participants_count": int(row.get("participants_count", 0)),
                "ranked_count": int(row.get("ranked_count", 0)),
            }
        return out

    async def participant_previews_for_challenges(
        self,
        challenge_ids: List[str],
        *,
        limit_per: int = 8,
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Latest N participants per challenge (username + completed flag), one aggregation."""
        if not challenge_ids or limit_per <= 0:
            return {}
        pipeline = [
            {"$match": {"challenge_id": {"$in": challenge_ids}}},
            {"$sort": {"started_at": -1}},
            {
                "$group": {
                    "_id": "$challenge_id",
                    "rows": {
                        "$push": {
                            "student_username": "$student_username",
                            "completed": {
                                "$in": [
                                    "$status",
                                    ["completed", "ended_early"],
                                ]
                            },
                        }
                    },
                }
            },
            {"$project": {"rows": {"$slice": ["$rows", limit_per]}}},
        ]
        out: Dict[str, List[Dict[str, Any]]] = {cid: [] for cid in challenge_ids}
        async for doc in self._attempts.aggregate(pipeline):
            cid = str(doc.get("_id", ""))
            if cid in out:
                out[cid] = list(doc.get("rows") or [])
        return out

    async def list_attempt_usernames_paginated(
        self,
        challenge_id: str,
        *,
        skip: int = 0,
        limit: int = 20,
    ) -> tuple[List[Dict[str, Any]], int]:
        filt = {"challenge_id": challenge_id.strip()}
        total = int(await self._attempts.count_documents(filt))
        cur = (
            self._attempts.find(
                filt,
                projection={"student_username": 1, "status": 1, "started_at": 1},
            )
            .sort("started_at", -1)
            .skip(skip)
            .limit(limit)
        )
        rows = [d async for d in cur]
        return rows, total

    async def list_ranked_attempts_for_challenges(
        self, challenge_ids: List[str]
    ) -> Dict[str, List[Dict[str, Any]]]:
        if not challenge_ids:
            return {}
        cur = self._attempts.find(
            {
                "challenge_id": {"$in": challenge_ids},
                "status": {"$in": ["completed", "ended_early"]},
                "total_marks": {"$exists": True, "$ne": None},
            },
            projection={"challenge_id": 1, "student_username": 1, "total_marks": 1},
        )
        grouped: Dict[str, List[Dict[str, Any]]] = {cid: [] for cid in challenge_ids}
        async for doc in cur:
            cid = str(doc.get("challenge_id", ""))
            if cid in grouped:
                grouped[cid].append(doc)
        return grouped

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

    async def list_challenge_attempts_for_student(self, student_username: str) -> List[Dict[str, Any]]:
        cur = self._attempts.find({"student_username": student_username.strip()}).sort("started_at", -1)
        return [d async for d in cur]

    async def get_challenges_by_ids(self, challenge_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        out: Dict[str, Dict[str, Any]] = {}
        for cid in {str(x).strip() for x in challenge_ids if str(x).strip()}:
            doc = await self.get_challenge(cid)
            if doc:
                out[cid] = doc
        return out

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

    async def find_latest_completed_attempt(self) -> Optional[Dict[str, Any]]:
        doc = await self._attempts.find_one(
            {
                "status": {"$in": ["completed", "ended_early"]},
                "total_marks": {"$exists": True, "$ne": None},
            },
            projection={
                "student_username": 1,
                "display_name": 1,
                "total_marks": 1,
                "challenge_id": 1,
                "completed_at": 1,
                "status": 1,
            },
            sort=[("completed_at", -1)],
        )
        return doc

    async def find_top_completed_for_challenge(
        self,
        challenge_id: str,
        *,
        limit: int = 16,
    ) -> List[Dict[str, Any]]:
        cid = challenge_id.strip()
        if not cid:
            return []
        cur = (
            self._attempts.find(
                {
                    "challenge_id": cid,
                    "status": {"$in": ["completed", "ended_early"]},
                    "total_marks": {"$exists": True, "$ne": None},
                },
                projection={
                    "student_username": 1,
                    "display_name": 1,
                    "total_marks": 1,
                    "challenge_id": 1,
                    "completed_at": 1,
                    "status": 1,
                },
            )
            .sort("total_marks", -1)
            .limit(limit)
        )
        return [d async for d in cur]
