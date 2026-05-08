from typing import List

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_student_analytics_service
from app.api.deps_auth import get_current_claims
from app.schemas.student_analytics import (
    StudentOverallAnalytics,
    StudentPaperDetail,
    StudentSessionSummary,
    StudentStandaloneDetail,
)
from app.services.student_analytics_service import StudentAnalyticsService

router = APIRouter(prefix="/me/analytics", tags=["student-analytics"])


def _me(claims: dict) -> str:
    u = str(claims.get("sub", "")).strip()
    if not u:
        raise HTTPException(status_code=401, detail="Invalid token")
    return u


@router.get("/sessions", response_model=List[StudentSessionSummary])
async def list_my_sessions(
    claims: dict = Depends(get_current_claims),
    svc: StudentAnalyticsService = Depends(get_student_analytics_service),
) -> List[StudentSessionSummary]:
    return await svc.list_sessions(_me(claims))


@router.get("/overall", response_model=StudentOverallAnalytics)
async def my_overall_analytics(
    claims: dict = Depends(get_current_claims),
    svc: StudentAnalyticsService = Depends(get_student_analytics_service),
) -> StudentOverallAnalytics:
    return await svc.overall_analytics(_me(claims))


@router.get("/standalone/{attempt_id}", response_model=StudentStandaloneDetail)
async def my_standalone_detail(
    attempt_id: str,
    claims: dict = Depends(get_current_claims),
    svc: StudentAnalyticsService = Depends(get_student_analytics_service),
) -> StudentStandaloneDetail:
    try:
        return await svc.standalone_detail(_me(claims), attempt_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Not found") from None


@router.get("/paper/{paper_attempt_id}", response_model=StudentPaperDetail)
async def my_paper_detail(
    paper_attempt_id: str,
    claims: dict = Depends(get_current_claims),
    svc: StudentAnalyticsService = Depends(get_student_analytics_service),
) -> StudentPaperDetail:
    try:
        return await svc.paper_detail(_me(claims), paper_attempt_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Not found") from None
