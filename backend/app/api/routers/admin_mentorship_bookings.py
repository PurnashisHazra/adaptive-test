from typing import List

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps_auth import require_admin
from app.schemas.mentorship_booking import MentorshipBookingAdminItem, MentorshipBookingOut
from app.services.mentorship_booking_service import MentorshipBookingService

router = APIRouter(prefix="/admin/mentorship-bookings", tags=["admin-mentorship"])


def _svc() -> MentorshipBookingService:
    return MentorshipBookingService()


@router.get("/pending", response_model=List[MentorshipBookingAdminItem])
async def list_pending_bookings(_: dict = Depends(require_admin)) -> List[MentorshipBookingAdminItem]:
    return await _svc().list_pending_admin()


@router.post("/{booking_id}/approve", response_model=MentorshipBookingOut)
async def approve_booking(
    booking_id: str,
    claims: dict = Depends(require_admin),
) -> MentorshipBookingOut:
    try:
        return await _svc().approve(str(claims.get("sub", "")), booking_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/{booking_id}/reject", response_model=MentorshipBookingOut)
async def reject_booking(
    booking_id: str,
    claims: dict = Depends(require_admin),
) -> MentorshipBookingOut:
    try:
        return await _svc().reject(str(claims.get("sub", "")), booking_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
