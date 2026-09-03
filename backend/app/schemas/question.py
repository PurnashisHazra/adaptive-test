from datetime import datetime
from typing import Any, Dict, List, Optional

from bson import ObjectId
from pydantic import BaseModel, Field, field_validator

from app.models.domain import Difficulty, QuestionType
from app.utils.exam_tags import normalize_exam_tags


class QuestionOption(BaseModel):
    key: str = Field(..., min_length=1, max_length=64)
    label: str = Field(..., max_length=8000)


EXAM_TAGS: List[str] = ["CAT", "SSC", "BANK", "RAILWAY", "DEFENCE", "STATE", "OTHER"]


class QuestionBase(BaseModel):
    question_text: str = Field(..., min_length=1)
    question_type: QuestionType
    options: List[QuestionOption] = Field(default_factory=list, max_length=40)
    correct_answer: str = Field(..., min_length=1)
    explanation: Optional[str] = None
    image_url: Optional[str] = Field(default=None, max_length=2048, description="Optional image URL (e.g. R2 public URL).")
    explanation_image_url: Optional[str] = Field(
        default=None,
        max_length=2048,
        description="Optional image shown with the explanation (e.g. R2 public URL).",
    )
    difficulty: Difficulty
    subject: str = Field(default="General", min_length=1)
    topic: str = Field(..., min_length=1, description="CAT topic of the question (e.g., Algebra, Time-Speed-Distance).")
    tags: List[str] = Field(default_factory=list)
    is_ai_generated: bool = False

    @field_validator("tags", mode="before")
    @classmethod
    def split_tags(cls, v: Any) -> List[str]:
        if v is None:
            return []
        if isinstance(v, str):
            return [t.strip() for t in v.split(",") if t.strip()]
        if isinstance(v, list):
            return [str(x).strip() for x in v if str(x).strip()]
        return []

    @field_validator("tags")
    @classmethod
    def normalize_exam_tags_validator(cls, v: List[str]) -> List[str]:
        return normalize_exam_tags(v)


class QuestionCreate(QuestionBase):
    pass


class QuestionUpdate(BaseModel):
    question_text: Optional[str] = Field(default=None, min_length=1)
    question_type: Optional[QuestionType] = None
    options: Optional[List[QuestionOption]] = None
    correct_answer: Optional[str] = Field(default=None, min_length=1)
    explanation: Optional[str] = None
    image_url: Optional[str] = Field(default=None, max_length=2048)
    explanation_image_url: Optional[str] = Field(default=None, max_length=2048)
    difficulty: Optional[Difficulty] = None
    subject: Optional[str] = Field(default=None, min_length=1)
    topic: Optional[str] = Field(default=None, min_length=1)
    tags: Optional[List[str]] = None
    is_ai_generated: Optional[bool] = None


class QuestionAdmin(QuestionBase):
    id: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class QuestionStudentView(BaseModel):
    """Fields exposed to students during a test (no correct answer)."""

    id: str
    question_text: str
    question_type: QuestionType
    options: List[QuestionOption]
    subject: str
    topic: str
    image_url: Optional[str] = None
    is_ai_generated: bool = False


class QuestionFilterParams(BaseModel):
    subject: Optional[str] = None
    topic: Optional[str] = None
    difficulty: Optional[Difficulty] = None
    search: Optional[str] = None
    page: int = Field(1, ge=1)
    page_size: int = Field(20, ge=1, le=100)


class QuestionListRequest(BaseModel):
    """Body for POST /questions/list — supports long ``search`` without URL limits."""

    subject: Optional[str] = Field(default=None, max_length=400)
    topic: Optional[str] = Field(default=None, max_length=400)
    difficulty: Optional[Difficulty] = None
    search: Optional[str] = Field(default=None, max_length=50_000)
    question_type: Optional[str] = Field(default=None, max_length=32)
    exam_tag: Optional[str] = Field(default=None, max_length=16)
    page: int = Field(1, ge=1)
    page_size: int = Field(20, ge=1, le=100)


class QuestionIdsLookupRequest(BaseModel):
    """Fetch questions by id, returned in the requested order."""

    question_ids: List[str] = Field(..., min_length=1, max_length=500)

    @field_validator("question_ids", mode="before")
    @classmethod
    def normalize_lookup_ids(cls, v: Any) -> List[str]:
        if not isinstance(v, list):
            raise ValueError("question_ids must be a list")
        out: List[str] = []
        seen: set[str] = set()
        for x in v:
            s = str(x).strip()
            if not s or s in seen:
                continue
            if not ObjectId.is_valid(s):
                raise ValueError(f"Invalid question id: {x}")
            seen.add(s)
            out.append(s)
        if not out:
            raise ValueError("question_ids must contain at least one valid id")
        return out[:500]


class BulkJsonPayload(BaseModel):
    questions: List[QuestionCreate]


class DuplicateCheckResult(BaseModel):
    duplicate_of_id: Optional[str] = None
    reason: Optional[str] = None


class AIGenerateQuestionRequest(BaseModel):
    prompt: str = Field(..., min_length=8, max_length=4000)
    subject: Optional[str] = None
    topic: Optional[str] = None


class AutoAssignDifficultyRequest(BaseModel):
    """Assign difficulty via OpenAI using each question's text and exam tags."""

    question_ids: List[str] = Field(..., min_length=1, max_length=30)

    @field_validator("question_ids", mode="before")
    @classmethod
    def normalize_question_ids(cls, v: Any) -> List[str]:
        if not isinstance(v, list):
            raise ValueError("question_ids must be a list")
        out: List[str] = []
        seen: set[str] = set()
        for x in v:
            s = str(x).strip()
            if not s or s in seen:
                continue
            if not ObjectId.is_valid(s):
                raise ValueError(f"Invalid question id: {x}")
            seen.add(s)
            out.append(s)
        if not out:
            raise ValueError("question_ids must contain at least one valid id")
        return out[:30]


class AutoAssignDifficultyResponse(BaseModel):
    updated: int
    errors: List[str] = Field(default_factory=list)


class PdfImportPreviewItem(BaseModel):
    """Relaxed row for editing before commit; maps to QuestionCreate."""

    question_text: str = ""
    question_type: str = "mcq_single"
    option_a: str = ""
    option_b: str = ""
    option_c: str = ""
    option_d: str = ""
    correct_answer: str = ""
    explanation: Optional[str] = None
    image_url: Optional[str] = None
    difficulty: str = "EASY"
    subject: str = "General"
    topic: str = "General"
    exam_tag: str = "OTHER"


class PdfImportPreviewResponse(BaseModel):
    drafts: List[PdfImportPreviewItem]
    parse_mode: str = Field(description="'openai', 'openai_required', or 'error'")
    message: Optional[str] = None
    truncated: bool = False


class PdfImportCommitRequest(BaseModel):
    """Edited rows from PDF preview; same shape as {@link PdfImportPreviewItem}."""

    questions: List[PdfImportPreviewItem] = Field(..., min_length=1)


class DifficultyMix(BaseModel):
    easy: int = 0
    medium: int = 0
    hard: int = 0
    expert: int = 0
    total: int = 0

    @classmethod
    def from_counts(cls, counts: Dict[str, int]) -> "DifficultyMix":
        easy = int(counts.get("EASY", 0))
        medium = int(counts.get("MEDIUM", 0))
        hard = int(counts.get("HARD", 0))
        expert = int(counts.get("EXPERT", 0))
        return cls(easy=easy, medium=medium, hard=hard, expert=expert, total=easy + medium + hard + expert)


class QuestionBankFolderTopic(BaseModel):
    topic: str
    mix: DifficultyMix
    question_ids: List[str] = Field(default_factory=list)


class QuestionBankFolderSubject(BaseModel):
    subject: str
    display_name: Optional[str] = None
    mix: DifficultyMix
    question_ids: List[str] = Field(default_factory=list)
    topics: List[QuestionBankFolderTopic] = Field(default_factory=list)


class QuestionBankFolderExam(BaseModel):
    exam_tag: str
    display_name: Optional[str] = None
    mix: DifficultyMix
    question_ids: List[str] = Field(default_factory=list)
    subjects: List[QuestionBankFolderSubject] = Field(default_factory=list)


class QuestionBankFolderTree(BaseModel):
    exams: List[QuestionBankFolderExam] = Field(default_factory=list)
    grand_total: int = 0
