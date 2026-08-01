from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

from app.schemas.auth import AuthResponse
from app.schemas.mentorship_booking import (
    MENTORSHIP_AMOUNT_INR,
    MENTORSHIP_PAYMENT_WINDOW_SECONDS,
    MentorshipDisplayPhase,
)

PaperUnlockStatus = Literal["pending_payment", "under_review", "confirmed", "rejected"]

PAPER_UNLOCK_AMOUNT_INR = MENTORSHIP_AMOUNT_INR
PAPER_UNLOCK_PAYMENT_WINDOW_SECONDS = MENTORSHIP_PAYMENT_WINDOW_SECONDS


class PaperUnlockCreate(BaseModel):
    paper_id: str = Field(..., min_length=1, max_length=64)


class PaperUnlockSignupCreate(PaperUnlockCreate):
    username: str = Field(..., min_length=1, max_length=200)
    password: str = Field(..., min_length=8)
    mobile: str = Field(..., min_length=10, max_length=15)


class PaperUnlockOut(BaseModel):
    id: str
    student_username: str
    paper_id: str
    paper_title: str
    amount_inr: int
    status: PaperUnlockStatus
    display_phase: MentorshipDisplayPhase
    payment_deadline_at: datetime
    created_at: datetime
    confirmed_at: Optional[datetime] = None
    seconds_remaining: Optional[int] = None


class PaperUnlockSignupResponse(BaseModel):
    unlock: PaperUnlockOut
    auth: Optional[AuthResponse] = None


class PaperUnlockAdminItem(BaseModel):
    id: str
    student_username: str
    paper_id: str
    paper_title: str
    amount_inr: int
    status: PaperUnlockStatus
    payment_deadline_at: datetime
    created_at: datetime


class ExamShowcasePaperOut(BaseModel):
    id: Optional[str] = None
    title: str
    section_count: int = 0
    category: str
    locked: bool = True
    purchasable: bool = False
