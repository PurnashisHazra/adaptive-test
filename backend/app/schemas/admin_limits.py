from typing import List, Optional

from pydantic import BaseModel, Field


class QuestionBankFilter(BaseModel):
    """Empty lists mean no restriction on that dimension."""

    exam_tags: List[str] = Field(default_factory=list)
    subjects: List[str] = Field(default_factory=list)
    topics: List[str] = Field(default_factory=list)
    difficulties: List[str] = Field(default_factory=list)


class AdminLimits(BaseModel):
    """None on numeric caps means unlimited (no restriction)."""

    max_papers: Optional[int] = Field(default=None)
    max_students: Optional[int] = Field(default=None)
    max_monthly_student_attempts: Optional[int] = Field(default=None)
    question_bank_filter: QuestionBankFilter = Field(default_factory=QuestionBankFilter)


class AdminLimitsUsage(BaseModel):
    papers_count: int = 0
    students_count: int = 0
    monthly_attempts_count: int = 0
