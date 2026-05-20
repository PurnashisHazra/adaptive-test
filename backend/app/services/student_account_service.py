from typing import Any, Dict, Optional

from app.repositories.user_repository import UserRepository
from app.schemas.auth import Role
from app.schemas.student_account import StudentAccountOut, StudentAccountUpdate
from app.services.auth_service import normalize_mobile
from app.utils.roles import parse_role


class StudentAccountService:
    def __init__(self) -> None:
        self._users = UserRepository()

    def _out(self, user: Dict[str, Any]) -> StudentAccountOut:
        role = parse_role(user.get("role", "student"))
        assigned = user.get("assigned_admin_code")
        return StudentAccountOut(
            username=user["username"],
            mobile=str(user["mobile"]) if user.get("mobile") else None,
            needs_admin_code=role == Role.student and not assigned,
            assigned_admin_code=str(assigned) if assigned else None,
        )

    async def get_account(self, username: str) -> StudentAccountOut:
        user = await self._users.get_by_username(username)
        if not user:
            raise ValueError("User not found")
        if parse_role(user.get("role", "student")) != Role.student:
            raise ValueError("Not a student account")
        return self._out(user)

    async def update_account(self, username: str, body: StudentAccountUpdate) -> StudentAccountOut:
        user = await self._users.get_by_username(username)
        if not user:
            raise ValueError("User not found")
        if parse_role(user.get("role", "student")) != Role.student:
            raise ValueError("Not a student account")
        patch: Dict[str, Any] = {}
        if body.mobile is not None:
            patch["mobile"] = normalize_mobile(body.mobile)
        if not patch:
            return self._out(user)
        updated = await self._users.update_user(username, patch)
        assert updated is not None
        return self._out(updated)
