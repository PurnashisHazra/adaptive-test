from typing import List

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps_auth import require_admin
from app.schemas.consultation_request import ConsultationRequestAdminItem, ConsultationRequestOut
from app.services.consultation_request_service import ConsultationRequestService

router = APIRouter(prefix="/admin/consultation-requests", tags=["admin-consultation"])


def _svc() -> ConsultationRequestService:
    return ConsultationRequestService()


@router.get("", response_model=List[ConsultationRequestAdminItem])
async def list_consultation_requests(_: dict = Depends(require_admin)) -> List[ConsultationRequestAdminItem]:
    return await _svc().list_admin()


@router.post("/{request_id}/mark-reviewed", response_model=ConsultationRequestOut)
async def mark_consultation_reviewed(
    request_id: str,
    _: dict = Depends(require_admin),
) -> ConsultationRequestOut:
    try:
        return await _svc().mark_reviewed(request_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
