"""Cohort percentile: share of peers with strictly lower scores (standard 0–100 scale)."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence, Tuple


def percentile_vs_scores(my_score: float, cohort_scores: Sequence[float]) -> Tuple[Optional[float], int]:
    """
    Percentile among cohort by total marks (or comparable score).

    Uses (count strictly below) / (n - 1) * 100 when n > 1; single participant → 100.
    """
    scores = [float(s) for s in cohort_scores]
    n = len(scores)
    if n == 0:
        return None, 0
    if n == 1:
        return 100.0, 1
    below = sum(1 for s in scores if s < float(my_score) - 1e-9)
    return round(100.0 * below / (n - 1), 1), n


def percentile_among_ranked_attempts(
    username: str,
    ranked: Sequence[Dict[str, Any]],
    *,
    score_key: str = "total_marks",
) -> Tuple[Optional[float], int]:
    """Percentile for a student present in ranked challenge/paper attempts."""
    if not ranked:
        return None, 0
    scores = [(str(r.get("student_username", "")), float(r.get(score_key, 0))) for r in ranked]
    user_score = next((s for u, s in scores if u == username.strip()), None)
    if user_score is None:
        return None, len(scores)
    return percentile_vs_scores(user_score, [s for _, s in scores])
