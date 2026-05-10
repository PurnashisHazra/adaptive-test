import csv
import io
from typing import Any, Dict, List, Optional, Tuple

from app.models.domain import Difficulty, QuestionType
from app.repositories.question_repository import QuestionRepository
from app.schemas.question import EXAM_TAGS, QuestionCreate, QuestionUpdate
from app.utils.ids import oid_str


class QuestionValidationError(ValueError):
    pass


def _normalize_text(s: str) -> str:
    return " ".join(s.strip().split())


def _normalize_exam_tags(tags: List[str]) -> List[str]:
    allowed = {x.upper() for x in EXAM_TAGS}
    out: List[str] = []
    for raw in tags:
        t = str(raw).strip().upper()
        if not t:
            continue
        if t not in allowed:
            t = "OTHER"
        if t not in out:
            out.append(t)
    return out or ["OTHER"]


def normalize_correct_answer(question_type: QuestionType, correct_answer: str) -> str:
    """Normalize external inputs to the internal representation.

    For `mcq_single`, option keys are stored as provided (e.g. ``a``, ``e``, ``opt1``).
    CSV-style ``option_<key>`` is accepted for any key suffix (e.g. ``option_e`` → ``e``).
    """

    ca = correct_answer.strip().lower()
    if question_type == QuestionType.MCQ_SINGLE and ca.startswith("option_"):
        suffix = ca.removeprefix("option_")
        if suffix:
            return suffix
    return ca


def validate_question_payload(
    question_type: QuestionType,
    options: List[dict],
    correct_answer: str,
) -> None:
    ca = normalize_correct_answer(question_type, correct_answer)
    if question_type == QuestionType.TITA:
        if not ca:
            raise QuestionValidationError("TITA requires a non-empty expected answer")
        if options:
            raise QuestionValidationError("TITA questions must have no options")
        return
    if question_type == QuestionType.TRUE_FALSE:
        if ca not in ("true", "false"):
            raise QuestionValidationError("True/False correct_answer must be 'true' or 'false'")
        keys = {o.get("key", "").lower() for o in options}
        if keys and not keys >= {"true", "false"}:
            raise QuestionValidationError("True/False questions need true and false options")
        return
    if question_type == QuestionType.MCQ_SINGLE:
        if len(options) < 2:
            raise QuestionValidationError("MCQ requires at least two options")
        keys = [str(o.get("key", "")).strip().lower() for o in options]
        if len(set(keys)) != len(keys):
            raise QuestionValidationError("MCQ option keys must be unique")
        if ca not in keys:
            raise QuestionValidationError(
                "correct_answer must match one of the option keys (or CSV-style option_<key>, e.g. option_a)"
            )


def question_create_to_doc(data: QuestionCreate) -> Dict[str, Any]:
    if data.question_type == QuestionType.TITA:
        opts: List[Dict[str, Any]] = []
    elif data.question_type == QuestionType.TRUE_FALSE:
        opts = [{"key": o.key.strip().lower(), "label": o.label.strip()} for o in data.options]
        if len(opts) < 2:
            opts = [
                {"key": "true", "label": "True"},
                {"key": "false", "label": "False"},
            ]
    else:
        opts = [{"key": o.key.strip().lower(), "label": o.label.strip()} for o in data.options]
    validate_question_payload(data.question_type, opts, data.correct_answer)
    ca = normalize_correct_answer(data.question_type, data.correct_answer)
    norm = _normalize_text(data.question_text)
    is_ai_generated = bool(data.is_ai_generated)
    tags = _normalize_exam_tags(list(data.tags))
    img = (data.image_url or "").strip() if data.image_url else None
    return {
        "question_text": data.question_text.strip(),
        "question_text_norm": norm,
        "question_type": data.question_type.value,
        "options": opts,
        "correct_answer": ca,
        "explanation": data.explanation.strip() if data.explanation else None,
        "image_url": img or None,
        "difficulty": data.difficulty.value,
        "subject": data.subject.strip(),
        "topic": data.topic.strip(),
        "tags": tags,
        "is_ai_generated": is_ai_generated,
    }


def merge_update_doc(existing: Dict[str, Any], upd: QuestionUpdate) -> Dict[str, Any]:
    patch: Dict[str, Any] = {}
    if upd.question_text is not None:
        patch["question_text"] = upd.question_text.strip()
        patch["question_text_norm"] = _normalize_text(upd.question_text)
    if upd.question_type is not None:
        patch["question_type"] = upd.question_type.value
    if upd.options is not None:
        patch["options"] = [{"key": o.key.strip().lower(), "label": o.label.strip()} for o in upd.options]
    if upd.correct_answer is not None:
        patch["correct_answer"] = upd.correct_answer.strip().lower()
    if upd.explanation is not None:
        patch["explanation"] = upd.explanation.strip() if upd.explanation else None
    if upd.image_url is not None:
        s = upd.image_url.strip()
        patch["image_url"] = s if s else None
    if upd.difficulty is not None:
        patch["difficulty"] = upd.difficulty.value
    if upd.subject is not None:
        patch["subject"] = upd.subject.strip()
    if upd.topic is not None:
        patch["topic"] = upd.topic.strip()
    if upd.tags is not None:
        patch["tags"] = _normalize_exam_tags(list(upd.tags))
    if upd.is_ai_generated is not None:
        patch["is_ai_generated"] = bool(upd.is_ai_generated)

    qt = QuestionType(patch.get("question_type", existing["question_type"]))
    opts: List[dict] = list(patch.get("options", existing.get("options", [])))
    if qt == QuestionType.TITA:
        patch["options"] = []
        opts = []
    ca = patch.get("correct_answer", existing.get("correct_answer", ""))
    ca_norm = normalize_correct_answer(qt, ca)
    # If the client provided `correct_answer`, persist it in normalized form.
    if upd.correct_answer is not None:
        patch["correct_answer"] = ca_norm
    validate_question_payload(qt, opts, ca_norm)
    return patch


class QuestionService:
    def __init__(self) -> None:
        self._repo = QuestionRepository()

    async def create(self, data: QuestionCreate) -> str:
        doc = question_create_to_doc(data)
        return await self._repo.insert_one(doc)

    async def update(self, qid: str, upd: QuestionUpdate) -> bool:
        ex = await self._repo.get_by_id(qid)
        if not ex:
            return False
        patch = merge_update_doc(ex, upd)
        if not patch:
            return True
        return await self._repo.update_one(qid, patch)

    async def delete(self, qid: str) -> bool:
        return await self._repo.delete_one(qid)

    async def get_admin(self, qid: str) -> Optional[Dict[str, Any]]:
        doc = await self._repo.get_by_id(qid)
        if not doc:
            return None
        return self._repo._doc_to_admin(doc)

    async def list_page(self, **kwargs: Any) -> Tuple[List[Dict[str, Any]], int]:
        return await self._repo.list_paginated(**kwargs)

    async def count(self) -> int:
        return await self._repo.count()

    _CSV_FIELDS = [
        "id",
        "question_text",
        "question_type",
        "option_a",
        "option_b",
        "option_c",
        "option_d",
        "correct_answer",
        "explanation",
        "image_url",
        "difficulty",
        "subject",
        "topic",
        "tags",
        "is_ai_generated",
    ]

    @staticmethod
    def _raw_doc_to_csv_row(doc: Dict[str, Any]) -> Dict[str, str]:
        opts = list(doc.get("options") or [])
        by_key = {str(o.get("key", "")).strip().lower(): str(o.get("label", "")) for o in opts}
        qtype = str(doc.get("question_type", "")).strip().lower()
        if qtype == "true_false":
            oa = by_key.get("true", "True")
            ob = by_key.get("false", "False")
            oc, od = "", ""
        elif qtype == "tita":
            oa, ob, oc, od = "", "", "", ""
        else:
            oa = by_key.get("a", "")
            ob = by_key.get("b", "")
            oc = by_key.get("c", "")
            od = by_key.get("d", "")
        tags = doc.get("tags") or []
        tag_str = ",".join(str(t).strip() for t in tags if str(t).strip())
        return {
            "id": oid_str(doc["_id"]),
            "question_text": str(doc.get("question_text", "")),
            "question_type": str(doc.get("question_type", "")),
            "option_a": oa,
            "option_b": ob,
            "option_c": oc,
            "option_d": od,
            "correct_answer": str(doc.get("correct_answer", "")),
            "explanation": str(doc.get("explanation") or ""),
            "image_url": str(doc.get("image_url") or ""),
            "difficulty": str(doc.get("difficulty", "")),
            "subject": str(doc.get("subject", "")),
            "topic": str(doc.get("topic", "")),
            "tags": tag_str,
            "is_ai_generated": "true" if bool(doc.get("is_ai_generated")) else "false",
        }

    async def export_csv_bytes(self) -> bytes:
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=self._CSV_FIELDS, extrasaction="ignore")
        writer.writeheader()
        async for doc in self._repo.iter_all_docs():
            writer.writerow(self._raw_doc_to_csv_row(doc))
        return buf.getvalue().encode("utf-8-sig")

    async def delete_all(self) -> int:
        return await self._repo.delete_all()
