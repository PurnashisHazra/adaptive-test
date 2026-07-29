from fastapi import APIRouter, Depends, HTTPException

from app.api.deps_auth import require_admin, require_student
from app.schemas.mentorship_booking import (
    MentorshipBookingCreate,
    MentorshipBookingOut,
    MentorshipBookingSignupCreate,
    MentorshipBookingSignupResponse,
)
from app.services.mentorship_booking_service import MentorshipBookingService

router = APIRouter(prefix="/mentorship/bookings", tags=["mentorship"])


def _svc() -> MentorshipBookingService:
    return MentorshipBookingService()


@router.post("", response_model=MentorshipBookingOut)
async def create_booking(
    body: MentorshipBookingCreate,
    claims: dict = Depends(require_student),
) -> MentorshipBookingOut:
    try:
        return await _svc().create_for_student(str(claims.get("sub", "")), body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/with-signup", response_model=MentorshipBookingSignupResponse)
async def create_booking_with_signup(body: MentorshipBookingSignupCreate) -> MentorshipBookingSignupResponse:
    try:
        return await _svc().create_with_signup(body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/{booking_id}", response_model=MentorshipBookingOut)
async def get_booking(
    booking_id: str,
    claims: dict = Depends(require_student),
) -> MentorshipBookingOut:
    try:
        return await _svc().get_for_student(booking_id, str(claims.get("sub", "")))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
