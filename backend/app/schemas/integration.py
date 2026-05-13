from typing import List, Optional

from pydantic import BaseModel, Field, field_validator


class ProvisionStudentRequest(BaseModel):
    """
    Called from your payment site (server-to-server) after a successful checkout.
    Creates a student login if needed, then grants access to the listed question papers.
    """

    username: str = Field(..., min_length=1, max_length=200)
    password: Optional[str] = Field(
        default=None,
        min_length=8,
        description="Required when the account is new. Ignored if the student already exists.",
    )
    paper_ids: List[str] = Field(
        ...,
        min_length=1,
        max_length=50,
        description="MongoDB ObjectId strings of question papers to assign.",
    )

    @field_validator("paper_ids")
    @classmethod
    def _dedupe_paper_ids(cls, v: List[str]) -> List[str]:
        seen: set[str] = set()
        out: List[str] = []
        for x in v:
            s = str(x).strip()
            if s and s not in seen:
                seen.add(s)
                out.append(s)
        if not out:
            raise ValueError("paper_ids must contain at least one non-empty id")
        return out


class ProvisionStudentResponse(BaseModel):
    username: str
    created: bool = Field(description="True if a new student account was created.")
    assigned_paper_ids: List[str] = Field(description="Papers newly assigned on this request.")
    already_assigned_paper_ids: List[str] = Field(
        default_factory=list,
        description="Papers that were already assigned before this call (idempotent retries).",
    )
