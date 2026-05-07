import asyncio
import json
import logging
from typing import Any, Dict, List, Optional
from urllib import request

from app.core.config import get_settings
from app.models.domain import Difficulty, QuestionType
from app.repositories.question_repository import QuestionRepository
from app.schemas.question import QuestionCreate, QuestionOption
from app.services.question_service import question_create_to_doc

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
        settings = get_settings()
        if not settings.openai_api_key:
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
        settings = get_settings()
        if not settings.openai_api_key:
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
        settings = get_settings()
        prompt = self._build_prompt(subject, topic, admin_prompt=admin_prompt)
        body = {
            "model": settings.openai_model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a CAT convener with 50+ years of experience setting high-quality "
                        "CAT exam questions. Produce rigorous, unambiguous, test-ready questions."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.7,
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
            with request.urlopen(req, timeout=25) as resp:
                raw = resp.read().decode("utf-8")
        except Exception as exc:
            logger.warning("OpenAI request failed while generating expert question: %s", exc)
            return None

        try:
            data = json.loads(raw)
            content = data["choices"][0]["message"]["content"]
            cleaned = self._strip_markdown_fence(content)
            return json.loads(cleaned)
        except Exception as exc:
            logger.warning("OpenAI response parse failed for expert question generation: %s", exc)
            return None

    @staticmethod
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
