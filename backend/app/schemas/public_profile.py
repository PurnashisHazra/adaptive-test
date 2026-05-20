from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class PublicProfileOut(BaseModel):
    profile_slug: str
    display_name: str
    bio: str = ""
    updated_at: Optional[datetime] = None


class PublicProfileUpdate(BaseModel):
    profile_slug: Optional[str] = Field(default=None, min_length=2, max_length=64)
    display_name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    bio: Optional[str] = Field(default=None, max_length=1000)


class ChallengeParticipantBrief(BaseModel):
    profile_slug: str
    display_name: str
    completed: bool = False
