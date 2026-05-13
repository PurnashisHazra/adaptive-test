"""Normalize and build MongoDB filters for question bank text search."""

from __future__ import annotations

import html
import re
import unicodedata
from typing import Any, Dict, List, Optional

# Zero-width / BOM etc. that often break copy-paste matching
_ZW_RE = re.compile(r"[\u200b-\u200f\u2028\u2029\u2060\uFEFF]")

# Reasonable limits so queries stay fast and BSON-safe
_MAX_SEARCH_CHARS = 48_000
_MAX_TOKEN_LEN = 280
_MAX_SINGLE_CHUNK = 12_000  # one token with no spaces (e.g. pasted paragraph / CJK)
_MAX_TOKENS = 48


def normalize_search_input(raw: Optional[str]) -> str:
    """NFKC (full-width → ASCII, compatibility forms), strip zero-width, trim."""
    if not raw:
        return ""
    s = str(raw)
    if len(s) > _MAX_SEARCH_CHARS:
        s = s[:_MAX_SEARCH_CHARS]
    s = html.unescape(s)
    s = unicodedata.normalize("NFKC", s)
    s = _ZW_RE.sub("", s)
    return s.strip()


def _norm_like_stored_question_text(text: str) -> str:
    """Same shape as ``question_text_norm`` in the DB (lowercase, whitespace collapsed)."""
    return " ".join(text.lower().split())


def search_tokens(normalized: str) -> List[str]:
    """Split on whitespace into non-empty tokens; cap count and length."""
    if not normalized:
        return []
    parts = [p for p in re.split(r"\s+", normalized.strip()) if p]
    if not parts:
        return []
    # One continuous chunk (no spaces): allow a long substring match (CJK / pasted blob).
    if len(parts) == 1:
        p = parts[0]
        if len(p) > _MAX_SINGLE_CHUNK:
            p = p[:_MAX_SINGLE_CHUNK]
        return [p] if p else []
    out: List[str] = []
    for p in parts[:_MAX_TOKENS]:
        if len(p) > _MAX_TOKEN_LEN:
            p = p[:_MAX_TOKEN_LEN]
        if p:
            out.append(p)
    return out


def _token_clause(escaped_literal: str, norm_token: str) -> Dict[str, Any]:
    """One token must appear in question text, normalized text, explanation, tags, or option labels."""
    esc_norm = re.escape(norm_token)
    return {
        "$or": [
            {"question_text": {"$regex": escaped_literal, "$options": "i"}},
            {"question_text_norm": {"$regex": esc_norm, "$options": "i"}},
            {"explanation": {"$regex": escaped_literal, "$options": "i"}},
            {"tags": {"$regex": escaped_literal, "$options": "i"}},
            {"options": {"$elemMatch": {"label": {"$regex": escaped_literal, "$options": "i"}}}},
        ]
    }


def build_search_filter(search: Optional[str]) -> Optional[Dict[str, Any]]:
    """
    Return a filter fragment (to combine with ``$and``) or None.

    - Case-insensitive (``$options: i``).
    - Unicode NFKC + zero-width strip on input.
    - Multiple whitespace-separated tokens: **all** must match (AND), each anywhere in text/explanation/tags/options.
    - Regex metacharacters in the user's text are escaped (literal substring).
    """
    normalized = normalize_search_input(search)
    if not normalized:
        return None
    tokens = search_tokens(normalized)
    if not tokens:
        return None

    token_clauses: List[Dict[str, Any]] = []
    for tok in tokens:
        escaped = re.escape(tok)
        norm_tok = _norm_like_stored_question_text(tok)
        token_clauses.append(_token_clause(escaped, norm_tok))

    if len(token_clauses) == 1:
        return token_clauses[0]
    return {"$and": token_clauses}
