from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class PaperSectionIn(BaseModel):
    id: str = Field(..., min_length=1, max_length=64)
    title: str = Field(..., min_length=1, max_length=200)
    order: int = Field(default=0, ge=0, le=1000)
    subject: Optional[str] = None
    topic: Optional[str] = None
    total_questions: int = Field(default=5, ge=1, le=100)
    time_limit_seconds: int = Field(default=600, ge=60, le=7200)


class QuestionPaperCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    sections: List[PaperSectionIn] = Field(..., min_length=1)
    marks_per_correct: float = Field(default=1.0, gt=0, le=1000)
    marks_per_incorrect: float = Field(default=0.0, ge=0, le=1000)


class QuestionPaperUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=300)
    sections: Optional[List[PaperSectionIn]] = None
    marks_per_correct: Optional[float] = Field(default=None, gt=0, le=1000)
    marks_per_incorrect: Optional[float] = Field(default=None, ge=0, le=1000)


class PaperSectionOut(BaseModel):
    id: str
    title: str
    order: int
    subject: Optional[str] = None
    topic: Optional[str] = None
    total_questions: int
    time_limit_seconds: int


class QuestionPaperOut(BaseModel):
    id: str
    title: str
    sections: List[PaperSectionOut]
    marks_per_correct: float
    marks_per_incorrect: float
    created_at: datetime
    updated_at: datetime


class PaperAssignmentOut(BaseModel):
    paper_id: str
    student_username: str
    assigned_at: datetime


class PaperSessionMeta(BaseModel):
    paper_attempt_id: str
    paper_id: str
    paper_title: str
    section_index: int
    section_title: str
    total_sections: int
    marks_per_correct: float
    marks_per_incorrect: float


class PaperSectionResultItem(BaseModel):
    section_title: str
    total_questions: int
    correct: int
    wrong: int
    marks: float


class PaperResultSummary(BaseModel):
    paper_attempt_id: str
    paper_id: str
    title: str
    student_name: str
    total_marks: float
    max_marks: float
    percentage: float
    sections: List[PaperSectionResultItem]
    started_at: datetime
    completed_at: datetime
    ended_early: bool


class AssignedPaperItem(BaseModel):
    paper_id: str
    title: str
    marks_per_correct: float
    marks_per_incorrect: float
    section_count: int
    has_started: bool
    completed: bool
    paper_attempt_id: Optional[str] = None
