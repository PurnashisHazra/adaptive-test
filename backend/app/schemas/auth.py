from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class Role(str, Enum):
    student = "student"
    admin = "admin"
    super_admin = "super_admin"
    god = "god"


class SignupRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=200)
    password: str = Field(..., min_length=8)
    mobile: Optional[str] = Field(
        default=None,
        max_length=20,
        description="Optional on the server; clients may require it at signup.",
    )
    role_key: Optional[str] = Field(
        default=None,
        description="Public signup only creates students. Staff roles are assigned by a super admin or god.",
    )


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=200)
    password: str = Field(..., min_length=8)


class ClaimAdminCodeRequest(BaseModel):
    admin_code: str = Field(..., min_length=2, max_length=32)


class AuthUser(BaseModel):
    username: str
    role: Role
    needs_admin_code: bool = False
    assigned_admin_code: Optional[str] = None
    admin_code: Optional[str] = None
    mobile: Optional[str] = None


class AuthResponse(BaseModel):
    token: str
    user: AuthUser
