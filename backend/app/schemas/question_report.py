from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class QuestionReportCreate(BaseModel):
    attempt_id: str
    question_id: str
    question_index: int = Field(..., ge=1, description="1-based index in this attempt (matches on-screen question number).")
    message: Optional[str] = Field(default=None, max_length=4000)


class QuestionReportOut(BaseModel):
    id: str
    student_username: str
    question_id: str
    question_text_snapshot: Optional[str] = None
    question_index: int
    attempt_id: str
    session_type: Literal["standalone", "paper_section"]
    paper_attempt_id: Optional[str] = None
    paper_title_snapshot: Optional[str] = None
    message: Optional[str] = None
    created_at: datetime
