from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from motor.motor_asyncio import AsyncIOMotorCollection

from app.db.mongodb import get_database


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def lens_parts(
    subject: Optional[str],
    topic: Optional[str],
    exam_tag: Optional[str],
) -> Tuple[str, str, str]:
    s = (subject or "").strip() or "__any__"
    t = (topic or "").strip() or "__any__"
    e = (exam_tag or "").strip().upper() or "__any__"
    return s, t, e


class StudentCoachPlanRepository:
    def __init__(self) -> None:
        self._col: AsyncIOMotorCollection = get_database()["student_coach_plans"]

    async def ensure_indexes(self) -> None:
        await self._col.create_index(
            [("student_username", 1), ("subject_key", 1), ("topic_key", 1), ("exam_key", 1)],
            unique=True,
        )

    def _filter(
        self,
        student_username: str,
        subject: Optional[str],
        topic: Optional[str],
        exam_tag: Optional[str],
    ) -> Dict[str, Any]:
        u = student_username.strip().lower()
        s, t, e = lens_parts(subject, topic, exam_tag)
        return {
            "student_username": u,
            "subject_key": s,
            "topic_key": t,
            "exam_key": e,
        }

    async def find_one(
        self,
        student_username: str,
        subject: Optional[str],
        topic: Optional[str],
        exam_tag: Optional[str],
    ) -> Optional[Dict[str, Any]]:
        return await self._col.find_one(self._filter(student_username, subject, topic, exam_tag))

    async def list_for_student(self, student_username: str, limit: int = 50) -> List[Dict[str, Any]]:
        u = student_username.strip().lower()
        cursor = self._col.find({"student_username": u}).sort("updated_at", -1).limit(limit)
        return await cursor.to_list(length=limit)

    async def student_has_any_plan(self, student_username: str) -> bool:
        u = student_username.strip().lower()
        doc = await self._col.find_one(
            {
                "student_username": u,
                "$or": [{"time_plan": {"$exists": True, "$ne": None}}, {"accuracy_plan": {"$exists": True, "$ne": None}}],
            }
        )
        return doc is not None

    async def upsert_merge(
        self,
        student_username: str,
        subject: Optional[str],
        topic: Optional[str],
        exam_tag: Optional[str],
        *,
        time_plan: Optional[Dict[str, Any]] = None,
        accuracy_plan: Optional[Dict[str, Any]] = None,
    ) -> None:
        if time_plan is None and accuracy_plan is None:
            return
        now = _utc_now()
        flt = self._filter(student_username, subject, topic, exam_tag)
        s, t, e = lens_parts(subject, topic, exam_tag)
        patch: Dict[str, Any] = {"updated_at": now}
        if time_plan is not None:
            patch["time_plan"] = time_plan
            patch["time_updated_at"] = now
        if accuracy_plan is not None:
            patch["accuracy_plan"] = accuracy_plan
            patch["accuracy_updated_at"] = now
        base = {
            "student_username": flt["student_username"],
            "subject_key": s,
            "topic_key": t,
            "exam_key": e,
            "created_at": now,
        }
        await self._col.update_one(
            flt,
            {"$set": patch, "$setOnInsert": base},
            upsert=True,
        )
