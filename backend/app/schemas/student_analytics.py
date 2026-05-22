from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


StudentInsightCapsuleKey = Literal["missed_opportunity", "wasted_time", "skip_revisit"]


class StudentInsightCapsule(BaseModel):
    key: StudentInsightCapsuleKey
    label: str
    hint: Optional[str] = Field(default=None, description="Short tooltip-style reason for this flag.")


class StudentQuestionOptionOut(BaseModel):
    key: str
    label: str


class StudentQuestionReview(BaseModel):
    index: int = Field(..., ge=1, description="1-based order within section or standalone attempt")
    question_id: str
    question_text: str
    image_url: Optional[str] = None
    question_type: str
    options: List[StudentQuestionOptionOut] = Field(default_factory=list)
    chosen_answer: str
    correct_answer: str
    chosen_label: str
    correct_label: str
    is_correct: bool
    explanation: Optional[str] = None
    time_spent_seconds: Optional[int] = None
    difficulty_when_served: Optional[str] = Field(
        default=None,
        description="Difficulty tier when the question was served (EASY/MEDIUM/HARD/EXPERT).",
    )
    answer_attempt_id: str = Field(
        default="",
        description="Test attempt document id that recorded this answer (for peer stats exclusion).",
    )
    peer_answer_count: int = Field(
        default=0,
        ge=0,
        description="Total recorded answers for this question across all attempts.",
    )
    peer_accuracy_percent: Optional[float] = Field(
        default=None,
        description="Share of those answers that were correct (0–100).",
    )
    peer_avg_time_seconds: Optional[float] = Field(
        default=None,
        description="Mean time (seconds) among other attempts that logged timing, excluding this attempt.",
    )
    peer_time_peer_sample_count: int = Field(
        default=0,
        ge=0,
        description="Number of timed answers from other attempts used for the peer average and ranking.",
    )
    your_time_faster_than_peer_percent: Optional[float] = Field(
        default=None,
        description="Among other timed attempts, percentage that took strictly longer than you (0–100).",
    )
    insight_capsules: List[StudentInsightCapsule] = Field(
        default_factory=list,
        description="Per-question behavior flags (e.g. missed opportunity vs peers, wasted time).",
    )


class StudentInsightArea(BaseModel):
    name: str
    attempts: int = Field(..., ge=0)
    accuracy_percent: float = Field(..., ge=0, le=100)
    avg_time_seconds: Optional[float] = Field(default=None, ge=0)


class StudentStrategyAdvice(BaseModel):
    title: str
    detail: str


class StudentPerformanceInsights(BaseModel):
    attempted_questions: int = Field(..., ge=0)
    correct_questions: int = Field(..., ge=0)
    accuracy_percent: float = Field(..., ge=0, le=100)
    avg_time_seconds: Optional[float] = Field(default=None, ge=0)
    wasted_time_questions: int = Field(
        default=0,
        ge=0,
        description="Wrong answers where time spent is notably above your own average.",
    )
    missed_opportunity_questions: int = Field(
        default=0,
        ge=0,
        description="Questions that were answered wrong while peers found relatively easy.",
    )
    skip_candidate_questions: int = Field(
        default=0,
        ge=0,
        description="Questions likely better skipped/revisited due to low ROI time usage.",
    )
    strong_areas: List[StudentInsightArea] = Field(default_factory=list)
    weak_areas: List[StudentInsightArea] = Field(default_factory=list)
    recommendations: List[StudentStrategyAdvice] = Field(default_factory=list)


class StudentSessionSummary(BaseModel):
    session_type: Literal["standalone", "paper"]
    id: str
    title: str
    subtitle: Optional[str] = None
    started_at: datetime
    completed_at: Optional[datetime] = None
    status: str
    kind_label: str


class StudentSessionsPage(BaseModel):
    items: List[StudentSessionSummary]
    total: int
    page: int
    page_size: int
    total_pages: int


class StudentDifficultyLevelStat(BaseModel):
    level: str
    total: int = Field(..., ge=0)
    correct: int = Field(..., ge=0)
    correct_rate: Optional[float] = Field(default=None, ge=0, le=100)
    avg_time_seconds: Optional[float] = Field(default=None, ge=0)


class StudentPaperSectionMeta(BaseModel):
    section_index: int
    section_title: str
    attempt_id: str
    status: str
    question_count: int = Field(..., ge=0)


class StudentQuestionReviewPage(BaseModel):
    questions: List[StudentQuestionReview]
    total: int
    page: int
    page_size: int
    total_pages: int


class StudentStandaloneDetail(BaseModel):
    attempt_id: str
    title: str
    subject: Optional[str] = None
    topic: Optional[str] = None
    status: str
    started_at: datetime
    completed_at: Optional[datetime] = None
    score: int
    total_questions: int
    percentage: Optional[float] = None
    ended_early: bool
    cohort_percentile: Optional[float] = None
    cohort_ranked_count: int = Field(default=0, ge=0)
    percentile_is_final: bool = Field(default=False)
    questions: List[StudentQuestionReview]
    insights: StudentPerformanceInsights


class StudentPaperSectionReview(BaseModel):
    section_index: int
    section_title: str
    attempt_id: str
    status: str
    questions: List[StudentQuestionReview] = Field(default_factory=list)
    question_count: int = Field(default=0, ge=0)


class StudentPaperDetail(BaseModel):
    paper_attempt_id: str
    paper_id: str
    paper_title: str
    status: str
    started_at: datetime
    completed_at: Optional[datetime] = None
    total_marks: Optional[float] = None
    max_marks: Optional[float] = None
    percentage: Optional[float] = None
    ended_early: bool
    cohort_scored_attempt_count: int = Field(
        default=0,
        ge=0,
        description="How many attempts on this paper have a recorded total_marks (completed or ended early).",
    )
    your_score_better_than_percent: Optional[float] = Field(
        default=None,
        description="Deprecated alias; use cohort_percentile.",
    )
    cohort_percentile: Optional[float] = Field(
        default=None,
        description="Overall percentile vs all scored attempts on this paper (0–100).",
    )
    cohort_ranked_count: int = Field(default=0, ge=0)
    percentile_is_final: bool = Field(default=False)
    sections: List[StudentPaperSectionReview]
    insights: StudentPerformanceInsights
    difficulty_stats: List[StudentDifficultyLevelStat] = Field(
        default_factory=list,
        description="Aggregated performance by difficulty tier for charts without loading all questions.",
    )


class StudentOverallFactor(BaseModel):
    name: str
    strength: float = Field(..., ge=0, le=100)
    weakness: float = Field(..., ge=0, le=100)


class StudentOverallDimension(BaseModel):
    key: Literal["time", "difficulty", "knowledge"]
    label: str
    factors: List[StudentOverallFactor] = Field(default_factory=list, min_length=3, max_length=4)
    overall_strength: float = Field(..., ge=0, le=100)
    overall_weakness: float = Field(..., ge=0, le=100)


class StudentOverallAxisView(BaseModel):
    key: Literal["time_knowledge", "time_difficulty", "difficulty_knowledge"]
    label: str
    x_dimension: Literal["time", "difficulty", "knowledge"]
    y_dimension: Literal["time", "difficulty", "knowledge"]
    x_strength: float = Field(..., ge=0, le=100)
    y_strength: float = Field(..., ge=0, le=100)


class StudentOverallAttemptPoint(BaseModel):
    attempt_id: str
    label: str
    time_strength: float = Field(..., ge=0, le=100)
    difficulty_strength: float = Field(..., ge=0, le=100)
    knowledge_strength: float = Field(..., ge=0, le=100)


class StudentOverallDesiredState(BaseModel):
    time_strength: float = Field(..., ge=0, le=100)
    difficulty_strength: float = Field(..., ge=0, le=100)
    knowledge_strength: float = Field(..., ge=0, le=100)


class StudentOverallAnalytics(BaseModel):
    attempts_considered: int = Field(..., ge=0)
    questions_considered: int = Field(..., ge=0)
    dimensions: List[StudentOverallDimension] = Field(default_factory=list)
    axis_views: List[StudentOverallAxisView] = Field(default_factory=list)
    attempt_points: List[StudentOverallAttemptPoint] = Field(default_factory=list)
    desired_state: StudentOverallDesiredState
    strategy_to_desired_state: List[str] = Field(default_factory=list)


class StudentTrendFilterOptions(BaseModel):
    subjects: List[str] = Field(default_factory=list)
    topics: List[str] = Field(default_factory=list)
    exams: List[str] = Field(default_factory=list)


class StudentTrendPoint(BaseModel):
    attempt_id: str
    started_at: datetime
    session_kind: Literal["standalone", "paper_section"]
    subject: Optional[str] = None
    topic: Optional[str] = None
    exam_tag: Optional[str] = None
    accuracy_percent: float = Field(..., ge=0, le=100)
    total_time_seconds: int = Field(default=0, ge=0)
    questions_answered: int = Field(..., ge=0)
    score: int = Field(..., ge=0)


class StudentLearningTrendsResponse(BaseModel):
    points: List[StudentTrendPoint] = Field(default_factory=list)
    filter_options: StudentTrendFilterOptions


TimeStrategyAction = Literal["full_attempt", "time_cap", "defer_revisit", "skip_if_behind"]


class StudentTimeStrategyPerQuestion(BaseModel):
    index: int = Field(..., ge=1, description="1-based question order in this attempt")
    time_action: TimeStrategyAction
    risk_level: Literal["low", "medium", "high"]
    hint: str = Field(default="", max_length=500)


class StudentAttemptTimeStrategyResponse(BaseModel):
    openai_configured: bool = Field(
        ...,
        description="Whether OPENAI_API_KEY is set on the server (client may show a coach UI).",
    )
    used_openai: bool = Field(default=False, description="True if a model response was applied.")
    error: Optional[str] = Field(default=None, description="Set when the coach could not run or parse failed.")
    summary: str = Field(default="", description="Short overview of the recommended time plan.")
    risks_overview: str = Field(
        default="",
        description="Explicit risks (e.g. skipping hard items) the student accepts under this plan.",
    )
    per_question: List[StudentTimeStrategyPerQuestion] = Field(
        default_factory=list,
        description="Per-question pacing recommendation aligned to question indices.",
    )
    cumulative_optimal_seconds: List[float] = Field(
        default_factory=list,
        description="After each question (1..n), cumulative seconds the plan would have spent — for plotting.",
    )


AccuracyBuildCategory = Literal["concept", "trick", "formula", "deep_knowledge", "mixed"]


class StudentAccuracyBuildItem(BaseModel):
    title: str = Field(..., max_length=220, description="Short label for what to build or fix")
    category: AccuracyBuildCategory = Field(
        ...,
        description="Whether this is mainly concept work, exam trick, formula memory, deep theory, or mixed.",
    )
    what_to_build: str = Field(
        ...,
        max_length=2000,
        description="Concrete study artefacts: named concepts, tricks, formulae to memorise, proofs or deep links.",
    )
    question_indices: List[int] = Field(
        default_factory=list,
        description="1-based question indices in this attempt that motivate this item (may be empty).",
    )


class StudentAttemptAccuracyImprovementResponse(BaseModel):
    openai_configured: bool = Field(..., description="Whether OPENAI_API_KEY is set on the server.")
    used_openai: bool = Field(default=False, description="True if a model response was applied.")
    error: Optional[str] = Field(default=None, description="Set when the coach could not run or parse failed.")
    summary: str = Field(default="", description="Overview of how to lift accuracy for this attempt profile.")
    subject_context: str = Field(
        default="",
        description="Subject lens applied (from attempt and/or dashboard filters).",
    )
    exam_context: str = Field(
        default="",
        description="Exam / cohort lens applied (from filters when present).",
    )
    build_items: List[StudentAccuracyBuildItem] = Field(
        default_factory=list,
        description="Prioritised concrete things to build: concepts, tricks, formulae, deep knowledge.",
    )
    practice_drills: List[str] = Field(
        default_factory=list,
        description="Short repeatable drills or checkpoints tied to the exam and subject.",
    )


class StudentCoachPlanBundle(BaseModel):
    """Persisted time + accuracy coach payloads for reuse during live tests (same lens as analytics)."""

    has_accuracy: bool = False
    has_time: bool = False
    accuracy_plan: Optional[Dict[str, Any]] = None
    time_plan: Optional[Dict[str, Any]] = None
    updated_at: Optional[datetime] = None
