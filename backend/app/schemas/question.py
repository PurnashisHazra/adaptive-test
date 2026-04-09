from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator

from app.models.domain import Difficulty, QuestionType


class QuestionOption(BaseModel):
    key: str
    label: str


class QuestionBase(BaseModel):
    question_text: str = Field(..., min_length=1)
    question_type: QuestionType
    options: List[QuestionOption] = Field(default_factory=list)
    correct_answer: str = Field(..., min_length=1)
    explanation: Optional[str] = None
    difficulty: Difficulty
    subject: str = Field(default="General", min_length=1)
    topic: str = Field(..., min_length=1, description="CAT topic of the question (e.g., Algebra, Time-Speed-Distance).")
    tags: List[str] = Field(default_factory=list)
    is_ai_generated: bool = False

    @field_validator("tags", mode="before")
    @classmethod
    def split_tags(cls, v: Any) -> List[str]:
        if v is None:
            return []
        if isinstance(v, str):
            return [t.strip() for t in v.split(",") if t.strip()]
        if isinstance(v, list):
            return [str(x).strip() for x in v if str(x).strip()]
        return []


class QuestionCreate(QuestionBase):
    pass


class QuestionUpdate(BaseModel):
    question_text: Optional[str] = Field(default=None, min_length=1)
    question_type: Optional[QuestionType] = None
    options: Optional[List[QuestionOption]] = None
    correct_answer: Optional[str] = Field(default=None, min_length=1)
    explanation: Optional[str] = None
    difficulty: Optional[Difficulty] = None
    subject: Optional[str] = Field(default=None, min_length=1)
    topic: Optional[str] = Field(default=None, min_length=1)
    tags: Optional[List[str]] = None
    is_ai_generated: Optional[bool] = None


class QuestionAdmin(QuestionBase):
    id: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class QuestionStudentView(BaseModel):
    """Fields exposed to students during a test (no correct answer)."""

    id: str
    question_text: str
    question_type: QuestionType
    options: List[QuestionOption]
    subject: str
    topic: str


class QuestionFilterParams(BaseModel):
    subject: Optional[str] = None
    topic: Optional[str] = None
    difficulty: Optional[Difficulty] = None
    search: Optional[str] = None
    page: int = Field(1, ge=1)
    page_size: int = Field(20, ge=1, le=100)


class BulkJsonPayload(BaseModel):
    questions: List[QuestionCreate]


class DuplicateCheckResult(BaseModel):
    duplicate_of_id: Optional[str] = None
    reason: Optional[str] = None


class AIGenerateQuestionRequest(BaseModel):
    prompt: str = Field(..., min_length=8, max_length=4000)
    subject: Optional[str] = None
    topic: Optional[str] = None
