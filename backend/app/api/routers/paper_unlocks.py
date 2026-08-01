from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps_auth import get_optional_claims, require_student
from app.schemas.paper_unlock import (
    ExamShowcasePaperOut,
    PaperUnlockCreate,
    PaperUnlockOut,
    PaperUnlockSignupCreate,
    PaperUnlockSignupResponse,
)
from app.services.paper_unlock_service import PaperUnlockService

router = APIRouter(tags=["paper-unlock"])


def _svc() -> PaperUnlockService:
    return PaperUnlockService()


@router.get("/public/exam-showcase/{category}", response_model=List[ExamShowcasePaperOut])
async def list_exam_showcase_papers(
    category: str,
    claims: Optional[dict] = Depends(get_optional_claims),
) -> List[ExamShowcasePaperOut]:
    student_username = str(claims.get("sub", "")).strip() if claims else None
    if student_username and str(claims.get("role", "")) != "student":
        student_username = None
    try:
        return await _svc().list_showcase_for_category(category, student_username=student_username)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.post("/paper-unlocks", response_model=PaperUnlockOut)
async def create_paper_unlock(
    body: PaperUnlockCreate,
    claims: dict = Depends(require_student),
) -> PaperUnlockOut:
    try:
        return await _svc().create_for_student(str(claims.get("sub", "")), body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/paper-unlocks/with-signup", response_model=PaperUnlockSignupResponse)
async def create_paper_unlock_with_signup(body: PaperUnlockSignupCreate) -> PaperUnlockSignupResponse:
    try:
        return await _svc().create_with_signup(body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/paper-unlocks/{purchase_id}", response_model=PaperUnlockOut)
async def get_paper_unlock(
    purchase_id: str,
    claims: dict = Depends(require_student),
) -> PaperUnlockOut:
    try:
        return await _svc().get_for_student(purchase_id, str(claims.get("sub", "")))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
