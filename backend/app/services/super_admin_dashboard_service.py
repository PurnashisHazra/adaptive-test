import secrets
from typing import List, Optional

from app.repositories.user_repository import UserRepository
from app.schemas.admin_limits import AdminLimits, AdminLimitsUsage
from app.schemas.auth import Role
from app.schemas.super_admin_dashboard import SuperAdminUserRow
from app.services.admin_limits_service import AdminLimitsService, admin_limits_to_doc, parse_admin_limits
from app.utils.roles import normalize_admin_code, parse_role


class SuperAdminDashboardService:
    def __init__(self) -> None:
        self._users = UserRepository()

    def _row(self, doc: dict, *, usage: Optional[AdminLimitsUsage] = None) -> SuperAdminUserRow:
        role = parse_role(doc.get("role", "student"))
        limits = None
        if role == Role.admin:
            limits = parse_admin_limits(doc.get("admin_limits"))
        return SuperAdminUserRow(
            username=doc["username"],
            role=role,
            admin_code=doc.get("admin_code"),
            assigned_admin_code=doc.get("assigned_admin_code"),
            admin_limits=limits,
            admin_limits_usage=usage,
            created_at=doc.get("created_at"),
            updated_at=doc.get("updated_at"),
        )

    async def list_users(self) -> List[SuperAdminUserRow]:
        limits_svc = AdminLimitsService()
        rows = await self._users.list_all_users()
        out: List[SuperAdminUserRow] = []
        for d in rows:
            usage = None
            if parse_role(d.get("role", "student")) == Role.admin:
                try:
                    usage = await limits_svc.get_usage(d["username"])
                except ValueError:
                    usage = None
            out.append(self._row(d, usage=usage))
        return out

    async def update_admin_limits(self, username: str, limits: AdminLimits) -> SuperAdminUserRow:
        user = await self._users.get_by_username(username.strip())
        if not user:
            raise ValueError("User not found")
        if parse_role(user.get("role", "")) != Role.admin:
            raise ValueError("Limits apply only to admin accounts")
        for label, val in (
            ("max_papers", limits.max_papers),
            ("max_students", limits.max_students),
            ("max_monthly_student_attempts", limits.max_monthly_student_attempts),
        ):
            if val is not None and int(val) < 1:
                raise ValueError(f"{label} must be at least 1 or empty for unlimited")
        updated = await self._users.update_user(username, {"admin_limits": admin_limits_to_doc(limits)})
        assert updated is not None
        usage = await AdminLimitsService().get_usage(username)
        return self._row(updated, usage=usage)

    async def update_role(
        self,
        username: str,
        role: Role,
        *,
        actor_username: str,
        actor_role: Role,
    ) -> SuperAdminUserRow:
        target = username.strip()
        user = await self._users.get_by_username(target)
        if not user:
            raise ValueError("User not found")

        current = parse_role(user.get("role", ""))
        if actor_role != Role.god:
            if current == Role.god or role == Role.god:
                raise ValueError("Only a god account can assign or change the god role")

        if actor_username.strip() == target and current == Role.god and role != Role.god:
            remaining = await self._users.count_by_role(Role.god.value)
            if remaining <= 1:
                raise ValueError("Cannot remove the last god account")

        patch: dict = {"role": role.value}
        if role == Role.student:
            patch["admin_code"] = None
        elif role == Role.admin:
            if not user.get("admin_code"):
                patch["admin_code"] = await self._new_unique_admin_code()
            patch["assigned_admin_code"] = None
        elif role in (Role.super_admin, Role.god):
            patch["admin_code"] = None
            patch["assigned_admin_code"] = None

        updated = await self._users.update_user(target, patch)
        assert updated is not None
        return self._row(updated)

    async def set_admin_code(self, username: str, admin_code: str) -> SuperAdminUserRow:
        target = username.strip()
        user = await self._users.get_by_username(target)
        if not user:
            raise ValueError("User not found")
        if parse_role(user.get("role", "")) != Role.admin:
            raise ValueError("Admin codes apply only to admin accounts")

        code = normalize_admin_code(admin_code)
        if not code:
            raise ValueError("Admin code cannot be empty")
        if await self._users.admin_code_taken(code, except_username=target):
            raise ValueError("That admin code is already in use")

        updated = await self._users.update_user(target, {"admin_code": code})
        assert updated is not None
        return self._row(updated)

    async def generate_admin_code(self, username: str) -> SuperAdminUserRow:
        target = username.strip()
        user = await self._users.get_by_username(target)
        if not user:
            raise ValueError("User not found")
        if parse_role(user.get("role", "")) != Role.admin:
            raise ValueError("Admin codes apply only to admin accounts")

        code = await self._new_unique_admin_code(except_username=target)
        updated = await self._users.update_user(target, {"admin_code": code})
        assert updated is not None
        return self._row(updated)

    async def _new_unique_admin_code(self, *, except_username: Optional[str] = None) -> str:
        for _ in range(30):
            code = normalize_admin_code(secrets.token_hex(3))
            if not await self._users.admin_code_taken(code, except_username=except_username):
                return code
        raise ValueError("Could not generate a unique admin code; try setting one manually")
