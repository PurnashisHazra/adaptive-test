from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

PracticeAttemptRequestStatus = Literal["pending", "approved", "denied"]


class PracticeAttemptRequestCreate(BaseModel):
    message: Optional[str] = Field(default=None, max_length=500)


class PracticeAttemptRequestOut(BaseModel):
    id: str
    student_username: str
    status: PracticeAttemptRequestStatus
    message: Optional[str] = None
    requested_at: datetime
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[str] = None


class PracticeAttemptRequestAdminItem(BaseModel):
    id: str
    student_username: str
    display_name: Optional[str] = None
    status: PracticeAttemptRequestStatus
    message: Optional[str] = None
    requested_at: datetime
    practice_attempts_used: int = 0
    practice_attempts_allowance: Optional[int] = None
