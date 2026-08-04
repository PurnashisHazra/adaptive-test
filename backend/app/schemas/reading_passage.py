from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from app.models.domain import Difficulty, QuestionType
from app.schemas.question import EXAM_TAGS, QuestionOption


class ReadingPassageView(BaseModel):
    """Passage shown alongside an RC sub-question during a test."""

    id: str
    title: str
    passage_text: str
    image_url: Optional[str] = None


class RcSubQuestionIn(BaseModel):
    id: Optional[str] = Field(default=None, description="Existing question id when updating.")
    question_text: str = Field(..., min_length=1)
    question_type: QuestionType = QuestionType.MCQ_SINGLE
    options: List[QuestionOption] = Field(default_factory=list)
    correct_answer: str = Field(..., min_length=1)
    explanation: Optional[str] = None
    difficulty: Difficulty = Difficulty.MEDIUM


class RcSetCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    passage_text: str = Field(..., min_length=20)
    image_url: Optional[str] = Field(default=None, max_length=2048)
    subject: str = Field(default="Verbal Ability", min_length=1)
    topic: str = Field(default="Reading Comprehension", min_length=1)
    tags: List[str] = Field(default_factory=lambda: ["CAT"])
    sub_questions: List[RcSubQuestionIn] = Field(..., min_length=1, max_length=20)


class RcSubQuestionOut(BaseModel):
    id: str
    sub_question_index: int
    question_text: str
    question_type: QuestionType
    options: List[QuestionOption]
    correct_answer: str
    explanation: Optional[str] = None
    difficulty: Difficulty


class RcSetListItem(BaseModel):
    id: str
    title: str
    subject: str
    topic: str
    tags: List[str]
    sub_question_count: int
    question_ids: List[str]
    created_at: datetime
    updated_at: datetime


class RcSetDetail(BaseModel):
    id: str
    title: str
    passage_text: str
    image_url: Optional[str] = None
    subject: str
    topic: str
    tags: List[str]
    sub_questions: List[RcSubQuestionOut]
    created_at: datetime
    updated_at: datetime


class RcSetUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=300)
    passage_text: Optional[str] = Field(default=None, min_length=20)
    image_url: Optional[str] = Field(default=None, max_length=2048)
    subject: Optional[str] = Field(default=None, min_length=1)
    topic: Optional[str] = Field(default=None, min_length=1)
    tags: Optional[List[str]] = None
    sub_questions: Optional[List[RcSubQuestionIn]] = Field(default=None, min_length=1, max_length=20)
