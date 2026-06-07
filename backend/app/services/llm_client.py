"""Chat completions: try OpenAI first, then Google Gemini as fallback."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Literal, Optional
from urllib import error as urllib_error
from urllib import request

from app.core.config import get_settings

logger = logging.getLogger(__name__)

LlmProvider = Literal["openai", "gemini"]


@dataclass
class LlmChatResult:
    content: str
    provider: LlmProvider


class LlmChatError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


def strip_markdown_fence(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        lines = t.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        t = "\n".join(lines).strip()
    return t


def ai_any_configured() -> bool:
    settings = get_settings()
    return bool((settings.openai_api_key or "").strip() or (settings.gemini_api_key or "").strip())


def ai_not_configured_message() -> str:
    return "AI is not configured (set OPENAI_API_KEY or GEMINI_API_KEY on the server)."


def _openai_chat(
    *,
    system: str,
    user: str,
    temperature: float,
    max_tokens: Optional[int],
    json_mode: bool,
    timeout: int,
) -> str:
    settings = get_settings()
    key = (settings.openai_api_key or "").strip()
    if not key:
        raise LlmChatError("OpenAI API key is not set")

    body: Dict[str, Any] = {
        "model": settings.openai_model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
    }
    if max_tokens is not None:
        body["max_tokens"] = max_tokens
    if json_mode:
        body["response_format"] = {"type": "json_object"}

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
        with request.urlopen(req, timeout=timeout) as resp:
            raw_http = resp.read().decode("utf-8")
    except urllib_error.HTTPError as exc:
        raise LlmChatError(f"OpenAI HTTP {getattr(exc, 'code', 'error')}") from exc
    except Exception as exc:
        raise LlmChatError("OpenAI request failed or timed out") from exc

    try:
        data = json.loads(raw_http)
        return str(data["choices"][0]["message"]["content"])
    except Exception as exc:
        raise LlmChatError("OpenAI response parse failed") from exc


def _gemini_chat(
    *,
    system: str,
    user: str,
    temperature: float,
    max_tokens: Optional[int],
    json_mode: bool,
    timeout: int,
) -> str:
    settings = get_settings()
    key = (settings.gemini_api_key or "").strip()
    if not key:
        raise LlmChatError("Gemini API key is not set")

    model = settings.gemini_model.strip() or "gemini-3.1-flash-lite"
    base = (settings.gemini_api_url or "").rstrip("/")
    url = f"{base}/models/{model}:generateContent?key={key}"

    combined = f"{system.strip()}\n\n{user.strip()}" if system.strip() else user.strip()
    gen_config: Dict[str, Any] = {"temperature": temperature}
    if max_tokens is not None:
        gen_config["maxOutputTokens"] = max_tokens
    if json_mode:
        gen_config["responseMimeType"] = "application/json"

    body: Dict[str, Any] = {
        "contents": [{"role": "user", "parts": [{"text": combined}]}],
        "generationConfig": gen_config,
    }

    req = request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=timeout) as resp:
            raw_http = resp.read().decode("utf-8")
    except urllib_error.HTTPError as exc:
        detail = ""
        try:
            detail = exc.read().decode("utf-8")[:300]
        except Exception:
            pass
        raise LlmChatError(f"Gemini HTTP {getattr(exc, 'code', 'error')}: {detail}") from exc
    except Exception as exc:
        raise LlmChatError("Gemini request failed or timed out") from exc

    try:
        data = json.loads(raw_http)
        candidates = data.get("candidates") or []
        if not candidates:
            raise LlmChatError("Gemini returned no candidates")
        parts = (candidates[0].get("content") or {}).get("parts") or []
        if not parts:
            raise LlmChatError("Gemini returned empty content")
        return str(parts[0].get("text", ""))
    except LlmChatError:
        raise
    except Exception as exc:
        raise LlmChatError("Gemini response parse failed") from exc


def chat_completion(
    *,
    system: str,
    user: str,
    temperature: float = 0.35,
    max_tokens: Optional[int] = None,
    json_mode: bool = False,
    timeout: int = 55,
) -> LlmChatResult:
    """Try OpenAI, then Gemini on failure. Raises LlmChatError if both fail or neither is configured."""
    settings = get_settings()
    errors: List[str] = []

    if (settings.openai_api_key or "").strip():
        try:
            content = _openai_chat(
                system=system,
                user=user,
                temperature=temperature,
                max_tokens=max_tokens,
                json_mode=json_mode,
                timeout=timeout,
            )
            return LlmChatResult(content=content, provider="openai")
        except LlmChatError as exc:
            errors.append(str(exc.message))
            logger.warning("OpenAI chat failed, trying Gemini fallback: %s", exc.message)

    if (settings.gemini_api_key or "").strip():
        try:
            content = _gemini_chat(
                system=system,
                user=user,
                temperature=temperature,
                max_tokens=max_tokens,
                json_mode=json_mode,
                timeout=timeout,
            )
            return LlmChatResult(content=content, provider="gemini")
        except LlmChatError as exc:
            errors.append(str(exc.message))
            logger.warning("Gemini chat failed: %s", exc.message)

    if not errors:
        raise LlmChatError(ai_not_configured_message())
    raise LlmChatError("; ".join(errors))
