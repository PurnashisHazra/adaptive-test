from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from app.schemas.admin_limits import AdminLimits, AdminLimitsUpdate, AdminLimitsUsage
from app.schemas.auth import Role


class SuperAdminUserRow(BaseModel):
    username: str
    role: Role
    admin_code: Optional[str] = None
    assigned_admin_code: Optional[str] = None
    admin_limits: Optional[AdminLimits] = None
    admin_limits_usage: Optional[AdminLimitsUsage] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class SuperAdminUserListResponse(BaseModel):
    users: List[SuperAdminUserRow]


class UpdateUserRoleRequest(BaseModel):
    role: Role


class SetUserAdminCodeRequest(BaseModel):
    admin_code: str = Field(..., min_length=2, max_length=32)
