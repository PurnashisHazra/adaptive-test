from typing import Optional

from pydantic import BaseModel, Field


class StudentAccountOut(BaseModel):
    username: str
    mobile: Optional[str] = None
    needs_admin_code: bool = False
    assigned_admin_code: Optional[str] = None


class StudentAccountUpdate(BaseModel):
    mobile: Optional[str] = Field(default=None, max_length=20, description="Optional; digits only after normalization.")
