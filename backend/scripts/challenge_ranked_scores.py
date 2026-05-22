"""Shared helpers to write synthetic ranked scores on challenge_attempts (for percentiles)."""

from __future__ import annotations

import random
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from app.repositories.challenge_repository import ChallengeRepository
from app.services.challenge_service import _max_marks, _sorted_sections


def attempt_is_ranked(doc: Optional[Dict[str, Any]]) -> bool:
    if not doc:
        return False
    return doc.get("status") in ("completed", "ended_early") and doc.get("total_marks") is not None


def synthetic_section_results(
    challenge: Dict[str, Any],
    total_marks: float,
    rng: random.Random,
) -> List[Dict[str, Any]]:
    secs = _sorted_sections(challenge)
    mpc = float(challenge.get("marks_per_correct", 1))
    if not secs:
        return []
    weights = [rng.uniform(0.35, 0.65) for _ in secs]
    wsum = sum(weights) or 1.0
    out: List[Dict[str, Any]] = []
    allocated = 0.0
    for i, sec in enumerate(secs):
        tq = int(sec["total_questions"])
        if i == len(secs) - 1:
            marks = round(max(0.0, total_marks - allocated), 4)
        else:
            marks = round(total_marks * (weights[i] / wsum), 4)
            allocated += marks
        correct = min(tq, int(round(marks / mpc))) if mpc > 0 else 0
        wrong = max(0, tq - correct)
        out.append(
            {
                "section_index": int(sec.get("order", i)),
                "section_title": str(sec["title"]),
                "attempt_id": f"synth_{uuid.uuid4().hex[:12]}",
                "marks": marks,
                "correct": correct,
                "wrong": wrong,
                "total_questions": tq,
            }
        )
    return out


async def write_ranked_challenge_attempt(
    challenges: ChallengeRepository,
    *,
    challenge_id: str,
    challenge: Dict[str, Any],
    student_username: str,
    rng: random.Random,
    now: datetime,
    existing_attempt: Optional[Dict[str, Any]] = None,
    extra_fields: Optional[Dict[str, Any]] = None,
) -> float:
    """Upsert a completed challenge_attempt with total_marks. Returns total_marks written."""
    max_m = _max_marks(challenge, float(challenge.get("marks_per_correct", 1)))
    if max_m <= 0:
        return 0.0
    score_pct = rng.uniform(0.42, 0.96)
    total_marks = round(max_m * score_pct, 4)
    if total_marks <= 0:
        total_marks = round(max_m * 0.5, 4)

    if existing_attempt and existing_attempt.get("started_at"):
        started = existing_attempt["started_at"]
    else:
        started = now - timedelta(days=rng.randint(1, 2), hours=rng.randint(0, 12))
    completed = started + timedelta(minutes=rng.randint(35, 110)) if isinstance(started, datetime) else now

    section_results = synthetic_section_results(challenge, total_marks, rng)
    secs = _sorted_sections(challenge)
    payload: Dict[str, Any] = {
        "status": "completed",
        "total_marks": float(total_marks),
        "section_results": section_results,
        "completed_at": completed,
        "current_section_index": max(0, len(secs) - 1),
        "active_attempt_id": "",
    }
    if extra_fields:
        payload.update(extra_fields)

    if existing_attempt:
        await challenges.update_challenge_attempt(str(existing_attempt["_id"]), payload)
    else:
        await challenges.insert_challenge_attempt(
            {
                "challenge_id": challenge_id,
                "student_username": student_username,
                "started_at": started,
                "section_attempt_ids": [],
                **payload,
            }
        )
    return float(total_marks)
