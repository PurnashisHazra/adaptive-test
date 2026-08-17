from typing import List, Optional

from pydantic import BaseModel, Field, field_validator

from app.utils.exam_tags import normalize_exam_tag, normalize_subject_name


def normalize_topic_name(raw: str) -> str:
    return " ".join(str(raw or "").strip().split())[:400] or "General"


class FolderPath(BaseModel):
    exam_tag: str = Field(..., min_length=1, max_length=64)
    subject: Optional[str] = Field(default=None, max_length=400)
    topic: Optional[str] = Field(default=None, max_length=400)

    @field_validator("exam_tag")
    @classmethod
    def norm_exam(cls, v: str) -> str:
        return normalize_exam_tag(v)

    @field_validator("subject")
    @classmethod
    def norm_subject(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not str(v).strip():
            return None
        return normalize_subject_name(v)

    @field_validator("topic")
    @classmethod
    def norm_topic(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not str(v).strip():
            return None
        return normalize_topic_name(v)

    @property
    def depth(self) -> int:
        if self.topic:
            return 3
        if self.subject:
            return 2
        return 1


class MoveFolderRequest(BaseModel):
    from_path: FolderPath
    to_path: FolderPath


class BulkMoveFoldersRequest(BaseModel):
    from_paths: List[FolderPath] = Field(..., min_length=1, max_length=100)
    to_exam_tag: str = Field(..., min_length=1, max_length=64)
    to_subject: Optional[str] = Field(default=None, max_length=400)
    to_topic: Optional[str] = Field(default=None, max_length=400)

    @field_validator("to_exam_tag")
    @classmethod
    def norm_exam(cls, v: str) -> str:
        return normalize_exam_tag(v)

    @field_validator("to_subject")
    @classmethod
    def norm_subject(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not str(v).strip():
            return None
        return normalize_subject_name(v)

    @field_validator("to_topic")
    @classmethod
    def norm_topic(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not str(v).strip():
            return None
        return normalize_topic_name(v)


class BulkCopyFoldersRequest(BulkMoveFoldersRequest):
    pass


class BulkFolderMutationResult(BaseModel):
    ok: bool = True
    affected: int = 0
    message: str = ""


class BulkCopyFoldersResult(BaseModel):
    ok: bool = True
    affected: int = 0
    copied_question_ids: List[str] = Field(default_factory=list)
    message: str = ""


class CreateCategoryRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)

    @property
    def category_key(self) -> str:
        return normalize_exam_tag(self.name)


class CreateSubjectFolderRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=400)

    @property
    def subject_key(self) -> str:
        return normalize_subject_name(self.name)


class RenameCategoryRequest(BaseModel):
    new_name: Optional[str] = Field(default=None, min_length=1, max_length=64)
    display_name: Optional[str] = Field(default=None, min_length=1, max_length=120)

    @field_validator("new_name", "display_name")
    @classmethod
    def strip_optional(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = str(v).strip()
        return s or None


class RenameSubjectFolderRequest(BaseModel):
    new_name: str = Field(..., min_length=1, max_length=400)

    @property
    def subject_key(self) -> str:
        return normalize_subject_name(self.new_name)


class MoveQuestionsRequest(BaseModel):
    question_ids: List[str] = Field(..., min_length=1, max_length=500)
    from_exam_tag: str = Field(..., min_length=1, max_length=64)
    to_exam_tag: str = Field(..., min_length=1, max_length=64)
    to_subject: str = Field(..., min_length=1, max_length=400)

    @field_validator("from_exam_tag", "to_exam_tag")
    @classmethod
    def norm_exam(cls, v: str) -> str:
        return normalize_exam_tag(v)

    @field_validator("to_subject")
    @classmethod
    def norm_subject(cls, v: str) -> str:
        return normalize_subject_name(v)


class CopyQuestionsRequest(BaseModel):
    question_ids: List[str] = Field(..., min_length=1, max_length=500)
    to_exam_tag: str = Field(..., min_length=1, max_length=64)
    to_subject: str = Field(..., min_length=1, max_length=400)

    @field_validator("to_exam_tag")
    @classmethod
    def norm_exam(cls, v: str) -> str:
        return normalize_exam_tag(v)

    @field_validator("to_subject")
    @classmethod
    def norm_subject(cls, v: str) -> str:
        return normalize_subject_name(v)


class FolderMutationResult(BaseModel):
    ok: bool = True
    affected: int = 0
    message: str = ""


class CopyQuestionsResult(BaseModel):
    copied: int
    new_question_ids: List[str] = Field(default_factory=list)
