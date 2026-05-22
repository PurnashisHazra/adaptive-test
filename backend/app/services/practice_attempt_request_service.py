from typing import List, Optional

from app.repositories.practice_attempt_request_repository import PracticeAttemptRequestRepository
from app.repositories.student_profile_repository import StudentProfileRepository
from app.repositories.user_repository import UserRepository
from app.schemas.practice_attempt_request import (
    PracticeAttemptRequestAdminItem,
    PracticeAttemptRequestCreate,
    PracticeAttemptRequestOut,
)
from app.services.student_profile_service import DEFAULT_PRACTICE_ATTEMPTS_ALLOWANCE, StudentProfileService
from app.utils.ids import oid_str


class PracticeAttemptRequestService:
    def __init__(self) -> None:
        self._requests = PracticeAttemptRequestRepository()
        self._profiles = StudentProfileRepository()
        self._users = UserRepository()
        self._profile_svc = StudentProfileService()

    async def ensure_indexes(self) -> None:
        await self._requests.ensure_indexes()

    async def _admin_code_for(self, admin_username: str) -> Optional[str]:
        admin = await self._users.get_by_username(admin_username.strip())
        if not admin:
            return None
        code = admin.get("admin_code")
        return str(code).strip().upper() if code else None

    async def _student_belongs_to_admin(self, student_username: str, admin_code: str) -> bool:
        user = await self._users.get_by_username(student_username.strip())
        if not user or str(user.get("role", "")).lower() != "student":
            return False
        assigned = user.get("assigned_admin_code")
        return bool(assigned) and str(assigned).strip().upper() == admin_code.strip().upper()

    async def create_request(
        self,
        student_username: str,
        body: PracticeAttemptRequestCreate,
    ) -> PracticeAttemptRequestOut:
        uname = student_username.strip()
        controls = await self._profile_svc.get_session_controls(uname)
        if controls.blocked:
            raise ValueError(controls.block_reason or "Cannot request attempts while blocked")
        if controls.can_start_practice_test:
            raise ValueError("You still have practice attempts available")
        if controls.has_pending_practice_request:
            raise ValueError("You already have a pending request")

        msg = (body.message or "").strip() or None
        rid = await self._requests.insert(
            {
                "student_username": uname,
                "status": "pending",
                "message": msg,
            }
        )
        row = await self._requests.get(rid)
        assert row is not None
        return self._to_out(row)

    async def list_pending_admin(self, admin_username: str) -> List[PracticeAttemptRequestAdminItem]:
        admin_code = await self._admin_code_for(admin_username)
        if not admin_code:
            return []
        students = await self._users.list_students_by_admin_code(admin_code)
        usernames = [u["username"] for u in students]
        rows = await self._requests.list_pending_for_students(usernames)
        profiles = {p["student_username"]: p for p in await self._profiles.list_all()}
        out: List[PracticeAttemptRequestAdminItem] = []
        for row in rows:
            uname = str(row["student_username"])
            doc = profiles.get(uname) or {}
            used = await self._profile_svc._attempts_used(uname)
            eff = self._profile_svc._effective_allowance(doc)
            out.append(
                PracticeAttemptRequestAdminItem(
                    id=oid_str(row["_id"]),
                    student_username=uname,
                    display_name=(doc.get("display_name") or "").strip() or None,
                    status="pending",
                    message=row.get("message"),
                    requested_at=row["requested_at"],
                    practice_attempts_used=used,
                    practice_attempts_allowance=eff,
                )
            )
        return out

    async def approve(self, admin_username: str, request_id: str) -> PracticeAttemptRequestOut:
        return await self._resolve(admin_username, request_id, approved=True)

    async def deny(self, admin_username: str, request_id: str) -> PracticeAttemptRequestOut:
        return await self._resolve(admin_username, request_id, approved=False)

    async def _resolve(
        self,
        admin_username: str,
        request_id: str,
        *,
        approved: bool,
    ) -> PracticeAttemptRequestOut:
        admin_code = await self._admin_code_for(admin_username)
        if not admin_code:
            raise ValueError("Admin code not configured")
        row = await self._requests.get(request_id)
        if not row or str(row.get("status")) != "pending":
            raise ValueError("Request not found")
        uname = str(row["student_username"])
        if not await self._student_belongs_to_admin(uname, admin_code):
            raise ValueError("Request not found")

        if approved:
            doc = await self._profile_svc.get_or_create_doc(uname)
            used = await self._profile_svc._attempts_used(uname)
            eff = self._profile_svc._effective_allowance(doc)
            if eff is None:
                new_allowance = used + 1
            else:
                new_allowance = max(int(eff), used) + 1
            await self._profiles.upsert(
                uname,
                {
                    "practice_attempts_allowance": new_allowance,
                    "practice_attempts_unlimited": False,
                },
            )

        ok = await self._requests.resolve(
            request_id,
            status="approved" if approved else "denied",
            resolved_by=admin_username,
        )
        if not ok:
            raise ValueError("Request not found")
        row = await self._requests.get(request_id)
        assert row is not None
        return self._to_out(row)

    @staticmethod
    def _to_out(row: dict) -> PracticeAttemptRequestOut:
        return PracticeAttemptRequestOut(
            id=oid_str(row["_id"]),
            student_username=str(row["student_username"]),
            status=str(row["status"]),
            message=row.get("message"),
            requested_at=row["requested_at"],
            resolved_at=row.get("resolved_at"),
            resolved_by=row.get("resolved_by"),
        )
