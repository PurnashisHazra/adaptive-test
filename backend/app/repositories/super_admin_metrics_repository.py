from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Tuple

from motor.motor_asyncio import AsyncIOMotorCollection, AsyncIOMotorDatabase

from app.db.mongodb import get_database
from app.utils.ist_time import utc_now

_UNLINKED = [{"$exists": False}, None, ""]


def lookback_windows(now: Optional[datetime] = None) -> Tuple[datetime, datetime, datetime, datetime]:
    generated = now if now is not None else utc_now()
    if generated.tzinfo is None:
        generated = generated.replace(tzinfo=timezone.utc)
    return (
        generated - timedelta(days=1),
        generated - timedelta(days=7),
        generated - timedelta(days=30),
        generated,
    )


class SuperAdminMetricsRepository:
    def __init__(self) -> None:
        db: AsyncIOMotorDatabase = get_database()
        self._users: AsyncIOMotorCollection = db["users"]
        self._test_attempts: AsyncIOMotorCollection = db["test_attempts"]
        self._paper_attempts: AsyncIOMotorCollection = db["paper_attempts"]
        self._challenge_attempts: AsyncIOMotorCollection = db["challenge_attempts"]
        self._mentorship: AsyncIOMotorCollection = db["mentorship_bookings"]
        self._paper_unlocks: AsyncIOMotorCollection = db["paper_unlock_purchases"]
        self._consultations: AsyncIOMotorCollection = db["consultation_requests"]
        self._leader_connect: AsyncIOMotorCollection = db["leader_connect_requests"]
        self._questions: AsyncIOMotorCollection = db["questions"]
        self._papers: AsyncIOMotorCollection = db["question_papers"]
        self._challenges: AsyncIOMotorCollection = db["challenges"]

    @staticmethod
    def _since(field: str, start: Optional[datetime], extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        filt: Dict[str, Any] = dict(extra or {})
        if start is not None:
            filt[field] = {"$gte": start}
        return filt

    async def count(self, col: AsyncIOMotorCollection, filt: Optional[Dict[str, Any]] = None) -> int:
        return int(await col.count_documents(filt or {}))

    async def period_counts(
        self,
        col: AsyncIOMotorCollection,
        field: str,
        starts: Tuple[datetime, datetime, datetime],
        extra: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, int]:
        day, week, month = starts
        return {
            "last_day": await self.count(col, self._since(field, day, extra)),
            "last_week": await self.count(col, self._since(field, week, extra)),
            "last_month": await self.count(col, self._since(field, month, extra)),
            "all_time": await self.count(col, extra),
        }

    async def sum_amount(
        self,
        col: AsyncIOMotorCollection,
        *,
        extra: Optional[Dict[str, Any]] = None,
        date_field: str = "confirmed_at",
        start: Optional[datetime] = None,
    ) -> int:
        match = dict(extra or {})
        if start is not None:
            match[date_field] = {"$gte": start}
        pipeline = [
            {"$match": match},
            {
                "$group": {
                    "_id": None,
                    "amount": {"$sum": {"$ifNull": ["$amount_inr", 0]}},
                }
            },
        ]
        row = None
        async for doc in col.aggregate(pipeline):
            row = doc
            break
        return int((row or {}).get("amount") or 0)

    async def period_amounts(
        self,
        col: AsyncIOMotorCollection,
        starts: Tuple[datetime, datetime, datetime],
        extra: Dict[str, Any],
        date_field: str = "confirmed_at",
    ) -> Dict[str, int]:
        day, week, month = starts
        return {
            "last_day": await self.sum_amount(col, extra=extra, date_field=date_field, start=day),
            "last_week": await self.sum_amount(col, extra=extra, date_field=date_field, start=week),
            "last_month": await self.sum_amount(col, extra=extra, date_field=date_field, start=month),
            "all_time": await self.sum_amount(col, extra=extra, date_field=date_field),
        }

    @staticmethod
    def standalone_test_filter() -> Dict[str, Any]:
        return {
            "$and": [
                {"$or": [{"paper_attempt_id": v} for v in _UNLINKED]},
                {"$or": [{"challenge_attempt_id": v} for v in _UNLINKED]},
            ]
        }

    @property
    def users(self) -> AsyncIOMotorCollection:
        return self._users

    @property
    def test_attempts(self) -> AsyncIOMotorCollection:
        return self._test_attempts

    @property
    def paper_attempts(self) -> AsyncIOMotorCollection:
        return self._paper_attempts

    @property
    def challenge_attempts(self) -> AsyncIOMotorCollection:
        return self._challenge_attempts

    @property
    def mentorship(self) -> AsyncIOMotorCollection:
        return self._mentorship

    @property
    def paper_unlocks(self) -> AsyncIOMotorCollection:
        return self._paper_unlocks

    @property
    def consultations(self) -> AsyncIOMotorCollection:
        return self._consultations

    @property
    def leader_connect(self) -> AsyncIOMotorCollection:
        return self._leader_connect

    @property
    def questions(self) -> AsyncIOMotorCollection:
        return self._questions

    @property
    def papers(self) -> AsyncIOMotorCollection:
        return self._papers

    @property
    def challenges(self) -> AsyncIOMotorCollection:
        return self._challenges
