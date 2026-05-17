"""OpenAI-backed optimum time-management plan for a single attempt (student-only API)."""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Literal, Optional, cast
from urllib import error as urllib_error
from urllib import request

from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.schemas.student_analytics import (
    StudentAttemptTimeStrategyResponse,
    StudentOverallAnalytics,
    StudentStandaloneDetail,
    StudentTimeStrategyPerQuestion,
    TimeStrategyAction,
)

logger = logging.getLogger(__name__)

RiskLevel = Literal["low", "medium", "high"]

_ACTION_ALIASES: Dict[str, TimeStrategyAction] = {
    "full_attempt": "full_attempt",
    "full": "full_attempt",
    "normal": "full_attempt",
    "time_cap": "time_cap",
    "cap": "time_cap",
    "cap_time": "time_cap",
    "defer_revisit": "defer_revisit",
    "defer": "defer_revisit",
    "revisit": "defer_revisit",
    "skip_if_behind": "skip_if_behind",
    "skip": "skip_if_behind",
    "skip_late": "skip_if_behind",
}


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


def _normalize_action(raw: str) -> TimeStrategyAction:
    key = (raw or "").strip().lower().replace(" ", "_").replace("-", "_")
    if key in _ACTION_ALIASES:
        return _ACTION_ALIASES[key]
    if "skip" in key:
        return "skip_if_behind"
    if "defer" in key or "revisit" in key:
        return "defer_revisit"
    if "cap" in key or "limit" in key:
        return "time_cap"
    return "full_attempt"


def _normalize_risk(raw: str) -> RiskLevel:
    k = (raw or "").strip().lower()
    if k in {"low", "medium", "high"}:
        return cast(RiskLevel, k)
    if "high" in k:
        return "high"
    if "med" in k or "mid" in k:
        return "medium"
    return "low"


class _RawPQ(BaseModel):
    index: int = 1
    time_action: str = "full_attempt"
    risk_level: str = "low"
    hint: str = ""


class _RawOut(BaseModel):
    summary: str = ""
    risks_overview: str = ""
    per_question: List[_RawPQ] = Field(default_factory=list)
    cumulative_optimal_seconds: List[float] = Field(default_factory=list)


def build_time_strategy_user_payload(detail: StudentStandaloneDetail, overall: StudentOverallAnalytics) -> Dict[str, Any]:
    qs: List[Dict[str, Any]] = []
    for q in sorted(detail.questions, key=lambda x: x.index):
        caps = [c.key for c in (q.insight_capsules or [])]
        qs.append(
            {
                "index": q.index,
                "difficulty_when_served": q.difficulty_when_served,
                "is_correct": q.is_correct,
                "time_spent_seconds": q.time_spent_seconds,
                "peer_avg_time_seconds": q.peer_avg_time_seconds,
                "peer_accuracy_percent": q.peer_accuracy_percent,
                "insight_capsules": caps,
                "question_excerpt": (q.question_text or "")[:200],
            }
        )
    ins = detail.insights
    return {
        "attempt_id": detail.attempt_id,
        "title": detail.title,
        "subject": detail.subject,
        "topic": detail.topic,
        "score": detail.score,
        "total_questions": detail.total_questions,
        "percentage": detail.percentage,
        "ended_early": detail.ended_early,
        "questions": qs,
        "attempt_insights": {
            "accuracy_percent": ins.accuracy_percent,
            "avg_time_seconds": ins.avg_time_seconds,
            "wasted_time_questions": ins.wasted_time_questions,
            "missed_opportunity_questions": ins.missed_opportunity_questions,
            "skip_candidate_questions": ins.skip_candidate_questions,
        },
        "dashboard_strategy": overall.strategy_to_desired_state,
        "desired_state": overall.desired_state.model_dump(),
        "dimensions": [
            {"key": d.key, "label": d.label, "overall_strength": d.overall_strength} for d in overall.dimensions
        ],
    }


def _normalize_cumulative(raw: List[float], n: int, total_actual_seconds: float) -> List[float]:
    if n <= 0:
        return []
    step = max(15.0, (total_actual_seconds / max(n, 1)) * 0.45)
    vals = [max(0.0, float(x)) for x in raw if x is not None]
    if len(vals) < n:
        last = vals[-1] if vals else 0.0
        while len(vals) < n:
            last = last + step
            vals.append(last)
    vals = vals[:n]
    for i in range(1, len(vals)):
        if vals[i] < vals[i - 1]:
            vals[i] = vals[i - 1]
    return [round(x, 1) for x in vals]


def _normalize_per_question(rows: List[_RawPQ], n: int) -> List[StudentTimeStrategyPerQuestion]:
    by_idx: Dict[int, _RawPQ] = {}
    for r in rows:
        if r.index >= 1:
            by_idx[r.index] = r
    out: List[StudentTimeStrategyPerQuestion] = []
    for i in range(1, n + 1):
        r = by_idx.get(i) or _RawPQ(index=i, time_action="full_attempt", risk_level="low", hint="Standard pacing.")
        try:
            out.append(
                StudentTimeStrategyPerQuestion(
                    index=i,
                    time_action=_normalize_action(r.time_action),
                    risk_level=_normalize_risk(r.risk_level),
                    hint=(r.hint or "")[:500],
                )
            )
        except Exception:
            out.append(
                StudentTimeStrategyPerQuestion(
                    index=i,
                    time_action="full_attempt",
                    risk_level="low",
                    hint="Standard pacing.",
                )
            )
    return out


def request_openai_time_strategy(detail: StudentStandaloneDetail, overall: StudentOverallAnalytics) -> StudentAttemptTimeStrategyResponse:
    settings = get_settings()
    key = (settings.openai_api_key or "").strip()
    if not key:
        return StudentAttemptTimeStrategyResponse(
            openai_configured=False,
            used_openai=False,
            error="OpenAI is not configured (set OPENAI_API_KEY on the server).",
        )

    n = len(detail.questions)
    if n == 0:
        return StudentAttemptTimeStrategyResponse(
            openai_configured=True,
            used_openai=False,
            error="No questions in this attempt.",
        )

    payload = build_time_strategy_user_payload(detail, overall)
    total_actual = sum(max(0, int(q.time_spent_seconds or 0)) for q in detail.questions)

    schema = (
        "Respond with a single JSON object ONLY, keys:\n"
        '"summary": string (2-4 sentences),\n'
        '"risks_overview": string (what the student risks by skipping, capping time, or deferring — be concrete),\n'
        '"per_question": array of exactly N objects in question order, N=' + str(n) + ", each:\n"
        '  { "index": integer 1..N, "time_action": one of full_attempt|time_cap|defer_revisit|skip_if_behind,\n'
        '    "risk_level": one of low|medium|high, "hint": string (one short sentence) }\n'
        "time_action meanings: full_attempt = spend normal effort; time_cap = hard time ceiling then move on; "
        "defer_revisit = minimal time now, revisit if time remains; skip_if_behind = skip or guess quickly if behind schedule.\n"
        '"cumulative_optimal_seconds": array of exactly N numbers — after finishing questions 1..k, cumulative seconds '
        "the student should have spent under your plan (non-decreasing, realistic for the test).\n"
    )

    user_content = json.dumps(payload, ensure_ascii=False) + "\n\n" + schema

    body: Dict[str, Any] = {
        "model": settings.openai_model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You optimise exam time management for high-stakes adaptive tests. "
                    "Use the dashboard strategy lines and per-question stats (difficulty, correctness, time vs peers, insight flags). "
                    "Be conservative: skipping has a real marks risk; say so in risk_level and risks_overview. "
                    "Output valid JSON only."
                ),
            },
            {"role": "user", "content": user_content},
        ],
        "temperature": 0.35,
        "response_format": {"type": "json_object"},
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
        with request.urlopen(req, timeout=55) as resp:
            raw_http = resp.read().decode("utf-8")
    except urllib_error.HTTPError as exc:
        logger.warning("OpenAI HTTP error for time strategy: %s", exc)
        return StudentAttemptTimeStrategyResponse(
            openai_configured=True,
            used_openai=False,
            error=f"OpenAI request failed ({getattr(exc, 'code', 'error')}).",
        )
    except Exception as exc:
        logger.warning("OpenAI request failed for time strategy: %s", exc)
        return StudentAttemptTimeStrategyResponse(
            openai_configured=True,
            used_openai=False,
            error="OpenAI request failed or timed out.",
        )

    try:
        data = json.loads(raw_http)
        content = data["choices"][0]["message"]["content"]
        cleaned = _strip_markdown_fence(content)
        parsed = _RawOut.model_validate_json(cleaned)
    except Exception as exc:
        logger.warning("OpenAI time strategy parse failed: %s", exc)
        return StudentAttemptTimeStrategyResponse(
            openai_configured=True,
            used_openai=False,
            error="Could not parse the model response.",
        )

    per_q = _normalize_per_question(parsed.per_question, n)
    cum = _normalize_cumulative(parsed.cumulative_optimal_seconds, n, float(total_actual))

    return StudentAttemptTimeStrategyResponse(
        openai_configured=True,
        used_openai=True,
        error=None,
        summary=(parsed.summary or "").strip()[:2000],
        risks_overview=(parsed.risks_overview or "").strip()[:4000],
        per_question=per_q,
        cumulative_optimal_seconds=cum,
    )
