from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_student_analytics_service
from app.api.deps_auth import require_student
from app.schemas.student_analytics import (
    StudentAttemptAccuracyImprovementResponse,
    StudentAttemptTimeStrategyResponse,
    StudentCoachPlanBundle,
    StudentLearningTrendsResponse,
    StudentOverallAnalytics,
    StudentPaperDetail,
    StudentQuestionReviewPage,
    StudentSessionSummary,
    StudentSessionsPage,
    StudentStandaloneDetail,
)
from app.services.student_analytics_service import StudentAnalyticsService

router = APIRouter(prefix="/me/analytics", tags=["student-analytics"])


def _me(claims: dict) -> str:
    u = str(claims.get("sub", "")).strip()
    if not u:
        raise HTTPException(status_code=401, detail="Invalid token")
    return u


@router.get("/coach/plan", response_model=StudentCoachPlanBundle)
async def my_coach_plan(
    subject: Optional[str] = Query(default=None, description="Match stored plan lens (attempt subject_filter)"),
    topic: Optional[str] = Query(default=None, description="Match stored plan lens (attempt topic_filter)"),
    exam_tag: Optional[str] = Query(default=None, description="Match stored plan lens (attempt exam_tag_filter)"),
    claims: dict = Depends(require_student),
    svc: StudentAnalyticsService = Depends(get_student_analytics_service),
) -> StudentCoachPlanBundle:
    return await svc.get_coach_plan(
        _me(claims),
        subject=str(subject).strip() if subject else None,
        topic=str(topic).strip() if topic else None,
        exam_tag=str(exam_tag).strip().upper() if exam_tag else None,
    )


@router.get("/sessions", response_model=StudentSessionsPage)
async def list_my_sessions(
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=50),
    session_type: Optional[Literal["standalone", "paper"]] = Query(default=None),
    claims: dict = Depends(require_student),
    svc: StudentAnalyticsService = Depends(get_student_analytics_service),
) -> StudentSessionsPage:
    return await svc.list_sessions_page(_me(claims), page=page, page_size=page_size, session_type=session_type)


@router.get("/overall", response_model=StudentOverallAnalytics)
async def my_overall_analytics(
    subject: Optional[str] = Query(default=None, description="Match attempt subject_filter"),
    topic: Optional[str] = Query(default=None, description="Match attempt topic_filter"),
    exam_tag: Optional[str] = Query(default=None, description="Match attempt exam_tag_filter"),
    claims: dict = Depends(require_student),
    svc: StudentAnalyticsService = Depends(get_student_analytics_service),
) -> StudentOverallAnalytics:
    return await svc.overall_analytics(
        _me(claims),
        subject=str(subject).strip() if subject else None,
        topic=str(topic).strip() if topic else None,
        exam_tag=str(exam_tag).strip().upper() if exam_tag else None,
    )


@router.get("/learning-trends", response_model=StudentLearningTrendsResponse)
async def my_learning_trends(
    claims: dict = Depends(require_student),
    svc: StudentAnalyticsService = Depends(get_student_analytics_service),
) -> StudentLearningTrendsResponse:
    return await svc.learning_trends(_me(claims))


@router.get("/standalone/{attempt_id}", response_model=StudentStandaloneDetail)
async def my_standalone_detail(
    attempt_id: str,
    claims: dict = Depends(require_student),
    svc: StudentAnalyticsService = Depends(get_student_analytics_service),
) -> StudentStandaloneDetail:
    try:
        return await svc.standalone_detail(_me(claims), attempt_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Not found") from None


@router.get("/standalone/{attempt_id}/time-strategy", response_model=StudentAttemptTimeStrategyResponse)
async def my_attempt_time_strategy(
    attempt_id: str,
    subject: Optional[str] = Query(default=None, description="Match attempt filters for dashboard strategy context"),
    topic: Optional[str] = Query(default=None),
    exam_tag: Optional[str] = Query(default=None),
    claims: dict = Depends(require_student),
    svc: StudentAnalyticsService = Depends(get_student_analytics_service),
) -> StudentAttemptTimeStrategyResponse:
    try:
        return await svc.openai_time_strategy(
            _me(claims),
            attempt_id,
            subject=str(subject).strip() if subject else None,
            topic=str(topic).strip() if topic else None,
            exam_tag=str(exam_tag).strip().upper() if exam_tag else None,
        )
    except ValueError:
        raise HTTPException(status_code=404, detail="Not found") from None


@router.get("/standalone/{attempt_id}/accuracy-improvement", response_model=StudentAttemptAccuracyImprovementResponse)
async def my_attempt_accuracy_improvement(
    attempt_id: str,
    subject: Optional[str] = Query(default=None, description="Subject lens (dashboard filter; augments attempt metadata)"),
    topic: Optional[str] = Query(default=None),
    exam_tag: Optional[str] = Query(default=None, description="Exam tag lens (e.g. CAT, JEE) — shapes tricks and depth"),
    claims: dict = Depends(require_student),
    svc: StudentAnalyticsService = Depends(get_student_analytics_service),
) -> StudentAttemptAccuracyImprovementResponse:
    try:
        return await svc.openai_accuracy_improvement(
            _me(claims),
            attempt_id,
            subject=str(subject).strip() if subject else None,
            topic=str(topic).strip() if topic else None,
            exam_tag=str(exam_tag).strip().upper() if exam_tag else None,
        )
    except ValueError:
        raise HTTPException(status_code=404, detail="Not found") from None


@router.get("/paper/{paper_attempt_id}", response_model=StudentPaperDetail)
async def my_paper_detail(
    paper_attempt_id: str,
    include_questions: bool = Query(
        False,
        description="When true, embeds all section questions (slow). Default loads summary only.",
    ),
    claims: dict = Depends(require_student),
    svc: StudentAnalyticsService = Depends(get_student_analytics_service),
) -> StudentPaperDetail:
    try:
        return await svc.paper_detail(
            _me(claims),
            paper_attempt_id,
            include_questions=include_questions,
        )
    except ValueError:
        raise HTTPException(status_code=404, detail="Not found") from None


@router.get(
    "/paper/{paper_attempt_id}/sections/{section_attempt_id}/questions",
    response_model=StudentQuestionReviewPage,
)
async def my_paper_section_questions(
    paper_attempt_id: str,
    section_attempt_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(8, ge=1, le=30),
    claims: dict = Depends(require_student),
    svc: StudentAnalyticsService = Depends(get_student_analytics_service),
) -> StudentQuestionReviewPage:
    try:
        return await svc.paper_section_questions_page(
            _me(claims),
            paper_attempt_id,
            section_attempt_id,
            page=page,
            page_size=page_size,
        )
    except ValueError:
        raise HTTPException(status_code=404, detail="Not found") from None
