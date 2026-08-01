import re
from typing import List

from app.repositories.consultation_request_repository import ConsultationRequestRepository
from app.schemas.auth import AuthResponse, SignupRequest
from app.schemas.consultation_request import (
    ConsultationRequestAdminItem,
    ConsultationRequestCreate,
    ConsultationRequestOut,
    ConsultationRequestSignupCreate,
    ConsultationRequestSignupResponse,
)
from app.services.auth_service import AuthService
from app.utils.ids import oid_str


def _safe_mobile(raw: str) -> str:
    digits = re.sub(r"\D", "", raw.strip())
    if len(digits) < 10:
        raise ValueError("Enter a valid 10-digit mobile number")
    return digits


class ConsultationRequestService:
    def __init__(self) -> None:
        self._repo = ConsultationRequestRepository()
        self._auth = AuthService()

    async def ensure_indexes(self) -> None:
        await self._repo.ensure_indexes()

    async def create_for_student(
        self,
        student_username: str,
        body: ConsultationRequestCreate,
    ) -> ConsultationRequestOut:
        rid = await self._repo.insert(
            {
                "student_username": student_username.strip(),
                "mobile": _safe_mobile(body.mobile),
            }
        )
        row = await self._repo.get(rid)
        assert row is not None
        return self._to_out(row)

    async def create_with_signup(self, body: ConsultationRequestSignupCreate) -> ConsultationRequestSignupResponse:
        auth = await self._auth.signup(
            SignupRequest(
                username=body.username.strip(),
                password=body.password,
                mobile=body.mobile.strip(),
            )
        )
        req = await self.create_for_student(
            auth.user.username,
            ConsultationRequestCreate(mobile=body.mobile),
        )
        return ConsultationRequestSignupResponse(request=req, auth=auth)

    async def list_admin(self) -> List[ConsultationRequestAdminItem]:
        rows = await self._repo.list_for_admin()
        return [self._to_admin_item(r) for r in rows]

    async def mark_reviewed(self, request_id: str) -> ConsultationRequestOut:
        ok = await self._repo.mark_reviewed(request_id)
        if not ok:
            raise ValueError("Request not found or already reviewed")
        row = await self._repo.get(request_id)
        assert row is not None
        return self._to_out(row)

    @staticmethod
    def _to_out(row: dict) -> ConsultationRequestOut:
        return ConsultationRequestOut(
            id=oid_str(row["_id"]),
            student_username=str(row["student_username"]),
            mobile=str(row["mobile"]),
            status=str(row.get("status", "pending")),  # type: ignore[arg-type]
            created_at=row["created_at"],
        )

    @staticmethod
    def _to_admin_item(row: dict) -> ConsultationRequestAdminItem:
        return ConsultationRequestAdminItem(
            id=oid_str(row["_id"]),
            student_username=str(row["student_username"]),
            mobile=str(row["mobile"]),
            status=str(row.get("status", "pending")),  # type: ignore[arg-type]
            created_at=row["created_at"],
        )
