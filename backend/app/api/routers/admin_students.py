from typing import List

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps_auth import require_admin
from app.schemas.student_profile import StudentProfileAdminView, StudentProfileListItem, StudentProfileUpdate
from app.services.student_profile_service import StudentProfileService

router = APIRouter(prefix="/admin/students", tags=["admin-students"])


def _svc() -> StudentProfileService:
    return StudentProfileService()


@router.get("", response_model=List[StudentProfileListItem])
async def list_students(claims: dict = Depends(require_admin)) -> List[StudentProfileListItem]:
    return await _svc().list_students_admin(str(claims.get("sub", "")))


@router.get("/exam-tags")
async def list_exam_tags(_: dict = Depends(require_admin)) -> dict:
    tags = await _svc().list_available_exam_tags()
    return {"exam_tags": tags}


@router.get("/papers-catalog")
async def list_papers_catalog(_: dict = Depends(require_admin)) -> dict:
    papers = await _svc().list_papers_for_admin()
    return {"papers": papers}


@router.get("/{username}", response_model=StudentProfileAdminView)
async def get_student(username: str, claims: dict = Depends(require_admin)) -> StudentProfileAdminView:
    try:
        return await _svc().get_admin_view(username, str(claims.get("sub", "")))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.put("/{username}", response_model=StudentProfileAdminView)
async def update_student(
    username: str,
    body: StudentProfileUpdate,
    claims: dict = Depends(require_admin),
) -> StudentProfileAdminView:
    try:
        return await _svc().update_admin(username, str(claims.get("sub", "")), body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
