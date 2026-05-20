from fastapi import APIRouter, Depends, HTTPException

from app.api.deps_auth import require_student, require_student_with_admin_code
from app.schemas.student_account import StudentAccountOut, StudentAccountUpdate
from app.schemas.student_profile import StudentSessionControls
from app.schemas.public_profile import PublicProfileOut, PublicProfileUpdate
from app.services.public_profile_service import PublicProfileService
from app.services.student_account_service import StudentAccountService
from app.services.student_profile_service import StudentProfileService

router = APIRouter(prefix="/me", tags=["student-me"])


@router.get("/account", response_model=StudentAccountOut)
async def get_my_account(claims: dict = Depends(require_student)) -> StudentAccountOut:
    try:
        return await StudentAccountService().get_account(str(claims.get("sub", "")))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.patch("/account", response_model=StudentAccountOut)
async def update_my_account(
    body: StudentAccountUpdate,
    claims: dict = Depends(require_student),
) -> StudentAccountOut:
    try:
        return await StudentAccountService().update_account(str(claims.get("sub", "")), body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/public-profile", response_model=PublicProfileOut)
async def get_my_public_profile(claims: dict = Depends(require_student)) -> PublicProfileOut:
    return await PublicProfileService().get_own(str(claims.get("sub", "")))


@router.patch("/public-profile", response_model=PublicProfileOut)
async def update_my_public_profile(
    body: PublicProfileUpdate,
    claims: dict = Depends(require_student),
) -> PublicProfileOut:
    try:
        return await PublicProfileService().update_own(str(claims.get("sub", "")), body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/session-controls", response_model=StudentSessionControls)
async def get_my_session_controls(claims: dict = Depends(require_student_with_admin_code)) -> StudentSessionControls:
    username = str(claims.get("sub", "")).strip()
    return await StudentProfileService().get_session_controls(username)
