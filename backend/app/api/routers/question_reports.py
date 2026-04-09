from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_question_report_service
from app.api.deps_auth import get_current_claims, require_admin
from app.schemas.common import Paginated
from app.schemas.question_report import QuestionReportCreate, QuestionReportOut
from app.services.question_report_service import QuestionReportService

student_router = APIRouter(prefix="/me/question-reports", tags=["question-reports"])
admin_router = APIRouter(prefix="/admin/question-reports", tags=["admin-question-reports"])


def _me(claims: dict) -> str:
    u = str(claims.get("sub", "")).strip()
    if not u:
        raise HTTPException(status_code=401, detail="Invalid token")
    return u


@student_router.post("", response_model=QuestionReportOut)
async def submit_question_report(
    body: QuestionReportCreate,
    claims: dict = Depends(get_current_claims),
    svc: QuestionReportService = Depends(get_question_report_service),
) -> QuestionReportOut:
    try:
        return await svc.create(_me(claims), body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from None


@admin_router.get("", response_model=Paginated[QuestionReportOut])
async def list_question_reports(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    _: Any = Depends(require_admin),
    svc: QuestionReportService = Depends(get_question_report_service),
) -> Paginated[QuestionReportOut]:
    return await svc.list_admin(page=page, page_size=page_size)
