from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class StudentProfileBase(BaseModel):
    display_name: Optional[str] = Field(default=None, max_length=200)
    practice_attempts_allowance: Optional[int] = Field(
        default=None,
        ge=0,
        le=10_000,
        description="Max standalone practice tests started; null uses platform default (1).",
    )
    practice_attempts_unlimited: bool = Field(
        default=False,
        description="When true, student may start unlimited standalone practice tests.",
    )
    allowed_exam_tags: List[str] = Field(default_factory=list)
    blocked: bool = False


class StudentProfileUpdate(StudentProfileBase):
    assigned_paper_ids: List[str] = Field(default_factory=list)


class StudentProfileAdminView(StudentProfileBase):
    student_username: str
    assigned_paper_ids: List[str] = Field(default_factory=list)
    practice_attempts_used: int = 0
    updated_at: Optional[datetime] = None


class StudentProfileListItem(BaseModel):
    student_username: str
    display_name: Optional[str] = None
    blocked: bool = False
    practice_attempts_allowance: Optional[int] = None
    practice_attempts_unlimited: bool = False
    practice_attempts_used: int = 0
    allowed_exam_tags: List[str] = Field(default_factory=list)
    assigned_paper_count: int = 0


class StudentSessionControls(BaseModel):
    """What a logged-in student needs to start a practice test."""
    student_username: str
    display_name: str
    blocked: bool = False
    block_reason: Optional[str] = None
    practice_attempts_allowance: Optional[int] = None
    practice_attempts_unlimited: bool = False
    practice_attempts_used: int = 0
    practice_attempts_remaining: Optional[int] = None
    allowed_exam_tags: List[str] = Field(default_factory=list)
    can_start_practice_test: bool = True
    has_pending_practice_request: bool = False
    can_request_more_attempts: bool = False
