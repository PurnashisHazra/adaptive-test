from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator

from app.schemas.paper import PaperSectionIn, PaperSectionOut
from app.schemas.public_profile import ChallengeParticipantBrief


CHALLENGE_LEVELS = ("BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT")


class ChallengeCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    description: str = Field(default="", max_length=4000)
    level: str = Field(default="INTERMEDIATE", max_length=64)
    is_adaptive: bool = Field(default=True)
    launch_at: datetime
    end_at: datetime
    open_to_all: bool = Field(default=False)
    sections: List[PaperSectionIn] = Field(..., min_length=1)
    marks_per_correct: float = Field(default=1.0, gt=0, le=1000)
    marks_per_incorrect: float = Field(default=0.0, ge=0, le=1000)

    @field_validator("level")
    @classmethod
    def normalize_level(cls, v: str) -> str:
        t = str(v).strip().upper() or "INTERMEDIATE"
        if t not in CHALLENGE_LEVELS:
            raise ValueError(f"Invalid level '{v}'. Allowed: {', '.join(CHALLENGE_LEVELS)}")
        return t

    @field_validator("end_at")
    @classmethod
    def end_after_launch(cls, v: datetime, info) -> datetime:
        launch = info.data.get("launch_at")
        if launch is not None and v <= launch:
            raise ValueError("end_at must be after launch_at")
        return v


class ChallengeUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=300)
    description: Optional[str] = Field(default=None, max_length=4000)
    level: Optional[str] = Field(default=None, max_length=64)
    is_adaptive: Optional[bool] = None
    launch_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    open_to_all: Optional[bool] = None
    sections: Optional[List[PaperSectionIn]] = None
    marks_per_correct: Optional[float] = Field(default=None, gt=0, le=1000)
    marks_per_incorrect: Optional[float] = Field(default=None, ge=0, le=1000)

    @field_validator("level")
    @classmethod
    def normalize_level(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        t = str(v).strip().upper() or "INTERMEDIATE"
        if t not in CHALLENGE_LEVELS:
            raise ValueError(f"Invalid level '{v}'. Allowed: {', '.join(CHALLENGE_LEVELS)}")
        return t


class ChallengeOut(BaseModel):
    id: str
    title: str
    description: str
    level: str
    is_adaptive: bool
    launch_at: datetime
    end_at: datetime
    open_to_all: bool
    sections: List[PaperSectionOut]
    marks_per_correct: float
    marks_per_incorrect: float
    created_at: datetime
    updated_at: datetime


class ChallengeCatalogItem(BaseModel):
    challenge_id: str
    title: str
    description: str
    level: str
    is_adaptive: bool
    launch_at: datetime
    end_at: datetime
    open_to_all: bool
    section_count: int
    marks_per_correct: float
    marks_per_incorrect: float
    status: str = Field(description="upcoming | live | ended")
    seconds_until_launch: Optional[int] = None
    seconds_until_end: Optional[int] = None
    has_access: bool = False
    has_started: bool = False
    completed: bool = False
    challenge_attempt_id: Optional[str] = None
    participants_count: int = 0
    ranked_count: int = Field(default=0, description="Students with a final score (for percentile).")
    my_percentile: Optional[float] = Field(
        default=None,
        description="Percentile vs other ranked students (higher marks = higher percentile).",
    )
    participants: List[ChallengeParticipantBrief] = Field(default_factory=list)


class AssignedChallengeItem(BaseModel):
    challenge_id: str
    title: str
    description: str
    level: str
    is_adaptive: bool
    launch_at: datetime
    end_at: datetime
    section_count: int
    marks_per_correct: float
    marks_per_incorrect: float
    status: str
    has_started: bool
    completed: bool
    challenge_attempt_id: Optional[str] = None
