from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps_auth import require_admin
from app.schemas.admin_student_report import (
    AdminStudentReportCardDetail,
    AdminStudentReportCardsResponse,
    AdminStudentReportPdfBundle,
)
from app.schemas.student_profile import StudentProfileAdminView, StudentProfileListItem, StudentProfileUpdate
from app.services.admin_student_report_service import AdminStudentReportService
from app.services.student_profile_service import StudentProfileService

router = APIRouter(prefix="/admin/students", tags=["admin-students"])


def _svc() -> StudentProfileService:
    return StudentProfileService()


def _report_svc() -> AdminStudentReportService:
    return AdminStudentReportService()


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


@router.get("/report-cards", response_model=AdminStudentReportCardsResponse)
async def list_student_report_cards(claims: dict = Depends(require_admin)) -> AdminStudentReportCardsResponse:
    return await _report_svc().list_report_cards(str(claims.get("sub", "")))


@router.get("/{username}/report-card", response_model=AdminStudentReportCardDetail)
async def get_student_report_card(
    username: str,
    claims: dict = Depends(require_admin),
) -> AdminStudentReportCardDetail:
    try:
        return await _report_svc().get_report_card(str(claims.get("sub", "")), username)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.get("/{username}/report-pdf-bundle", response_model=AdminStudentReportPdfBundle)
async def get_student_report_pdf_bundle(
    username: str,
    refresh_coach: bool = Query(default=False, description="Re-run OpenAI coach if no saved plan exists"),
    claims: dict = Depends(require_admin),
) -> AdminStudentReportPdfBundle:
    try:
        return await _report_svc().get_pdf_bundle(
            str(claims.get("sub", "")),
            username,
            refresh_coach=refresh_coach,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


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
