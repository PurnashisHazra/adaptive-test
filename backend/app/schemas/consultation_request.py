from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

from app.schemas.auth import AuthResponse

ConsultationRequestStatus = Literal["pending", "reviewed"]


class ConsultationRequestCreate(BaseModel):
    mobile: str = Field(..., min_length=10, max_length=15)


class ConsultationRequestSignupCreate(BaseModel):
    username: str = Field(..., min_length=1, max_length=200)
    password: str = Field(..., min_length=8)
    mobile: str = Field(..., min_length=10, max_length=15)


class ConsultationRequestOut(BaseModel):
    id: str
    student_username: str
    mobile: str
    status: ConsultationRequestStatus
    created_at: datetime


class ConsultationRequestSignupResponse(BaseModel):
    request: ConsultationRequestOut
    auth: AuthResponse


class ConsultationRequestAdminItem(BaseModel):
    id: str
    student_username: str
    mobile: str
    status: ConsultationRequestStatus
    created_at: datetime
