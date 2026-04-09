from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class Role(str, Enum):
    student = "student"
    admin = "admin"


class SignupRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=200)
    password: str = Field(..., min_length=8)
    # Role key determines which role is created. Defaults to `student`.
    role_key: Optional[str] = Field(default=None, description="Use 'admin' to create admin users; anything else => student.")


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=200)
    password: str = Field(..., min_length=8)


class AuthUser(BaseModel):
    username: str
    role: Role


class AuthResponse(BaseModel):
    token: str
    user: AuthUser

