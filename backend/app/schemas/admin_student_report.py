from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field

from app.schemas.student_analytics import (
    StudentAttemptAccuracyImprovementResponse,
    StudentAttemptTimeStrategyResponse,
    StudentLearningTrendsResponse,
    StudentOverallAnalytics,
    StudentStandaloneDetail,
)

StrategyFollowStatus = Literal["on_track", "partial", "needs_focus", "insufficient_data"]
LiveCoachStatus = Literal["active", "plan_ready", "inactive"]


class AdminStudentReportLatestAttempt(BaseModel):
    attempt_id: str
    title: str
    started_at: datetime
    score: int = Field(..., ge=0)
    total_questions: int = Field(..., ge=0)
    accuracy_percent: float = Field(..., ge=0, le=100)
    actual_running_accuracy_percent: Optional[float] = None
    strategy_running_accuracy_percent: Optional[float] = None
    accuracy_lift_points: Optional[float] = None
    wasted_time_flags: int = Field(default=0, ge=0)
    missed_opportunity_flags: int = Field(default=0, ge=0)


class AdminStudentReportCardSummary(BaseModel):
    student_username: str
    display_name: Optional[str] = None
    blocked: bool = False
    attempts_considered: int = Field(default=0, ge=0)
    tests_taken: int = Field(default=0, ge=0)
    average_accuracy_percent: Optional[float] = None
    strategy_follow_status: StrategyFollowStatus = "insufficient_data"
    strategy_follow_percent: Optional[float] = Field(default=None, ge=0, le=100)
    live_coach_status: LiveCoachStatus = "inactive"
    has_coach_plan: bool = False
    coach_explanation_hints_total: int = Field(default=0, ge=0)
    latest_attempt: Optional[AdminStudentReportLatestAttempt] = None
    strategy_preview: List[str] = Field(default_factory=list, description="Top strategy lines from overall analytics.")


class AdminStudentReportCardDetail(AdminStudentReportCardSummary):
    overall: Optional[StudentOverallAnalytics] = None
    latest_attempt_detail: Optional[StudentStandaloneDetail] = None
    strategy_follow_note: str = ""
    live_coach_note: str = ""


class AdminStudentReportCardsResponse(BaseModel):
    students: List[AdminStudentReportCardSummary] = Field(default_factory=list)


class AdminStudentReportPdfBundle(BaseModel):
    """Full analytics payload for admin PDF export (matches student dashboard)."""

    report: AdminStudentReportCardDetail
    trends: StudentLearningTrendsResponse
    time_strategy: Optional[StudentAttemptTimeStrategyResponse] = None
    accuracy_improvement: Optional[StudentAttemptAccuracyImprovementResponse] = None
