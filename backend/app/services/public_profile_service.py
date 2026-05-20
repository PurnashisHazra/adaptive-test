from typing import Any, Dict, List, Optional

from app.repositories.student_public_profile_repository import (
    StudentPublicProfileRepository,
    normalize_profile_slug,
)
from app.schemas.public_profile import PublicProfileOut, PublicProfileUpdate


class PublicProfileService:
    def __init__(self) -> None:
        self._profiles = StudentPublicProfileRepository()

    def _out(self, doc: Dict[str, Any]) -> PublicProfileOut:
        return PublicProfileOut(
            profile_slug=str(doc["profile_slug"]),
            display_name=str(doc.get("display_name") or doc["student_username"]),
            bio=str(doc.get("bio") or ""),
            updated_at=doc.get("updated_at"),
        )

    async def ensure_for_student(self, student_username: str) -> PublicProfileOut:
        uname = student_username.strip()
        existing = await self._profiles.get_by_username(uname)
        if existing:
            return self._out(existing)
        slug = normalize_profile_slug(uname)
        if await self._profiles.slug_taken(slug, except_username=uname):
            slug = normalize_profile_slug(f"{uname}-{uname[:4]}")
        doc = await self._profiles.upsert(uname, profile_slug=slug, display_name=uname)
        return self._out(doc)

    async def get_public_by_slug(self, profile_slug: str) -> PublicProfileOut:
        doc = await self._profiles.get_by_slug(profile_slug)
        if not doc:
            raise ValueError("Profile not found")
        return self._out(doc)

    async def get_own(self, student_username: str) -> PublicProfileOut:
        return await self.ensure_for_student(student_username)

    async def update_own(self, student_username: str, body: PublicProfileUpdate) -> PublicProfileOut:
        uname = student_username.strip()
        await self.ensure_for_student(uname)
        if body.profile_slug is not None:
            slug = normalize_profile_slug(body.profile_slug)
            if len(slug) < 2:
                raise ValueError("Profile URL must be at least 2 characters")
            if await self._profiles.slug_taken(slug, except_username=uname):
                raise ValueError("This profile URL is already taken")
        doc = await self._profiles.upsert(
            uname,
            profile_slug=body.profile_slug,
            display_name=body.display_name,
            bio=body.bio,
        )
        return self._out(doc)

    async def brief_for_usernames(
        self, usernames: List[str]
    ) -> Dict[str, Dict[str, str]]:
        """Map username -> {profile_slug, display_name}."""
        rows = await self._profiles.get_many_by_usernames(usernames)
        out: Dict[str, Dict[str, str]] = {}
        for u in usernames:
            un = u.strip()
            doc = rows.get(un)
            if doc:
                out[un] = {
                    "profile_slug": str(doc["profile_slug"]),
                    "display_name": str(doc.get("display_name") or un),
                }
            else:
                slug = normalize_profile_slug(un)
                out[un] = {"profile_slug": slug, "display_name": un}
        return out
