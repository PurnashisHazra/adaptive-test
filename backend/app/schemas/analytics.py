from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class AttemptQuestionStep(BaseModel):
    """One answered step in order for an attempt."""

    sequence: int = Field(..., ge=1, description="1-based order in the test")
    question_id: str
    question_text: str
    difficulty: str
    time_spent_seconds: Optional[int] = None
    is_correct: bool


class AttemptBreakdown(BaseModel):
    attempt_id: str
    student_name: str
    status: str
    score: int
    total_questions: int
    percentage: float
    started_at: datetime
    completed_at: Optional[datetime] = None
    steps: List[AttemptQuestionStep] = Field(default_factory=list)


class DifficultyAccuracy(BaseModel):
    difficulty: str
    correct: int
    total: int
    accuracy: float


class TopicPerformance(BaseModel):
    topic: str
    correct: int
    total: int
    accuracy: float


class MissedQuestionStat(BaseModel):
    question_id: str
    question_text: str
    miss_count: int


class TopPerformer(BaseModel):
    student_name: str
    attempts: int
    average_score: float
    best_percentage: float


class AnalyticsOverview(BaseModel):
    total_questions: int
    total_attempts: int
    completed_attempts: int
    average_score: float
    average_percentage: float
    accuracy_by_difficulty: List[DifficultyAccuracy]
    accuracy_by_topic: List[TopicPerformance]
    most_missed_questions: List[MissedQuestionStat]
    recent_attempts: List["AttemptListBrief"]
    top_performers: List[TopPerformer] = Field(default_factory=list)
    attempt_breakdowns: List[AttemptBreakdown] = Field(
        default_factory=list,
        description="Per-attempt question sequence with difficulty and time per question.",
    )


class AttemptListBrief(BaseModel):
    id: str
    student_name: str
    score: int
    total_questions: int
    percentage: float
    started_at: datetime
    completed_at: Optional[datetime] = None


AnalyticsOverview.model_rebuild()
