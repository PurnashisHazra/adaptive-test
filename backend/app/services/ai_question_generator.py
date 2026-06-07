import asyncio
import json
import logging
from typing import Any, Dict, List, Optional

from app.services.llm_client import LlmChatError, ai_any_configured, chat_completion, strip_markdown_fence
from app.models.domain import Difficulty, QuestionType
from app.repositories.question_repository import QuestionRepository
from app.schemas.question import QuestionCreate, QuestionOption
from app.services.question_service import question_create_to_doc
from app.utils.ids import oid_str

logger = logging.getLogger(__name__)


class AIQuestionGenerator:
    """Generate and persist AI-authored expert questions."""

    def __init__(self) -> None:
        self._repo = QuestionRepository()

    async def generate_and_store_expert_question(
        self,
        subject: Optional[str],
        topic: Optional[str],
    ) -> Optional[str]:
        if not ai_any_configured():
            return None

        payload = await asyncio.to_thread(self._generate_question_payload, subject, topic)
        if not payload:
            return None

        try:
            qc = self._payload_to_question_create(payload, subject=subject, topic=topic)
            doc = question_create_to_doc(qc)
        except Exception as exc:
            logger.warning("Generated expert question payload failed validation: %s", exc)
            return None

        dup = await self._repo.find_ids_by_text_hash(doc["question_text"])
        if dup:
            return None
        return await self._repo.insert_one(doc)

    async def generate_expert_draft_question(
        self,
        prompt: str,
        subject: Optional[str],
        topic: Optional[str],
    ) -> Optional[QuestionCreate]:
        """Generate (but do not store) one EXPERT question draft from admin prompt."""
        if not ai_any_configured():
            return None
        payload = await asyncio.to_thread(self._generate_question_payload, subject, topic, prompt)
        if not payload:
            return None
        try:
            return self._payload_to_question_create(payload, subject=subject, topic=topic)
        except Exception as exc:
            logger.warning("Generated expert draft payload failed validation: %s", exc)
            return None

    def _generate_question_payload(
        self,
        subject: Optional[str],
        topic: Optional[str],
        admin_prompt: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        prompt = self._build_prompt(subject, topic, admin_prompt=admin_prompt)
        try:
            result = chat_completion(
                system=(
                    "You are a CAT convener with 50+ years of experience setting high-quality "
                    "CAT exam questions. Produce rigorous, unambiguous, test-ready questions."
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
    def _build_prompt(subject: Optional[str], topic: Optional[str], admin_prompt: Optional[str] = None) -> str:
        sub = (subject or "Mathematics").strip() or "Mathematics"
        top = (topic or "Mixed").strip() or "Mixed"
        user_prompt = (admin_prompt or "").strip()
        return (
            "Generate exactly one EXPERT-level CAT-style MCQ and return ONLY valid JSON with this shape:\n"
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
            '  "tags": ["CAT|SSC|BANK|RAILWAY|DEFENCE|STATE|OTHER"]\n'
            "}\n"
            "Rules:\n"
            "- Use subject/topic close to the given context.\n"
            "- Difficulty must be truly EXPERT.\n"
            "- No ambiguous wording; exactly one correct option.\n"
            "- Keep options balanced and plausible.\n"
            "- tags MUST contain exactly one exam category from: CAT, SSC, BANK, RAILWAY, DEFENCE, STATE, OTHER.\n"
            f"Context: subject={sub}, topic={top}\n"
            f"Additional admin prompt/instruction: {user_prompt if user_prompt else '(none)'}"
        )

    @staticmethod
    def _payload_to_question_create(
        payload: Dict[str, Any],
        subject: Optional[str],
        topic: Optional[str],
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
        if not clean_tags:
            clean_tags = ["OTHER"]

        return QuestionCreate(
            question_text=str(payload.get("question_text", "")).strip(),
            question_type=QuestionType.MCQ_SINGLE,
            options=opts,
            correct_answer=str(payload.get("correct_answer", "")).strip().lower(),
            explanation=str(payload.get("explanation", "")).strip() or None,
            difficulty=Difficulty.EXPERT,
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
