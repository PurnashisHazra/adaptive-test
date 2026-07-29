from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

from app.schemas.auth import AuthResponse

MentorshipBookingStatus = Literal["pending_payment", "under_review", "confirmed", "rejected"]
MentorshipDisplayPhase = Literal["pay_now", "under_review", "confirmed", "rejected"]

MENTORSHIP_AMOUNT_INR = 100
MENTORSHIP_PAYMENT_WINDOW_SECONDS = 300


class MentorshipBookingCreate(BaseModel):
    session_date: date
    session_time: str = Field(..., min_length=4, max_length=8, pattern=r"^\d{2}:\d{2}$")
    pre_meet_question: str = Field(..., min_length=10, max_length=2000)


class MentorshipBookingSignupCreate(MentorshipBookingCreate):
    username: str = Field(..., min_length=1, max_length=200)
    password: str = Field(..., min_length=8)
    mobile: str = Field(..., min_length=10, max_length=15)


class MentorshipBookingOut(BaseModel):
    id: str
    student_username: str
    session_date: date
    session_time: str
    pre_meet_question: str
    amount_inr: int
    status: MentorshipBookingStatus
    display_phase: MentorshipDisplayPhase
    payment_deadline_at: datetime
    created_at: datetime
    confirmed_at: Optional[datetime] = None
    seconds_remaining: Optional[int] = None


class MentorshipBookingSignupResponse(BaseModel):
    booking: MentorshipBookingOut
    auth: Optional[AuthResponse] = None


class MentorshipBookingAdminItem(BaseModel):
    id: str
    student_username: str
    session_date: date
    session_time: str
    pre_meet_question: str
    amount_inr: int
    status: MentorshipBookingStatus
    payment_deadline_at: datetime
    created_at: datetime
