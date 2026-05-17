"""Turn a question's official explanation into a short in-session hint (OpenAI)."""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, Optional
from urllib import error as urllib_error
from urllib import request

from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.schemas.attempt import CoachExplanationHintResponse

logger = logging.getLogger(__name__)


def _strip_markdown_fence(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        lines = t.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        t = "\n".join(lines).strip()
    return t


class _RawHint(BaseModel):
    hint: str = Field(default="", max_length=1200)


def request_openai_explanation_hint(
    question_text: str,
    explanation: str,
) -> CoachExplanationHintResponse:
    settings = get_settings()
    key = (settings.openai_api_key or "").strip()
    if not key:
        return CoachExplanationHintResponse(
            openai_configured=False,
            used_openai=False,
            error="OpenAI is not configured (set OPENAI_API_KEY on the server).",
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

    body: Dict[str, Any] = {
        "model": settings.openai_model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You convert official answer explanations into gentle, Socratic hints for students "
                    "who are stuck during a timed test. Never leak the final answer key."
                ),
            },
            {"role": "user", "content": user_content},
        ],
        "temperature": 0.35,
        "max_tokens": 400,
    }

    req = request.Request(
        settings.openai_api_url,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=35) as resp:
            raw_http = resp.read().decode("utf-8")
    except urllib_error.HTTPError as exc:
        logger.warning("OpenAI HTTP error for explanation hint: %s", exc)
        return CoachExplanationHintResponse(
            openai_configured=True,
            used_openai=False,
            error=f"OpenAI request failed ({getattr(exc, 'code', 'error')}).",
        )
    except Exception as exc:
        logger.warning("OpenAI request failed for explanation hint: %s", exc)
        return CoachExplanationHintResponse(
            openai_configured=True,
            used_openai=False,
            error="OpenAI request failed or timed out.",
        )

    try:
        data = json.loads(raw_http)
        content = data["choices"][0]["message"]["content"]
        cleaned = _strip_markdown_fence(content)
        parsed = _RawHint.model_validate_json(cleaned)
    except Exception as exc:
        logger.warning("OpenAI explanation hint parse failed: %s", exc)
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
