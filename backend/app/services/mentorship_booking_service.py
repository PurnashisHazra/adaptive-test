from datetime import date, datetime, timedelta, timezone
from typing import List, Optional

from app.repositories.mentorship_booking_repository import MentorshipBookingRepository
from app.schemas.auth import AuthResponse, SignupRequest
from app.schemas.mentorship_booking import (
    MENTORSHIP_AMOUNT_INR,
    MENTORSHIP_PAYMENT_WINDOW_SECONDS,
    MentorshipBookingAdminItem,
    MentorshipBookingCreate,
    MentorshipBookingOut,
    MentorshipBookingSignupCreate,
    MentorshipBookingSignupResponse,
    MentorshipDisplayPhase,
)
from app.services.auth_service import AuthService
from app.utils.ids import oid_str
from app.utils.ist_time import ensure_utc, utc_now


class MentorshipBookingService:
    def __init__(self) -> None:
        self._bookings = MentorshipBookingRepository()
        self._auth = AuthService()

    async def ensure_indexes(self) -> None:
        await self._bookings.ensure_indexes()

    async def create_for_student(
        self,
        student_username: str,
        body: MentorshipBookingCreate,
    ) -> MentorshipBookingOut:
        self._validate_session_datetime(body.session_date, body.session_time)
        now = utc_now()
        bid = await self._bookings.insert(
            {
                "student_username": student_username.strip(),
                "session_date": body.session_date.isoformat(),
                "session_time": body.session_time.strip(),
                "pre_meet_question": body.pre_meet_question.strip(),
                "amount_inr": MENTORSHIP_AMOUNT_INR,
                "status": "pending_payment",
                "payment_deadline_at": now + timedelta(seconds=MENTORSHIP_PAYMENT_WINDOW_SECONDS),
            }
        )
        row = await self._bookings.get(bid)
        assert row is not None
        return await self._to_out(row)

    async def create_with_signup(self, body: MentorshipBookingSignupCreate) -> MentorshipBookingSignupResponse:
        auth = await self._auth.signup(
            SignupRequest(
                username=body.username.strip(),
                password=body.password,
                mobile=body.mobile.strip(),
            )
        )
        booking = await self.create_for_student(
            auth.user.username,
            MentorshipBookingCreate(
                session_date=body.session_date,
                session_time=body.session_time,
                pre_meet_question=body.pre_meet_question,
            ),
        )
        return MentorshipBookingSignupResponse(booking=booking, auth=auth)

    async def get_for_student(self, booking_id: str, student_username: str) -> MentorshipBookingOut:
        row = await self._bookings.get(booking_id)
        if not row or str(row.get("student_username")) != student_username.strip():
            raise ValueError("Booking not found")
        return await self._to_out(row)

    async def list_pending_admin(self) -> List[MentorshipBookingAdminItem]:
        rows = await self._bookings.list_pending_admin()
        return [self._to_admin_item(r) for r in rows]

    async def approve(self, admin_username: str, booking_id: str) -> MentorshipBookingOut:
        row = await self._bookings.get(booking_id)
        if not row:
            raise ValueError("Booking not found")
        if str(row.get("status")) not in ("pending_payment", "under_review"):
            raise ValueError("Booking is not awaiting approval")
        ok = await self._bookings.update_status(
            booking_id,
            from_statuses=["pending_payment", "under_review"],
            to_status="confirmed",
            extra={
                "confirmed_at": utc_now(),
                "approved_by": admin_username.strip(),
            },
        )
        if not ok:
            raise ValueError("Booking not found")
        row = await self._bookings.get(booking_id)
        assert row is not None
        return await self._to_out(row)

    async def reject(self, admin_username: str, booking_id: str) -> MentorshipBookingOut:
        ok = await self._bookings.update_status(
            booking_id,
            from_statuses=["pending_payment", "under_review"],
            to_status="rejected",
            extra={"rejected_by": admin_username.strip(), "rejected_at": utc_now()},
        )
        if not ok:
            raise ValueError("Booking not found")
        row = await self._bookings.get(booking_id)
        assert row is not None
        return await self._to_out(row)

    async def _to_out(self, row: dict) -> MentorshipBookingOut:
        deadline = row["payment_deadline_at"]
        if isinstance(deadline, str):
            deadline = datetime.fromisoformat(deadline.replace("Z", "+00:00"))
        deadline = ensure_utc(deadline)
        if row.get("status") == "pending_payment":
            await self._bookings.mark_under_review_if_expired(oid_str(row["_id"]), deadline)
            refreshed = await self._bookings.get(oid_str(row["_id"]))
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

        session_date_raw = row.get("session_date")
        if isinstance(session_date_raw, str):
            session_date = date.fromisoformat(session_date_raw)
        else:
            session_date = session_date_raw

        return MentorshipBookingOut(
            id=oid_str(row["_id"]),
            student_username=str(row["student_username"]),
            session_date=session_date,
            session_time=str(row["session_time"]),
            pre_meet_question=str(row["pre_meet_question"]),
            amount_inr=int(row.get("amount_inr", MENTORSHIP_AMOUNT_INR)),
            status=status,  # type: ignore[arg-type]
            display_phase=display_phase,
            payment_deadline_at=deadline,
            created_at=row["created_at"],
            confirmed_at=row.get("confirmed_at"),
            seconds_remaining=seconds_remaining,
        )

    @staticmethod
    def _to_admin_item(row: dict) -> MentorshipBookingAdminItem:
        session_date_raw = row.get("session_date")
        if isinstance(session_date_raw, str):
            session_date = date.fromisoformat(session_date_raw)
        else:
            session_date = session_date_raw
        return MentorshipBookingAdminItem(
            id=oid_str(row["_id"]),
            student_username=str(row["student_username"]),
            session_date=session_date,
            session_time=str(row["session_time"]),
            pre_meet_question=str(row["pre_meet_question"]),
            amount_inr=int(row.get("amount_inr", MENTORSHIP_AMOUNT_INR)),
            status=str(row.get("status")),  # type: ignore[arg-type]
            payment_deadline_at=row["payment_deadline_at"],
            created_at=row["created_at"],
        )

    @staticmethod
    def _validate_session_datetime(session_date: date, session_time: str) -> None:
        try:
            hour, minute = session_time.split(":")
            scheduled = datetime(
                session_date.year,
                session_date.month,
                session_date.day,
                int(hour),
                int(minute),
                tzinfo=timezone.utc,
            )
        except (ValueError, TypeError) as exc:
            raise ValueError("Invalid session date or time") from exc
        if scheduled <= utc_now():
            raise ValueError("Session must be scheduled in the future")
