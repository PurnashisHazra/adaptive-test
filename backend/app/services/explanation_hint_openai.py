"""Turn a question's official explanation into a short in-session hint (OpenAI / Gemini)."""

from __future__ import annotations

import json
import logging
import re

from pydantic import BaseModel, Field

from app.schemas.attempt import CoachExplanationHintResponse
from app.services.llm_client import (
    LlmChatError,
    ai_any_configured,
    ai_not_configured_message,
    chat_completion,
    strip_markdown_fence,
)

logger = logging.getLogger(__name__)


class _RawHint(BaseModel):
    hint: str = Field(default="", max_length=1200)


def request_openai_explanation_hint(
    question_text: str,
    explanation: str,
) -> CoachExplanationHintResponse:
    if not ai_any_configured():
        return CoachExplanationHintResponse(
            openai_configured=False,
            used_openai=False,
            error=ai_not_configured_message(),
        )

    exp = (explanation or "").strip()
    if not exp:
        return CoachExplanationHintResponse(
            openai_configured=True,
            used_openai=False,
            error="This question has no explanation on file to turn into a hint.",
        )

    stem = (question_text or "").strip()[:1200]
    schema = (
        'Respond with a single JSON object ONLY, shape: {"hint": string}.\n'
        "The hint must be at most 3 short sentences (under 500 characters total preferred).\n"
        "It should nudge the learner's reasoning toward the solution using ideas from the explanation, "
        "without copying the explanation verbatim and without stating the final multiple-choice letter or "
        "the exact numeric final answer if the item is numeric.\n"
        "If the item is multiple choice, do not name which option is correct."
    )
    user_content = json.dumps(
        {"question_text": stem, "official_explanation": exp[:6000]},
        ensure_ascii=False,
    )
    user_content = user_content + "\n\n" + schema

    try:
        result = chat_completion(
            system=(
                "You convert official answer explanations into gentle, Socratic hints for students "
                "who are stuck during a timed test. Never leak the final answer key."
            ),
            user=user_content,
            temperature=0.35,
            max_tokens=400,
            timeout=35,
        )
        cleaned = strip_markdown_fence(result.content)
        parsed = _RawHint.model_validate_json(cleaned)
    except LlmChatError as exc:
        logger.warning("AI explanation hint failed: %s", exc.message)
        return CoachExplanationHintResponse(
            openai_configured=True,
            used_openai=False,
            error=exc.message,
        )
    except Exception as exc:
        logger.warning("AI explanation hint parse failed: %s", exc)
        return CoachExplanationHintResponse(
            openai_configured=True,
            used_openai=False,
            error="Could not parse the model response.",
        )

    hint = re.sub(r"\s+", " ", (parsed.hint or "").strip())[:1200]
    if not hint:
        return CoachExplanationHintResponse(
            openai_configured=True,
            used_openai=False,
            error="The model returned an empty hint.",
        )

    return CoachExplanationHintResponse(openai_configured=True, used_openai=True, hint=hint, error=None)
