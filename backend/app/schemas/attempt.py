from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from app.models.domain import Difficulty


class AnswerRecord(BaseModel):
    question_id: str
    chosen_answer: str
    is_correct: bool
    difficulty_when_served: Difficulty
    topic_when_served: Optional[str] = None
    target_difficulty_after: Optional[Difficulty] = None
    time_spent_seconds: Optional[int] = None


class TestStartRequest(BaseModel):
    student_name: str = Field(..., min_length=1, max_length=200)
    subject: Optional[str] = None
    topic: Optional[str] = None
    total_questions: int = Field(default=10, ge=1, le=100)
    time_limit_seconds: Optional[int] = Field(default=None, ge=60, le=7200)


class TestStartResponse(BaseModel):
    attempt_id: str
    question: "QuestionPayload"
    question_index: int
    total_questions: int
    time_limit_seconds: Optional[int] = None
    started_at: datetime
    marked_for_review: List[int] = Field(default_factory=list)
    questions_answered: int = 0
    max_reachable_index: int = 1
    can_submit: bool = True
    paper: Optional["PaperSessionMeta"] = None


class QuestionPayload(BaseModel):
    id: str
    question_text: str
    question_type: str
    options: List[dict]
    subject: str
    topic: str


class PaperNextSection(BaseModel):
    attempt_id: str
    question: QuestionPayload
    question_index: int
    total_questions: int
    time_limit_seconds: Optional[int] = None
    started_at: datetime
    marked_for_review: List[int] = Field(default_factory=list)
    questions_answered: int = 0
    max_reachable_index: int = 1
    paper: "PaperSessionMeta"


class SubmitAnswerRequest(BaseModel):
    question_id: str
    chosen_answer: str = Field(..., min_length=0)
    elapsed_seconds: Optional[int] = Field(
        default=None,
        ge=0,
        description="Seconds spent on this question (client-measured; optional).",
    )


class SubmitAnswerResponse(BaseModel):
    is_correct: bool
    explanation: Optional[str] = None
    completed: bool
    next_question: Optional[QuestionPayload] = None
    question_index: Optional[int] = None
    summary: Optional["AttemptSummary"] = None
    marked_for_review: List[int] = Field(default_factory=list)
    questions_answered: int = 0
    max_reachable_index: int = 0
    paper_next: Optional[PaperNextSection] = None
    paper_summary: Optional["PaperResultSummary"] = None


class QuestionAtIndexResponse(BaseModel):
    question: QuestionPayload
    question_index: int
    chosen_answer: Optional[str] = None
    can_submit: bool
    total_questions: int
    max_reachable_index: int
    questions_answered: int
    marked_for_review: List[int] = Field(default_factory=list)


class MarkReviewRequest(BaseModel):
    question_index: int = Field(..., ge=1, le=100)
    marked: bool


class MarkReviewResponse(BaseModel):
    marked_for_review: List[int] = Field(default_factory=list)


class AttemptSummary(BaseModel):
    attempt_id: str
    student_name: str
    score: int
    total_questions: int
    percentage: float
    subject: Optional[str] = None
    topic: Optional[str] = None
    started_at: datetime
    completed_at: datetime
    answers: List[AnswerRecord]
    ended_early: bool = False


class AttemptListItem(BaseModel):
    id: str
    student_name: str
    status: str
    score: int
    total_questions: int
    percentage: float
    subject: Optional[str] = None
    topic: Optional[str] = None
    started_at: datetime
    completed_at: Optional[datetime] = None


class StudentHistoryRequest(BaseModel):
    student_name: str = Field(..., min_length=1)


class StudentHistoryStats(BaseModel):
    student_name: str
    tests_taken: int
    average_score: float
    best_score: float
    best_percentage: float
    recent_attempts: List[AttemptListItem]


class AppConfigUpdate(BaseModel):
    subject_filter_enabled: Optional[bool] = None
    topic_filter_enabled: Optional[bool] = None
    default_test_question_count: Optional[int] = Field(default=None, ge=1, le=100)
    default_time_limit_seconds: Optional[int] = Field(default=None, ge=60, le=7200)
    difficulty_wave_enabled: Optional[bool] = None
    difficulty_sequence: Optional[List[Difficulty]] = None
    difficulty_transition_enabled: Optional[bool] = None
    difficulty_transition_map: Optional[Dict[str, Dict[str, Difficulty]]] = None


class AppConfigPublic(BaseModel):
    subject_filter_enabled: bool = True
    topic_filter_enabled: bool = True
    default_test_question_count: int = 10
    default_time_limit_seconds: int = 1800
    difficulty_wave_enabled: bool = False
    difficulty_sequence: List[Difficulty] = Field(default_factory=list)
    difficulty_transition_enabled: bool = True
    difficulty_transition_map: Dict[str, Dict[str, Difficulty]] = Field(default_factory=dict)


# Resolve forward refs
from app.schemas.paper import PaperResultSummary, PaperSessionMeta  # noqa: E402

TestStartResponse.model_rebuild()
PaperNextSection.model_rebuild()
SubmitAnswerResponse.model_rebuild()
