from typing import Any, Dict, Optional, Tuple

from app.repositories.attempt_repository import AttemptRepository
from app.repositories.paper_repository import PaperRepository
from app.repositories.question_report_repository import QuestionReportRepository
from app.repositories.question_repository import QuestionRepository
from app.schemas.common import Paginated
from app.schemas.question_report import QuestionReportCreate, QuestionReportOut
from app.utils.ids import oid_str


class QuestionReportService:
    def __init__(self) -> None:
        self._reports = QuestionReportRepository()
        self._attempts = AttemptRepository()
        self._questions = QuestionRepository()
        self._papers = PaperRepository()

    def _owns_attempt(self, att: Dict[str, Any], username: str) -> bool:
        return str(att.get("student_name", "")).strip().lower() == username.strip().lower()

    async def create(self, username: str, body: QuestionReportCreate) -> QuestionReportOut:
        att = await self._attempts.get(body.attempt_id)
        if not att or not self._owns_attempt(att, username):
            raise ValueError("Attempt not found")
        if str(att.get("status", "")) not in ("in_progress", "completed"):
            raise ValueError("Invalid attempt state")

        served = [str(x) for x in (att.get("question_ids") or [])]
        idx = body.question_index
        if idx < 1 or idx > len(served):
            raise ValueError("Invalid question index for this attempt")
        if str(served[idx - 1]) != str(body.question_id).strip():
            raise ValueError("Question does not match this step")

        qdoc = await self._questions.get_by_id(body.question_id)
        qtext = str(qdoc.get("question_text", ""))[:4000] if qdoc else None

        paper_attempt_id = str(att.get("paper_attempt_id") or "").strip() or None
        session_type = "paper_section" if paper_attempt_id else "standalone"
        paper_title: Optional[str] = None
        if paper_attempt_id:
            pa = await self._papers.get_paper_attempt(paper_attempt_id)
            if pa and self._owns_paper(pa, username):
                pdoc = await self._papers.get_paper(str(pa.get("paper_id", "")))
                paper_title = str(pdoc.get("title", "")) if pdoc else None

        doc: Dict[str, Any] = {
            "student_username": username.strip(),
            "question_id": str(body.question_id).strip(),
            "question_index": idx,
            "attempt_id": str(body.attempt_id).strip(),
            "session_type": session_type,
            "paper_attempt_id": paper_attempt_id,
            "paper_title_snapshot": paper_title,
            "question_text_snapshot": qtext,
            "message": (body.message or "").strip() or None,
        }
        rid = await self._reports.insert(doc)
        saved = await self._reports.get_by_id(rid)
        if not saved:
            raise RuntimeError("Failed to load report")
        return self._to_out(saved)

    def _owns_paper(self, pa: Dict[str, Any], username: str) -> bool:
        return str(pa.get("student_username", "")).strip().lower() == username.strip().lower()

    def _to_out(self, doc: Dict[str, Any]) -> QuestionReportOut:
        return QuestionReportOut(
            id=oid_str(doc["_id"]),
            student_username=str(doc.get("student_username", "")),
            question_id=str(doc.get("question_id", "")),
            question_text_snapshot=doc.get("question_text_snapshot"),
            question_index=int(doc.get("question_index", 0)),
            attempt_id=str(doc.get("attempt_id", "")),
            session_type=doc.get("session_type", "standalone"),
            paper_attempt_id=doc.get("paper_attempt_id"),
            paper_title_snapshot=doc.get("paper_title_snapshot"),
            message=doc.get("message"),
            created_at=doc["created_at"],
        )

    async def list_admin(self, *, page: int, page_size: int) -> Paginated[QuestionReportOut]:
        rows, total = await self._reports.list_paginated(page=page, page_size=page_size)
        items = [self._to_out(d) for d in rows]
        return Paginated(items=items, total=total, page=page, page_size=page_size)
