import asyncio
import json
import logging
import re
from typing import Any, Dict, List, Optional

from app.services.llm_client import LlmChatError, ai_any_configured, chat_completion, strip_markdown_fence
from app.models.domain import Difficulty, QuestionType
from app.repositories.question_repository import QuestionRepository
from app.schemas.question import QuestionCreate, QuestionOption
from app.services.question_service import question_create_to_doc
from app.utils.exam_tags import is_others_exam, normalize_exam_tag, normalize_exam_tags
from app.utils.ids import oid_str

logger = logging.getLogger(__name__)

AI_GENERATED_FOLDER_SUBJECT = "AI Generated"


async def resolve_folder_admin_username(student_username: Optional[str]) -> Optional[str]:
    """Instructor who owns the student's question-bank tree, if assigned."""
    from app.repositories.user_repository import UserRepository

    if not student_username or not str(student_username).strip():
        return None
    users = UserRepository()
    user = await users.get_by_username(str(student_username).strip())
    if not user:
        return None
    code = user.get("assigned_admin_code")
    if not code:
        return None
    admin = await users.get_admin_by_code(str(code))
    name = str((admin or {}).get("username") or "").strip()
    return name or None


def _exam_label(exam_tag: Optional[str]) -> str:
    raw = str(exam_tag or "").strip()
    if not raw or is_others_exam(raw):
        return "Indian competitive exam"
    return normalize_exam_tag(raw)


_DIFFICULTY_ALIASES = {
    "EASY": Difficulty.EASY,
    "BEGINNER": Difficulty.EASY,
    "MEDIUM": Difficulty.MEDIUM,
    "INTERMEDIATE": Difficulty.MEDIUM,
    "HARD": Difficulty.HARD,
    "ADVANCED": Difficulty.HARD,
    "EXPERT": Difficulty.EXPERT,
}

_DIFFICULTY_RE = re.compile(
    r"(?<![A-Za-z])(easy|beginner|medium|intermediate|hard|advanced|expert)(?![A-Za-z])",
    re.IGNORECASE,
)


def difficulty_from_prompt(text: Optional[str]) -> Optional[Difficulty]:
    """Return the last difficulty named in text (EASY / MEDIUM / HARD / EXPERT)."""
    if not text or not str(text).strip():
        return None
    matches = _DIFFICULTY_RE.findall(str(text))
    if not matches:
        return None
    return _DIFFICULTY_ALIASES[matches[-1].upper()]


class AIQuestionGenerator:
    """Generate and persist AI-authored questions."""

    def __init__(self) -> None:
        self._repo = QuestionRepository()

    async def generate_and_store_question(
        self,
        subject: Optional[str],
        topic: Optional[str],
        *,
        difficulty: Optional[Difficulty] = None,
        exam_tag: Optional[str] = None,
        folder_admin_username: Optional[str] = None,
    ) -> Optional[str]:
        """Create one AI question, mark it generated, and file it under AI Generated."""
        if not ai_any_configured():
            return None

        level = difficulty or Difficulty.EXPERT
        payload = await asyncio.to_thread(
            self._generate_question_payload,
            subject,
            topic,
            None,
            level,
            exam_tag,
        )
        if not payload:
            return None

        try:
            qc = self._payload_to_question_create(
                payload,
                subject=subject,
                topic=topic,
                difficulty=level,
                exam_tag=exam_tag,
            )
            doc = question_create_to_doc(qc)
        except Exception as exc:
            logger.warning("Generated question payload failed validation: %s", exc)
            return None

        dup = await self._repo.find_ids_by_text_hash(doc["question_text"])
        if dup:
            return None
        qid = await self._repo.insert_one(doc)
        await self._file_in_ai_generated_folder(
            qid,
            exam_tag,
            str(doc.get("topic") or topic or "General"),
            folder_admin_username,
        )
        return qid

    async def generate_and_store_expert_question(
        self,
        subject: Optional[str],
        topic: Optional[str],
        exam_tag: Optional[str] = None,
        folder_admin_username: Optional[str] = None,
    ) -> Optional[str]:
        return await self.generate_and_store_question(
            subject,
            topic,
            difficulty=Difficulty.EXPERT,
            exam_tag=exam_tag,
            folder_admin_username=folder_admin_username,
        )

    async def _file_in_ai_generated_folder(
        self,
        question_id: str,
        exam_tag: Optional[str],
        topic: Optional[str],
        folder_admin_username: Optional[str],
    ) -> None:
        from app.repositories.user_repository import UserRepository
        from app.services.question_bank_folder_service import QuestionBankFolderError, QuestionBankFolderService
        from app.utils.exam_tags import OTHERS_EXAM_TAG

        owners: List[str] = []
        owner = str(folder_admin_username or "").strip()
        if owner:
            owners = [owner]
        else:
            admins = await UserRepository().list_by_role("admin", limit=500)
            owners = [str(a.get("username") or "").strip() for a in admins if str(a.get("username") or "").strip()]

        raw = str(exam_tag or "").strip()
        tag = normalize_exam_tag(raw) if raw and not is_others_exam(raw) else OTHERS_EXAM_TAG
        topic_name = str(topic or "").strip() or "General"
        svc = QuestionBankFolderService()
        for name in owners:
            try:
                await svc.ensure_path(
                    name,
                    tag,
                    AI_GENERATED_FOLDER_SUBJECT,
                    topic_name,
                    question_id=question_id,
                )
            except QuestionBankFolderError as exc:
                logger.warning("Could not file AI question %s for %s: %s", question_id, name, exc)
            except Exception as exc:
                logger.warning("Could not file AI question %s for %s: %s", question_id, name, exc)

    async def generate_expert_draft_question(
        self,
        prompt: str,
        subject: Optional[str],
        topic: Optional[str],
    ) -> Optional[QuestionCreate]:
        """Generate (but do not store) one question draft from admin prompt."""
        if not ai_any_configured():
            return None
        requested = difficulty_from_prompt(prompt)
        payload = await asyncio.to_thread(
            self._generate_question_payload,
            subject,
            topic,
            prompt,
            requested,
            None,
        )
        if not payload:
            return None
        try:
            return self._payload_to_question_create(
                payload,
                subject=subject,
                topic=topic,
                difficulty=requested,
            )
        except Exception as exc:
            logger.warning("Generated expert draft payload failed validation: %s", exc)
            return None

    def _generate_question_payload(
        self,
        subject: Optional[str],
        topic: Optional[str],
        admin_prompt: Optional[str] = None,
        requested_difficulty: Optional[Difficulty] = None,
        exam_tag: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        prompt = self._build_prompt(
            subject,
            topic,
            admin_prompt=admin_prompt,
            requested_difficulty=requested_difficulty,
            exam_tag=exam_tag,
        )
        exam_label = _exam_label(exam_tag)
        try:
            result = chat_completion(
                system=(
                    f"You are a senior {exam_label} paper setter with decades of experience. "
                    f"Produce rigorous, unambiguous, test-ready questions that match {exam_label} "
                    "style and difficulty norms."
                ),
                user=prompt,
                temperature=0.7,
                timeout=25,
            )
            cleaned = strip_markdown_fence(result.content)
            return json.loads(cleaned)
        except LlmChatError as exc:
            logger.warning("AI request failed while generating expert question: %s", exc.message)
            return None
        except Exception as exc:
            logger.warning("AI response parse failed for expert question generation: %s", exc)
            return None

    @staticmethod
    def _build_prompt(
        subject: Optional[str],
        topic: Optional[str],
        admin_prompt: Optional[str] = None,
        requested_difficulty: Optional[Difficulty] = None,
        exam_tag: Optional[str] = None,
    ) -> str:
        sub = (subject or "Mathematics").strip() or "Mathematics"
        top = (topic or "Mixed").strip() or "Mixed"
        user_prompt = (admin_prompt or "").strip()
        level = (requested_difficulty or Difficulty.EXPERT).value
        exam_label = _exam_label(exam_tag)
        raw_exam = str(exam_tag or "").strip()
        forced_tag = (
            normalize_exam_tag(raw_exam)
            if raw_exam and not is_others_exam(raw_exam)
            else None
        )
        tag_rule = (
            f'- tags MUST be ["{forced_tag}"] only.'
            if forced_tag
            else "- tags MUST contain exactly one exam category from: CAT, SSC, BANK, RAILWAY, DEFENCE, STATE, OTHER."
        )
        return (
            f"Generate exactly one {level}-level {exam_label}-style MCQ and return ONLY valid JSON with this shape:\n"
            "{\n"
            '  "question_text": "string",\n'
            '  "option_a": "string",\n'
            '  "option_b": "string",\n'
            '  "option_c": "string",\n'
            '  "option_d": "string",\n'
            '  "correct_answer": "option_a|option_b|option_c|option_d",\n'
            '  "explanation": "string",\n'
            '  "subject": "string",\n'
            '  "topic": "string",\n'
            '  "difficulty": "EASY|MEDIUM|HARD|EXPERT",\n'
            '  "tags": ["CAT|SSC|BANK|RAILWAY|DEFENCE|STATE|OTHER"]\n'
            "}\n"
            "Rules:\n"
            "- Use subject/topic close to the given context.\n"
            f"- Difficulty MUST be {level}. Set JSON difficulty to {level}. Match stem, options, and explanation to that level.\n"
            "- If the admin prompt names EASY, MEDIUM, HARD, or EXPERT, that level overrides any other default.\n"
            "- No ambiguous wording; exactly one correct option.\n"
            "- Keep options balanced and plausible.\n"
            f"{tag_rule}\n"
            f"Context: exam={exam_label}, subject={sub}, topic={top}\n"
            f"Additional admin prompt/instruction: {user_prompt if user_prompt else '(none)'}"
        )

    @staticmethod
    def _payload_to_question_create(
        payload: Dict[str, Any],
        subject: Optional[str],
        topic: Optional[str],
        difficulty: Optional[Difficulty] = None,
        exam_tag: Optional[str] = None,
    ) -> QuestionCreate:
        opts: List[QuestionOption] = [
            QuestionOption(key="a", label=str(payload.get("option_a", "")).strip()),
            QuestionOption(key="b", label=str(payload.get("option_b", "")).strip()),
            QuestionOption(key="c", label=str(payload.get("option_c", "")).strip()),
            QuestionOption(key="d", label=str(payload.get("option_d", "")).strip()),
        ]

        tags = payload.get("tags")
        if not isinstance(tags, list):
            tags = []
        # Question tags are reserved for exam categories.
        clean_tags = [str(t).strip().upper() for t in tags if str(t).strip()]
        forced = normalize_exam_tags([str(exam_tag)]) if exam_tag and str(exam_tag).strip() else []
        if forced:
            clean_tags = forced
        elif not clean_tags:
            clean_tags = ["OTHER"]

        resolved = difficulty or difficulty_from_prompt(str(payload.get("difficulty", "")).strip())
        return QuestionCreate(
            question_text=str(payload.get("question_text", "")).strip(),
            question_type=QuestionType.MCQ_SINGLE,
            options=opts,
            correct_answer=str(payload.get("correct_answer", "")).strip().lower(),
            explanation=str(payload.get("explanation", "")).strip() or None,
            difficulty=resolved or Difficulty.EXPERT,
            subject=str(payload.get("subject", "")).strip() or (subject or "Mathematics"),
            topic=str(payload.get("topic", "")).strip() or (topic or "Mixed"),
            tags=clean_tags,
            is_ai_generated=True,
        )

    async def classify_difficulties_batch(self, docs: List[Dict[str, Any]]) -> Dict[str, Difficulty]:
        """Return ``question_id`` → ``Difficulty`` for each document in ``docs`` (single OpenAI call)."""
        if not ai_any_configured() or not docs:
            return {}
        return await asyncio.to_thread(self._classify_difficulties_sync, docs)

    def _classify_difficulties_sync(self, docs: List[Dict[str, Any]]) -> Dict[str, Difficulty]:
        items: List[Dict[str, Any]] = []
        for d in docs:
            qid = oid_str(d["_id"])
            text = str(d.get("question_text", "")).strip()
            if len(text) > 2400:
                text = text[:2400] + "…"
            tags = d.get("tags") or []
            if not isinstance(tags, list):
                tags = []
            tag_list = [str(t).strip().upper() for t in tags if str(t).strip()]
            items.append(
                {
                    "question_id": qid,
                    "exam_categories": tag_list or ["OTHER"],
                    "subject": str(d.get("subject", "General")).strip() or "General",
                    "topic": str(d.get("topic", "General")).strip() or "General",
                    "question_type": str(d.get("question_type", "mcq_single")).strip().lower(),
                    "question_text": text,
                }
            )

        system = (
            "You assign difficulty labels for Indian competitive-exam practice questions. "
            "Use norms for the stated exam categories (e.g. CAT quant is often harder than "
            "equivalent SSC for the same mathematical topic). "
            "Each question must get exactly one of: EASY, MEDIUM, HARD, EXPERT. "
            "Reply with ONLY valid JSON, no markdown: "
            '{"results":[{"question_id":"<id>","difficulty":"EASY|MEDIUM|HARD|EXPERT"}]} '
            "Include one entry for every question_id you were given, in any order."
        )
        user = json.dumps({"questions": items}, ensure_ascii=False)
        try:
            result = chat_completion(
                system=system,
                user=user,
                temperature=0.25,
                max_tokens=800,
                json_mode=True,
                timeout=60,
            )
            cleaned = strip_markdown_fence(result.content)
            parsed = json.loads(cleaned)
        except LlmChatError as exc:
            logger.warning("AI request failed for difficulty classification: %s", exc.message)
            return {}
        except Exception as exc:
            logger.warning("AI difficulty classification parse failed: %s", exc)
            return {}

        results = parsed.get("results")
        if not isinstance(results, list):
            return {}

        expected = {it["question_id"] for it in items}
        out: Dict[str, Difficulty] = {}
        for row in results:
            if not isinstance(row, dict):
                continue
            qid = str(row.get("question_id", "")).strip()
            raw_d = str(row.get("difficulty", "")).strip().upper()
            if qid not in expected or qid in out:
                continue
            try:
                out[qid] = Difficulty(raw_d)
            except Exception:
                continue
        return out
