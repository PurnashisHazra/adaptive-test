import csv
import io
import json
from typing import Any, Dict, List, Optional, Tuple

from app.models.domain import Difficulty, QuestionType
from app.repositories.question_repository import QuestionRepository
from app.schemas.common import BulkImportResult, RowError
from app.schemas.question import QuestionCreate, QuestionOption
from app.services.question_service import QuestionValidationError, question_create_to_doc


def _row_to_question(row: Dict[str, str], row_num: int) -> Tuple[Optional[QuestionCreate], Optional[RowError]]:
    try:
        qtype_raw = (row.get("question_type") or "").strip().lower()
        if qtype_raw in ("mcq", "mcq_single", "multiple_choice"):
            qtype = QuestionType.MCQ_SINGLE
        elif qtype_raw in ("true_false", "tf", "boolean"):
            qtype = QuestionType.TRUE_FALSE
        elif qtype_raw in ("tita", "type_in", "short_answer", "fill_in"):
            qtype = QuestionType.TITA
        else:
            qtype = QuestionType(qtype_raw) if qtype_raw else QuestionType.MCQ_SINGLE

        diff_raw = (row.get("difficulty") or "").strip().upper()
        difficulty = Difficulty(diff_raw) if diff_raw else Difficulty.EASY

        opts: List[QuestionOption] = []
        if qtype == QuestionType.TITA:
            opts = []
        elif qtype == QuestionType.MCQ_SINGLE:
            for letter in ("a", "b", "c", "d"):
                lab = (row.get(f"option_{letter}") or row.get(f"option_{letter.upper()}") or "").strip()
                if lab:
                    opts.append(QuestionOption(key=letter, label=lab))
        elif qtype == QuestionType.TRUE_FALSE:
            opts = [
                QuestionOption(key="true", label="True"),
                QuestionOption(key="false", label="False"),
            ]

        tags_raw = row.get("tags") or ""
        tags = [t.strip() for t in tags_raw.split(",") if t.strip()]

        img_raw = (row.get("image_url") or row.get("image_link") or "").strip()
        exp_img_raw = (row.get("explanation_image_url") or row.get("explanation_image_link") or "").strip()

        qc = QuestionCreate(
            question_text=(row.get("question_text") or "").strip(),
            question_type=qtype,
            options=opts,
            correct_answer=(row.get("correct_answer") or "").strip(),
            explanation=(row.get("explanation") or "").strip() or None,
            image_url=img_raw or None,
            explanation_image_url=exp_img_raw or None,
            difficulty=difficulty,
            subject=(row.get("subject") or "General").strip(),
            topic=(row.get("topic") or "").strip(),
            tags=tags,
        )
        return qc, None
    except Exception as e:
        return None, RowError(row=row_num, error=str(e))


class BulkImportService:
    def __init__(self) -> None:
        self._repo = QuestionRepository()

    async def import_json_bytes(self, raw: bytes) -> BulkImportResult:
        result = BulkImportResult()
        try:
            payload = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError as e:
            result.errors.append(RowError(row=0, error=f"Invalid JSON: {e}"))
            return result
        items = payload.get("questions") if isinstance(payload, dict) else payload
        if not isinstance(items, list):
            result.errors.append(RowError(row=0, error="JSON must be a list or {questions: [...]}"))
            return result
        for i, obj in enumerate(items, start=1):
            try:
                qc = QuestionCreate.model_validate(obj)
                doc = question_create_to_doc(qc)
                dup = await self._repo.find_ids_by_text_hash(doc["question_text"])
                if dup:
                    result.skipped += 1
                    continue
                await self._repo.insert_one(doc)
                result.inserted += 1
            except (QuestionValidationError, Exception) as e:
                result.errors.append(RowError(row=i, error=str(e)))
        return result

    async def import_csv_bytes(self, raw: bytes) -> BulkImportResult:
        result = BulkImportResult()
        text = raw.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text))
        if not reader.fieldnames:
            result.errors.append(RowError(row=0, error="CSV has no header row"))
            return result
        for idx, row in enumerate(reader, start=2):
            qc, err = _row_to_question(row, idx)
            if err:
                result.errors.append(err)
                continue
            assert qc is not None
            try:
                doc = question_create_to_doc(qc)
                dup = await self._repo.find_ids_by_text_hash(doc["question_text"])
                if dup:
                    result.skipped += 1
                    continue
                await self._repo.insert_one(doc)
                result.inserted += 1
            except (QuestionValidationError, Exception) as e:
                result.errors.append(RowError(row=idx, error=str(e)))
        return result

    async def import_question_creates(self, questions: List[QuestionCreate]) -> BulkImportResult:
        """Insert validated questions (e.g. after PDF import review)."""
        result = BulkImportResult()
        for i, qc in enumerate(questions, start=1):
            try:
                doc = question_create_to_doc(qc)
                dup = await self._repo.find_ids_by_text_hash(doc["question_text"])
                if dup:
                    result.skipped += 1
                    continue
                await self._repo.insert_one(doc)
                result.inserted += 1
            except (QuestionValidationError, Exception) as e:
                result.errors.append(RowError(row=i, error=str(e)))
        return result
