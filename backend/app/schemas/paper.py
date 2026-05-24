from datetime import datetime
from typing import List, Optional

from bson import ObjectId
from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.question import EXAM_TAGS


class PaperSectionIn(BaseModel):
    id: str = Field(..., min_length=1, max_length=64)
    title: str = Field(..., min_length=1, max_length=200)
    order: int = Field(default=0, ge=0, le=1000)
    subject: Optional[str] = None
    topic: Optional[str] = None
    exam_tag: Optional[str] = Field(default=None, description="Exam category tag filter (e.g. CAT/SSC/BANK). Null means mixed.")
    total_questions: int = Field(default=5, ge=1, le=100)
    time_limit_seconds: int = Field(default=600, ge=60, le=7200)
    question_pool_ids: Optional[List[str]] = Field(
        default=None,
        description="If set, the section only serves questions from this pool (adaptive difficulty within the pool).",
    )

    @field_validator("exam_tag")
    @classmethod
    def validate_exam_tag(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        t = str(v).strip().upper()
        if not t:
            return None
        if t not in EXAM_TAGS:
            raise ValueError(f"Invalid exam_tag '{v}'. Allowed: {', '.join(EXAM_TAGS)}")
        return t

    @field_validator("question_pool_ids", mode="before")
    @classmethod
    def normalize_pool_ids(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is None:
            return None
        if not isinstance(v, list):
            raise ValueError("question_pool_ids must be a list of id strings")
        out: List[str] = []
        seen: set[str] = set()
        for x in v:
            s = str(x).strip()
            if not s or s in seen:
                continue
            if not ObjectId.is_valid(s):
                raise ValueError(f"Invalid question id in pool: {x}")
            seen.add(s)
            out.append(s)
        return out or None

    @model_validator(mode="after")
    def pool_covers_section_length(self) -> "PaperSectionIn":
        if self.question_pool_ids and len(self.question_pool_ids) < self.total_questions:
            raise ValueError(
                "Question set must include at least as many questions as 'questions in section' "
                f"(pool has {len(self.question_pool_ids)}, section asks for {self.total_questions})."
            )
        if self.question_pool_ids and len(self.question_pool_ids) > 2000:
            raise ValueError("Question set cannot exceed 2000 questions per section.")
        return self


class QuestionPaperCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    sections: List[PaperSectionIn] = Field(..., min_length=1)
    marks_per_correct: float = Field(default=1.0, gt=0, le=1000)
    marks_per_incorrect: float = Field(default=0.0, ge=0, le=1000)
    is_adaptive: bool = Field(
        default=True,
        description="Adaptive papers adjust difficulty per answer. Non-adaptive papers use a fixed question set with full navigation, skip, and mark-for-review.",
    )


class QuestionPaperUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=300)
    sections: Optional[List[PaperSectionIn]] = None
    marks_per_correct: Optional[float] = Field(default=None, gt=0, le=1000)
    marks_per_incorrect: Optional[float] = Field(default=None, ge=0, le=1000)
    is_adaptive: Optional[bool] = None


class PaperSectionOut(BaseModel):
    id: str
    title: str
    order: int
    subject: Optional[str] = None
    topic: Optional[str] = None
    exam_tag: Optional[str] = None
    total_questions: int
    time_limit_seconds: int
    question_pool_ids: Optional[List[str]] = None


class QuestionPaperOut(BaseModel):
    id: str
    title: str
    sections: List[PaperSectionOut]
    marks_per_correct: float
    marks_per_incorrect: float
    is_adaptive: bool = True
    created_at: datetime
    updated_at: datetime


class PaperAssignmentOut(BaseModel):
    paper_id: str
    student_username: str
    assigned_at: datetime


class AssignPaperByTitleRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=300, description="Question paper title (case-insensitive exact match).")
    assignees: List[str] = Field(
        ...,
        min_length=1,
        description="Student usernames to assign; replaces the paper's current assignment list.",
    )


class AssignPaperByTitleResponse(BaseModel):
    paper_id: str
    paper_title: str
    assignees: List[str] = Field(description="Usernames now assigned to this paper (sorted, unique).")


class PaperSessionMeta(BaseModel):
    paper_attempt_id: str
    paper_id: str
    paper_title: str
    section_index: int
    section_title: str
    total_sections: int
    marks_per_correct: float
    marks_per_incorrect: float
    is_adaptive: bool = True


class PaperSectionResultItem(BaseModel):
    section_title: str
    total_questions: int
    correct: int
    wrong: int
    marks: float


class PaperResultSummary(BaseModel):
    paper_attempt_id: str
    paper_id: str
    title: str
    student_name: str
    total_marks: float
    max_marks: float
    percentage: float
    sections: List[PaperSectionResultItem]
    started_at: datetime
    completed_at: datetime
    ended_early: bool
    cohort_percentile: Optional[float] = Field(
        default=None,
        description="Overall percentile vs scored attempts on this paper/challenge (0–100).",
    )
    cohort_ranked_count: int = Field(default=0, ge=0)
    percentile_is_final: bool = Field(default=False)


class AssignedPaperItem(BaseModel):
    paper_id: str
    title: str
    marks_per_correct: float
    marks_per_incorrect: float
    is_adaptive: bool = True
    section_count: int
    has_started: bool
    completed: bool
    paper_attempt_id: Optional[str] = None
