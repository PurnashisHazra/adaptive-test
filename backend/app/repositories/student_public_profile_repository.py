import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorCollection

from app.db.mongodb import get_database


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def normalize_profile_slug(raw: str) -> str:
    s = str(raw).strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return (s[:64] if s else "student")


class StudentPublicProfileRepository:
    def __init__(self) -> None:
        self._col: AsyncIOMotorCollection = get_database()["student_public_profiles"]

    async def ensure_indexes(self) -> None:
        await self._col.create_index([("student_username", 1)], unique=True)
        await self._col.create_index([("profile_slug", 1)], unique=True)

    async def get_by_username(self, student_username: str) -> Optional[Dict[str, Any]]:
        return await self._col.find_one({"student_username": student_username.strip()})

    async def get_by_slug(self, profile_slug: str) -> Optional[Dict[str, Any]]:
        slug = normalize_profile_slug(profile_slug)
        return await self._col.find_one({"profile_slug": slug})

    async def slug_taken(self, profile_slug: str, *, except_username: Optional[str] = None) -> bool:
        slug = normalize_profile_slug(profile_slug)
        filt: Dict[str, Any] = {"profile_slug": slug}
        if except_username:
            filt["student_username"] = {"$ne": except_username.strip()}
        n = await self._col.count_documents(filt, limit=1)
        return n > 0

    async def upsert(
        self,
        student_username: str,
        *,
        profile_slug: Optional[str] = None,
        display_name: Optional[str] = None,
        bio: Optional[str] = None,
    ) -> Dict[str, Any]:
        uname = student_username.strip()
        existing = await self.get_by_username(uname)
        slug = normalize_profile_slug(profile_slug or (existing or {}).get("profile_slug") or uname)
        name = (display_name or (existing or {}).get("display_name") or uname).strip()[:120]
        bio_val = bio if bio is not None else str((existing or {}).get("bio") or "")
        doc = {
            "student_username": uname,
            "profile_slug": slug,
            "display_name": name or uname,
            "bio": str(bio_val).strip()[:1000],
            "updated_at": _utc_now(),
        }
        await self._col.update_one(
            {"student_username": uname},
            {"$set": doc, "$setOnInsert": {"created_at": _utc_now()}},
            upsert=True,
        )
        row = await self.get_by_username(uname)
        assert row is not None
        return row

    async def get_many_by_usernames(self, usernames: List[str]) -> Dict[str, Dict[str, Any]]:
        names = [u.strip() for u in usernames if u and str(u).strip()]
        if not names:
            return {}
        cur = self._col.find({"student_username": {"$in": names}})
        out: Dict[str, Dict[str, Any]] = {}
        async for d in cur:
            out[str(d["student_username"])] = d
        return out
