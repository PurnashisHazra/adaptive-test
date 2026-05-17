"""OpenAI-backed accuracy improvement plan (concepts, tricks, formulae, deep knowledge) for one attempt."""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Optional, cast
from urllib import error as urllib_error
from urllib import request

from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.schemas.student_analytics import (
    AccuracyBuildCategory,
    StudentAccuracyBuildItem,
    StudentAttemptAccuracyImprovementResponse,
    StudentOverallAnalytics,
    StudentStandaloneDetail,
)

logger = logging.getLogger(__name__)

_CAT_ALIASES: Dict[str, AccuracyBuildCategory] = {
    "concept": "concept",
    "concepts": "concept",
    "theory": "concept",
    "trick": "trick",
    "tricks": "trick",
    "exam_trick": "trick",
    "shortcut": "trick",
    "formula": "formula",
    "formulae": "formula",
    "formulas": "formula",
    "equation": "formula",
    "deep_knowledge": "deep_knowledge",
    "deep": "deep_knowledge",
    "deep_theory": "deep_knowledge",
    "rigor": "deep_knowledge",
    "mixed": "mixed",
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


def _normalize_category(raw: str) -> AccuracyBuildCategory:
    key = (raw or "").strip().lower().replace(" ", "_").replace("-", "_")
    if key in _CAT_ALIASES:
        return _CAT_ALIASES[key]
    if "formula" in key:
        return "formula"
    if "trick" in key or "shortcut" in key:
        return "trick"
    if "deep" in key or "proof" in key:
        return "deep_knowledge"
    return "concept"


class _RawBI(BaseModel):
    title: str = ""
    category: str = "concept"
    what_to_build: str = ""
    question_indices: List[int] = Field(default_factory=list)


class _RawAccOut(BaseModel):
    summary: str = ""
    subject_context: str = ""
    exam_context: str = ""
    build_items: List[_RawBI] = Field(default_factory=list)
    practice_drills: List[str] = Field(default_factory=list)


def build_accuracy_improvement_payload(
    detail: StudentStandaloneDetail,
    overall: StudentOverallAnalytics,
    *,
    subject_filter: Optional[str],
    topic_filter: Optional[str],
    exam_tag_filter: Optional[str],
) -> Dict[str, Any]:
    subj = (subject_filter or detail.subject or "").strip()
    top = (topic_filter or detail.topic or "").strip()
    exam = (exam_tag_filter or "").strip().upper()

    qs: List[Dict[str, Any]] = []
    for q in sorted(detail.questions, key=lambda x: x.index):
        caps = [c.key for c in (q.insight_capsules or [])]
        qs.append(
            {
                "index": q.index,
                "difficulty_when_served": q.difficulty_when_served,
                "is_correct": q.is_correct,
                "question_type": q.question_type,
                "peer_accuracy_percent": q.peer_accuracy_percent,
                "insight_capsules": caps,
                "question_excerpt": (q.question_text or "")[:240],
            }
        )

    ins = detail.insights
    wrong_n = sum(1 for q in detail.questions if not q.is_correct)

    return {
        "attempt_id": detail.attempt_id,
        "attempt_title": detail.title,
        "score": detail.score,
        "total_questions": detail.total_questions,
        "percentage": detail.percentage,
        "ended_early": detail.ended_early,
        "wrong_count": wrong_n,
        "coaching_lenses": {
            "subject": subj or None,
            "topic": top or None,
            "exam_tag": exam or None,
            "instruction": (
                "Tailor every recommendation to these lenses when set. "
                "If exam_tag is set, align tricks and time pressure to that exam style. "
                "If subject is set, use standard terminology and syllabus depth for that subject."
            ),
        },
        "questions": qs,
        "attempt_insights": {
            "accuracy_percent": ins.accuracy_percent,
            "missed_opportunity_questions": ins.missed_opportunity_questions,
            "wasted_time_questions": ins.wasted_time_questions,
            "weak_areas": [{"name": a.name, "accuracy_percent": a.accuracy_percent} for a in (ins.weak_areas or [])[:5]],
        },
        "dashboard_strategy": overall.strategy_to_desired_state,
        "desired_state": overall.desired_state.model_dump(),
        "dimensions": [
            {"key": d.key, "label": d.label, "overall_strength": d.overall_strength} for d in overall.dimensions
        ],
    }


def _clamp_indices(raw: List[int], n: int) -> List[int]:
    out: List[int] = []
    for x in raw:
        try:
            i = int(x)
        except (TypeError, ValueError):
            continue
        if 1 <= i <= n and i not in out:
            out.append(i)
    return out[:12]


def _normalize_build_items(rows: List[_RawBI], n: int) -> List[StudentAccuracyBuildItem]:
    out: List[StudentAccuracyBuildItem] = []
    for r in rows[:16]:
        title = (r.title or "Study focus").strip()[:220]
        body = (r.what_to_build or r.title or "").strip()[:2000]
        if not body:
            continue
        cat = _normalize_category(r.category)
        qi = _clamp_indices(r.question_indices, n)
        try:
            out.append(
                StudentAccuracyBuildItem(
                    title=title,
                    category=cast(AccuracyBuildCategory, cat),
                    what_to_build=body,
                    question_indices=qi,
                )
            )
        except Exception:
            continue
    return out


def request_openai_accuracy_improvement(
    detail: StudentStandaloneDetail,
    overall: StudentOverallAnalytics,
    *,
    subject_filter: Optional[str],
    topic_filter: Optional[str],
    exam_tag_filter: Optional[str],
) -> StudentAttemptAccuracyImprovementResponse:
    settings = get_settings()
    key = (settings.openai_api_key or "").strip()
    if not key:
        return StudentAttemptAccuracyImprovementResponse(
            openai_configured=False,
            used_openai=False,
            error="OpenAI is not configured (set OPENAI_API_KEY on the server).",
        )

    n = len(detail.questions)
    if n == 0:
        return StudentAttemptAccuracyImprovementResponse(
            openai_configured=True,
            used_openai=False,
            error="No questions in this attempt.",
        )

    payload = build_accuracy_improvement_payload(
        detail,
        overall,
        subject_filter=subject_filter,
        topic_filter=topic_filter,
        exam_tag_filter=exam_tag_filter,
    )
    subj_echo = str(payload["coaching_lenses"].get("subject") or "").strip()
    exam_echo = str(payload["coaching_lenses"].get("exam_tag") or "").strip()

    schema = (
        "Respond with a single JSON object ONLY, keys:\n"
        '"summary": string (3-6 sentences on how to improve accuracy for THIS attempt, referencing subject/exam when provided),\n'
        '"subject_context": string (one line: how you interpreted the subject / topic for recommendations),\n'
        '"exam_context": string (one line: how you interpreted the exam_tag or general exam prep if absent),\n'
        '"build_items": array of 5-12 objects, each:\n'
        '  { "title": string, "category": one of concept|trick|formula|deep_knowledge|mixed,\n'
        '    "what_to_build": string (specific named concepts, mnemonics, formulae with symbols, or deep theory to master — not generic advice),\n'
        '    "question_indices": array of integers (1-based indices in this attempt that motivate this item; can be empty) },\n'
        '"practice_drills": array of 3-8 short strings (concrete drills, e.g. "10 mixed HARD timed MCQ on X")\n'
    )

    user_content = json.dumps(payload, ensure_ascii=False) + "\n\n" + schema

    body: Dict[str, Any] = {
        "model": settings.openai_model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a senior tutor for high-stakes adaptive tests. "
                    "Given one attempt's item-level outcomes and dashboard strategy, propose what the learner should "
                    "actually build in their head: precise concepts, reusable exam tricks, formulae to memorise (with notation), "
                    "and deep knowledge links. Respect subject and exam_tag when provided — vocabulary and depth must match. "
                    "Avoid vague platitudes; every build_item must be actionable and specific. Output valid JSON only."
                ),
            },
            {"role": "user", "content": user_content},
        ],
        "temperature": 0.4,
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
        logger.warning("AI HTTP error for accuracy improvement: %s", exc)
        return StudentAttemptAccuracyImprovementResponse(
            openai_configured=True,
            used_openai=False,
            subject_context=subj_echo,
            exam_context=exam_echo or "General exam readiness",
            error=f"OpenAI request failed ({getattr(exc, 'code', 'error')}).",
        )
    except Exception as exc:
        logger.warning("OpenAI request failed for accuracy improvement: %s", exc)
        return StudentAttemptAccuracyImprovementResponse(
            openai_configured=True,
            used_openai=False,
            subject_context=subj_echo,
            exam_context=exam_echo or "General exam readiness",
            error="OpenAI request failed or timed out.",
        )

    try:
        data = json.loads(raw_http)
        content = data["choices"][0]["message"]["content"]
        cleaned = _strip_markdown_fence(content)
        parsed = _RawAccOut.model_validate_json(cleaned)
    except Exception as exc:
        logger.warning("OpenAI accuracy improvement parse failed: %s", exc)
        return StudentAttemptAccuracyImprovementResponse(
            openai_configured=True,
            used_openai=False,
            subject_context=subj_echo,
            exam_context=exam_echo or "General exam readiness",
            error="Could not parse the model response.",
        )

    items = _normalize_build_items(parsed.build_items, n)
    drills = [re.sub(r"\s+", " ", str(s)).strip()[:220] for s in (parsed.practice_drills or []) if str(s).strip()]
    drills = drills[:10]

    subj_ctx = (parsed.subject_context or subj_echo or "Not specified").strip()[:500]
    exam_ctx = (parsed.exam_context or exam_echo or "Not specified").strip()[:500]

    return StudentAttemptAccuracyImprovementResponse(
        openai_configured=True,
        used_openai=True,
        error=None,
        summary=(parsed.summary or "").strip()[:4000],
        subject_context=subj_ctx,
        exam_context=exam_ctx,
        build_items=items,
        practice_drills=drills,
    )
