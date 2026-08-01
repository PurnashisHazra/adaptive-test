from datetime import datetime, timedelta
from typing import List, Optional

from app.services.landing_showcase_service import LandingShowcaseService
from app.repositories.paper_repository import PaperRepository
from app.repositories.paper_unlock_repository import PaperUnlockRepository
from app.schemas.auth import AuthResponse, SignupRequest
from app.schemas.mentorship_booking import MentorshipDisplayPhase
from app.schemas.paper_unlock import (
    PAPER_UNLOCK_AMOUNT_INR,
    PAPER_UNLOCK_PAYMENT_WINDOW_SECONDS,
    ExamShowcasePaperOut,
    PaperUnlockAdminItem,
    PaperUnlockCreate,
    PaperUnlockOut,
    PaperUnlockSignupCreate,
    PaperUnlockSignupResponse,
)
from app.services.auth_service import AuthService
from app.services.paper_service import PaperService
from app.utils.ids import oid_str
from app.utils.ist_time import ensure_utc, utc_now


class PaperUnlockService:
    def __init__(self) -> None:
        self._purchases = PaperUnlockRepository()
        self._papers = PaperRepository()
        self._paper_svc = PaperService()
        self._auth = AuthService()
        self._showcase = LandingShowcaseService()

    async def ensure_indexes(self) -> None:
        await self._purchases.ensure_indexes()

    async def list_showcase_for_category(
        self,
        category: str,
        *,
        student_username: Optional[str] = None,
    ) -> List[ExamShowcasePaperOut]:
        return await self._showcase.list_for_category(category, student_username=student_username)

    async def create_for_student(self, student_username: str, body: PaperUnlockCreate) -> PaperUnlockOut:
        paper_id = body.paper_id.strip()
        paper = await self._papers.get_paper(paper_id)
        if not paper:
            raise ValueError("Question paper not found")
        uname = student_username.strip()
        if await self._papers.has_assignment(paper_id, uname):
            raise ValueError("This paper is already assigned to you")

        existing = await self._purchases.find_open_for_student_paper(uname, paper_id)
        if existing:
            return await self._to_out(existing, str(paper.get("title", "")))

        now = utc_now()
        pid = await self._purchases.insert(
            {
                "student_username": uname,
                "paper_id": paper_id,
                "paper_title": str(paper.get("title", "")),
                "amount_inr": PAPER_UNLOCK_AMOUNT_INR,
                "status": "pending_payment",
                "payment_deadline_at": now + timedelta(seconds=PAPER_UNLOCK_PAYMENT_WINDOW_SECONDS),
            }
        )
        row = await self._purchases.get(pid)
        assert row is not None
        return await self._to_out(row, str(paper.get("title", "")))

    async def create_with_signup(self, body: PaperUnlockSignupCreate) -> PaperUnlockSignupResponse:
        auth = await self._auth.signup(
            SignupRequest(
                username=body.username.strip(),
                password=body.password,
                mobile=body.mobile.strip(),
            )
        )
        unlock = await self.create_for_student(auth.user.username, PaperUnlockCreate(paper_id=body.paper_id))
        return PaperUnlockSignupResponse(unlock=unlock, auth=auth)

    async def get_for_student(self, purchase_id: str, student_username: str) -> PaperUnlockOut:
        row = await self._purchases.get(purchase_id)
        if not row or str(row.get("student_username")) != student_username.strip():
            raise ValueError("Purchase not found")
        return await self._to_out(row, str(row.get("paper_title", "")))

    async def list_pending_admin(self) -> List[PaperUnlockAdminItem]:
        rows = await self._purchases.list_pending_admin()
        return [self._to_admin_item(r) for r in rows]

    async def approve(self, admin_username: str, purchase_id: str) -> PaperUnlockOut:
        row = await self._purchases.get(purchase_id)
        if not row:
            raise ValueError("Purchase not found")
        if str(row.get("status")) not in ("pending_payment", "under_review"):
            raise ValueError("Purchase is not awaiting approval")
        paper_id = str(row.get("paper_id", ""))
        student_username = str(row.get("student_username", ""))
        ok = await self._purchases.update_status(
            purchase_id,
            from_statuses=["pending_payment", "under_review"],
            to_status="confirmed",
            extra={
                "confirmed_at": utc_now(),
                "approved_by": admin_username.strip(),
            },
        )
        if not ok:
            raise ValueError("Purchase not found")
        await self._paper_svc.ensure_assigned(paper_id, student_username)
        row = await self._purchases.get(purchase_id)
        assert row is not None
        return await self._to_out(row, str(row.get("paper_title", "")))

    async def reject(self, admin_username: str, purchase_id: str) -> PaperUnlockOut:
        ok = await self._purchases.update_status(
            purchase_id,
            from_statuses=["pending_payment", "under_review"],
            to_status="rejected",
            extra={"rejected_by": admin_username.strip(), "rejected_at": utc_now()},
        )
        if not ok:
            raise ValueError("Purchase not found")
        row = await self._purchases.get(purchase_id)
        assert row is not None
        return await self._to_out(row, str(row.get("paper_title", "")))

    async def _to_out(self, row: dict, paper_title: str) -> PaperUnlockOut:
        deadline = row["payment_deadline_at"]
        if isinstance(deadline, str):
            deadline = datetime.fromisoformat(deadline.replace("Z", "+00:00"))
        deadline = ensure_utc(deadline)
        if row.get("status") == "pending_payment":
            await self._purchases.mark_under_review_if_expired(oid_str(row["_id"]), deadline)
            refreshed = await self._purchases.get(oid_str(row["_id"]))
            if refreshed:
                row = refreshed

        status = str(row.get("status", "pending_payment"))
        now = utc_now()
        seconds_remaining: Optional[int] = None
        display_phase: MentorshipDisplayPhase = "pay_now"

        if status == "confirmed":
            display_phase = "confirmed"
        elif status == "rejected":
            display_phase = "rejected"
        elif status == "under_review":
            display_phase = "under_review"
        elif status == "pending_payment":
            remaining = int((deadline - now).total_seconds())
            if remaining <= 0:
                display_phase = "under_review"
                seconds_remaining = 0
            else:
                display_phase = "pay_now"
                seconds_remaining = remaining

        return PaperUnlockOut(
            id=oid_str(row["_id"]),
            student_username=str(row["student_username"]),
            paper_id=str(row["paper_id"]),
            paper_title=paper_title or str(row.get("paper_title", "")),
            amount_inr=int(row.get("amount_inr", PAPER_UNLOCK_AMOUNT_INR)),
            status=status,  # type: ignore[arg-type]
            display_phase=display_phase,
            payment_deadline_at=deadline,
            created_at=row["created_at"],
            confirmed_at=row.get("confirmed_at"),
            seconds_remaining=seconds_remaining,
        )

    @staticmethod
    def _to_admin_item(row: dict) -> PaperUnlockAdminItem:
        return PaperUnlockAdminItem(
            id=oid_str(row["_id"]),
            student_username=str(row["student_username"]),
            paper_id=str(row["paper_id"]),
            paper_title=str(row.get("paper_title", "")),
            amount_inr=int(row.get("amount_inr", PAPER_UNLOCK_AMOUNT_INR)),
            status=str(row.get("status")),  # type: ignore[arg-type]
            payment_deadline_at=row["payment_deadline_at"],
            created_at=row["created_at"],
        )
