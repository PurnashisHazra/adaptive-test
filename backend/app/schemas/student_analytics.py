from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field


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


class StudentSessionSummary(BaseModel):
    session_type: Literal["standalone", "paper"]
    id: str
    title: str
    subtitle: Optional[str] = None
    started_at: datetime
    completed_at: Optional[datetime] = None
    status: str
    kind_label: str


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
    questions: List[StudentQuestionReview]


class StudentPaperSectionReview(BaseModel):
    section_index: int
    section_title: str
    attempt_id: str
    status: str
    questions: List[StudentQuestionReview]


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
        description="Share of those attempts whose total marks are strictly lower than yours (0–100).",
    )
    sections: List[StudentPaperSectionReview]
