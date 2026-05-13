from typing import List, Optional, Tuple

from bson import ObjectId
from pymongo.errors import DuplicateKeyError

from app.repositories.user_repository import UserRepository
from app.services.paper_service import PaperService
from app.utils.passwords import hash_password


class ProvisioningService:
    """Server-to-server flows (e.g. payment confirmation) that create users and grant paper access."""

    def __init__(self) -> None:
        self._users = UserRepository()
        self._papers = PaperService()

    def _normalize_paper_ids(self, paper_ids: List[str]) -> List[str]:
        out: List[str] = []
        for pid in paper_ids:
            s = str(pid).strip()
            if not ObjectId.is_valid(s):
                raise ValueError(f"Invalid paper_id: {pid}")
            out.append(s)
        return out

    async def provision_student_with_papers(
        self, *, username: str, password: Optional[str], paper_ids: List[str]
    ) -> Tuple[bool, List[str], List[str]]:
        """
        Create a student if missing, then ensure each paper is assigned.

        Returns: (created_new_user, newly_assigned_ids, already_assigned_ids)
        """
        uname = username.strip()
        if not uname:
            raise ValueError("username is required")

        normalized_papers = self._normalize_paper_ids(paper_ids)
        for pid in normalized_papers:
            await self._papers.get_paper(pid)

        existing = await self._users.get_by_username(uname)
        created = False
        if existing:
            role_raw = str(existing.get("role", "student")).strip().lower()
            if role_raw != "student":
                raise ValueError("This username belongs to a non-student account")
        else:
            if not password or len(password) < 8:
                raise ValueError("password is required for new accounts (minimum 8 characters)")
            try:
                await self._users.insert_user(
                    {
                        "username": uname,
                        "role": "student",
                        "password_hash": hash_password(password),
                    }
                )
                created = True
            except DuplicateKeyError:
                existing2 = await self._users.get_by_username(uname)
                if not existing2 or str(existing2.get("role", "student")).strip().lower() != "student":
                    raise ValueError("This username belongs to a non-student account") from None

        newly: List[str] = []
        already: List[str] = []
        for pid in normalized_papers:
            if await self._papers.ensure_assigned(pid, uname):
                newly.append(pid)
            else:
                already.append(pid)

        return created, newly, already
