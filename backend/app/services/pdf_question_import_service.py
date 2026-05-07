import json
import logging
from io import BytesIO
from typing import Any, Dict, List, Optional

from pypdf import PdfReader
from urllib import request

from app.core.config import get_settings
from app.models.domain import Difficulty, QuestionType
from app.schemas.question import EXAM_TAGS, PdfImportPreviewItem, PdfImportPreviewResponse

logger = logging.getLogger(__name__)

# One-shot extract; very large PDFs should be split upstream if this truncates.
_MAX_CHARS_OPENAI = 100_000


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    reader = PdfReader(BytesIO(pdf_bytes))
    parts: List[str] = []
    for page in reader.pages:
        try:
            t = page.extract_text() or ""
        except Exception:
            t = ""
        parts.append(t)
    return "\n\n".join(parts).strip()


def _openai_extract_questions(paper_text: str, subject: str, topic: str) -> Optional[List[Dict[str, Any]]]:
    settings = get_settings()
    if not settings.openai_api_key:
        return None
    schema_hint = (
        '{"questions":['
        '{"question_type":"mcq_single|true_false|tita",'
        '"question_text":"string (fully self-contained for the student)",'
        '"option_a":"string","option_b":"string","option_c":"string","option_d":"string",'
        '"correct_answer":"for mcq: a|b|c|d; for true_false: true|false; for tita: expected short answer",'
        '"explanation":null,"difficulty":"EASY|MEDIUM|HARD|EXPERT","subject":"string","topic":"string"}'
        "]}"
    )
    body = {
        "model": settings.openai_model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are an expert at parsing exam question papers from noisy PDF-extracted text. "
                    "You MUST return a single JSON object (no markdown) with exactly one key: \"questions\", "
                    "whose value is an array of question objects. Each object must match the shape the user describes "
                    "and be valid for import into a test bank."
                ),
            },
            {
                "role": "user",
                "content": (
                    "Parse the following question-paper text and build the \"questions\" array.\n\n"
                    "CRITICAL — READING COMPREHENSION:\n"
                    "If several items share one reading passage, you MUST include the COMPLETE passage verbatim "
                    "inside question_text for EVERY one of those items (repeat the passage each time). "
                    "Do not use phrases like 'see passage above' or 'refer to the text above' without including the passage.\n\n"
                    "CRITICAL — SHARED DIRECTIONS / INSTRUCTIONS FOR A RANGE:\n"
                    "If the paper gives directions that apply to a numbered range (e.g. 'Directions for Questions 10 to 15: ...' "
                    "or 'Questions 21–25 are based on ...'), you MUST prepend (or clearly include) that full direction text "
                    "in question_text for EACH question that falls in that range.\n\n"
                    "GENERAL:\n"
                    "- Each question_text must be fully self-contained for a student who sees only that item.\n"
                    "- question_type: use mcq_single for standard 4-option MCQ; true_false for True/False; tita for short typed answers.\n"
                    "- For mcq_single: provide option_a..option_d and correct_answer a|b|c|d (empty if unknown).\n"
                    "- For true_false: use option_a/option_b as labels if given, else 'True'/'False'; correct_answer true or false.\n"
                    "- For tita: leave option fields empty strings; put the expected answer in correct_answer.\n"
                    "- Split multi-part items (e.g. (a)(b) with different answers) into separate array elements.\n"
                    "- Use only content supported by the document; do not invent facts.\n"
                    f"- Default subject for items: {subject!r}, default topic: {topic!r} unless the paper clearly assigns others.\n\n"
                    f"Output shape (JSON object): {schema_hint}\n\n"
                    f"TEXT:\n{paper_text}"
                ),
            },
        ],
        "temperature": 0.15,
        "response_format": {"type": "json_object"},
    }
    req = request.Request(
        settings.openai_api_url,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {settings.openai_api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=180) as resp:
            raw = resp.read().decode("utf-8")
    except Exception as exc:
        logger.warning("OpenAI PDF extract failed: %s", exc)
        return None
    try:
        data = json.loads(raw)
        content = data["choices"][0]["message"]["content"]
        cleaned = _strip_markdown_fence(content)
        payload = json.loads(cleaned)
    except Exception as exc:
        logger.warning("OpenAI PDF extract parse failed: %s", exc)
        return None
    items = payload.get("questions") if isinstance(payload, dict) else None
    if not isinstance(items, list):
        return None
    return [x for x in items if isinstance(x, dict)]


def _strip_markdown_fence(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        lines = t.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        return "\n".join(lines).strip()
    return t


def _normalize_question_type(raw: Any) -> str:
    r = str(raw or "mcq_single").strip().lower()
    if r in ("true_false", "tf", "boolean"):
        return "true_false"
    if r in ("tita", "type_in", "short_answer", "fill_in"):
        return "tita"
    return "mcq_single"


def _normalize_exam_tags(raw_tags: Any) -> List[str]:
    allowed = {x.upper() for x in EXAM_TAGS}
    if not isinstance(raw_tags, list):
        return ["OTHER"]
    out: List[str] = []
    for x in raw_tags:
        t = str(x).strip().upper()
        if t and t in allowed and t not in out:
            out.append(t)
    return out or ["OTHER"]


def _normalize_exam_tag(raw: Any) -> str:
    t = str(raw or "").strip().upper()
    return t if t in {x.upper() for x in EXAM_TAGS} else "OTHER"


def _dicts_to_preview_items(rows: List[Dict[str, Any]], subject: str, topic: str) -> List[PdfImportPreviewItem]:
    out: List[PdfImportPreviewItem] = []
    for row in rows:
        qt = str(row.get("question_text", "")).strip()
        if len(qt) < 3:
            continue
        qtype = _normalize_question_type(row.get("question_type"))
        ca_raw = str(row.get("correct_answer", "")).strip()
        ca = ca_raw.lower()
        if qtype == "mcq_single":
            if ca.startswith("option_"):
                ca = ca.replace("option_", "")
            if ca not in ("a", "b", "c", "d", ""):
                ca = ""
        elif qtype == "true_false":
            if ca not in ("true", "false", ""):
                ca = ""
        else:
            ca = ca_raw
        diff_raw = str(row.get("difficulty", "EASY")).strip().upper() or "EASY"
        if diff_raw not in ("EASY", "MEDIUM", "HARD", "EXPERT"):
            diff_raw = "EASY"
        sub = str(row.get("subject", "")).strip() or subject
        top = str(row.get("topic", "")).strip() or topic
        tag_list = _normalize_exam_tags(row.get("tags"))
        exam_tag = tag_list[0] if tag_list else "OTHER"
        out.append(
            PdfImportPreviewItem(
                question_text=qt,
                question_type=qtype,
                option_a=str(row.get("option_a", "")).strip(),
                option_b=str(row.get("option_b", "")).strip(),
                option_c=str(row.get("option_c", "")).strip(),
                option_d=str(row.get("option_d", "")).strip(),
                correct_answer=ca,
                explanation=(str(row.get("explanation")).strip() or None) if row.get("explanation") else None,
                image_url=(str(row.get("image_url")).strip() or None) if row.get("image_url") else None,
                difficulty=diff_raw,
                subject=sub or "General",
                topic=top or "General",
                exam_tag=exam_tag,
            )
        )
    return out


class PdfQuestionImportService:
    async def preview(self, pdf_bytes: bytes, subject: str, topic: str) -> PdfImportPreviewResponse:
        sub = (subject or "General").strip() or "General"
        top = (topic or "General").strip() or "General"
        settings = get_settings()
        if not (settings.openai_api_key or "").strip():
            return PdfImportPreviewResponse(
                drafts=[],
                parse_mode="openai_required",
                message="PDF import requires OPENAI_API_KEY (and a text-extractable PDF). Set the key in backend environment / .env.",
                truncated=False,
            )
        try:
            full_text = extract_text_from_pdf(pdf_bytes)
        except Exception as exc:
            return PdfImportPreviewResponse(
                drafts=[],
                parse_mode="error",
                message=f"Could not read PDF: {exc}",
                truncated=False,
            )
        if not full_text.strip():
            return PdfImportPreviewResponse(
                drafts=[],
                parse_mode="error",
                message="No extractable text found in PDF (try a text-based PDF, not only scanned images).",
                truncated=False,
            )

        truncated = len(full_text) > _MAX_CHARS_OPENAI
        openai_text = full_text[:_MAX_CHARS_OPENAI]

        rows = _openai_extract_questions(openai_text, sub, top)
        if not rows:
            return PdfImportPreviewResponse(
                drafts=[],
                parse_mode="openai",
                message="OpenAI returned no usable questions (empty array or parse failure). Check server logs or shorten the PDF.",
                truncated=truncated,
            )
        drafts = _dicts_to_preview_items(rows, sub, top)
        if not drafts:
            return PdfImportPreviewResponse(
                drafts=[],
                parse_mode="openai",
                message="Model output contained no valid question rows after validation.",
                truncated=truncated,
            )
        return PdfImportPreviewResponse(
            drafts=drafts,
            parse_mode="openai",
            message="Parsed with OpenAI (comprehension passages and range directions should be inlined in each question_text). Review all fields and answers before saving.",
            truncated=truncated,
        )


def preview_item_to_question_create(item: PdfImportPreviewItem) -> "QuestionCreate":
    from app.schemas.question import QuestionCreate, QuestionOption

    qtype = _normalize_question_type(item.question_type)
    qt_enum = QuestionType.MCQ_SINGLE
    if qtype == "true_false":
        qt_enum = QuestionType.TRUE_FALSE
    elif qtype == "tita":
        qt_enum = QuestionType.TITA

    diff = Difficulty(item.difficulty.upper()) if item.difficulty else Difficulty.EASY

    if qt_enum == QuestionType.TITA:
        ca = (item.correct_answer or "").strip()
        if not ca:
            raise ValueError("TITA questions require a non-empty expected answer in correct_answer")
        return QuestionCreate(
            question_text=item.question_text.strip(),
            question_type=QuestionType.TITA,
            options=[],
            correct_answer=ca,
            explanation=item.explanation,
            image_url=item.image_url,
            difficulty=diff,
            subject=item.subject.strip() or "General",
            topic=item.topic.strip() or "General",
            tags=[_normalize_exam_tag(item.exam_tag)],
            is_ai_generated=False,
        )

    if qt_enum == QuestionType.TRUE_FALSE:
        la = (item.option_a or "").strip() or "True"
        lb = (item.option_b or "").strip() or "False"
        opts = [
            QuestionOption(key="true", label=la),
            QuestionOption(key="false", label=lb),
        ]
        ca = (item.correct_answer or "").strip().lower()
        if ca not in ("true", "false"):
            raise ValueError("True/False questions require correct_answer to be 'true' or 'false'")
        return QuestionCreate(
            question_text=item.question_text.strip(),
            question_type=QuestionType.TRUE_FALSE,
            options=opts,
            correct_answer=ca,
            explanation=item.explanation,
            image_url=item.image_url,
            difficulty=diff,
            subject=item.subject.strip() or "General",
            topic=item.topic.strip() or "General",
            tags=[_normalize_exam_tag(item.exam_tag)],
            is_ai_generated=False,
        )

    opts: List[QuestionOption] = []
    for letter, lab in (
        ("a", item.option_a),
        ("b", item.option_b),
        ("c", item.option_c),
        ("d", item.option_d),
    ):
        if lab.strip():
            opts.append(QuestionOption(key=letter, label=lab.strip()))
    if len(opts) < 2:
        raise ValueError("MCQ requires at least two non-empty options (A–D)")
    ca = (item.correct_answer or "").strip().lower()
    if ca.startswith("option_"):
        ca = ca.split("_")[-1]
    if ca not in ("a", "b", "c", "d"):
        raise ValueError("MCQ correct_answer must be a, b, c, or d")
    return QuestionCreate(
        question_text=item.question_text.strip(),
        question_type=QuestionType.MCQ_SINGLE,
        options=opts,
        correct_answer=ca,
        explanation=item.explanation,
        image_url=item.image_url,
        difficulty=diff,
        subject=item.subject.strip() or "General",
        topic=item.topic.strip() or "General",
        tags=[_normalize_exam_tag(item.exam_tag)],
        is_ai_generated=False,
    )
