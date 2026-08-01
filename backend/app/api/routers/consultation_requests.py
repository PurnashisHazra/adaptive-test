from fastapi import APIRouter, Depends, HTTPException

from app.api.deps_auth import require_student
from app.schemas.consultation_request import (
    ConsultationRequestCreate,
    ConsultationRequestOut,
    ConsultationRequestSignupCreate,
    ConsultationRequestSignupResponse,
)
from app.services.consultation_request_service import ConsultationRequestService

router = APIRouter(prefix="/consultation/requests", tags=["consultation"])


def _svc() -> ConsultationRequestService:
    return ConsultationRequestService()


@router.post("", response_model=ConsultationRequestOut)
async def create_consultation_request(
    body: ConsultationRequestCreate,
    claims: dict = Depends(require_student),
) -> ConsultationRequestOut:
    try:
        return await _svc().create_for_student(str(claims.get("sub", "")), body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/with-signup", response_model=ConsultationRequestSignupResponse)
async def create_consultation_with_signup(
    body: ConsultationRequestSignupCreate,
) -> ConsultationRequestSignupResponse:
    try:
        return await _svc().create_with_signup(body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
