"""Heuristic strategy-adherence scoring (mirrors frontend strategyCounterfactual.ts)."""

from typing import Any, Dict, List, Optional, Tuple

from app.schemas.student_analytics import StudentOverallAnalytics, StudentQuestionReview

StrategyFollowStatus = str  # on_track | partial | needs_focus | insufficient_data


def _clamp(n: float, lo: float, hi: float) -> float:
    return min(hi, max(lo, n))


def _dim_strength(overall: StudentOverallAnalytics, key: str) -> float:
    for d in overall.dimensions:
        if d.key == key:
            return float(d.overall_strength)
    return 55.0


def strategy_blend_gap(overall: Optional[StudentOverallAnalytics]) -> float:
    if overall is None or overall.desired_state is None:
        return 0.12
    ds = overall.desired_state
    gaps = [
        max(0.0, ds.knowledge_strength - _dim_strength(overall, "knowledge")),
        max(0.0, ds.difficulty_strength - _dim_strength(overall, "difficulty")),
        max(0.0, ds.time_strength - _dim_strength(overall, "time")),
    ]
    return _clamp(sum(gaps) / 300.0, 0.0, 0.45)


def time_strength_gap(overall: Optional[StudentOverallAnalytics]) -> float:
    if overall is None or overall.desired_state is None:
        return 0.1
    g = max(0.0, overall.desired_state.time_strength - _dim_strength(overall, "time"))
    return _clamp(g / 100.0, 0.0, 0.4)


def _strategy_adjusted_seconds(q: StudentQuestionReview, blend_gap: float, time_gap: float) -> float:
    t = float(q.time_spent_seconds or 0)
    if t <= 0:
        return 0.0
    factor = 1.0
    peer_t = q.peer_avg_time_seconds
    if peer_t is not None and peer_t > 0 and t > peer_t * 1.35:
        over = _clamp((t - peer_t * 1.35) / max(peer_t, 1.0), 0.0, 4.0)
        factor -= (0.1 * time_gap + 0.06 * blend_gap) * over
    for c in q.insight_capsules or []:
        if c.key == "wasted_time":
            factor -= 0.16 + 0.14 * time_gap
        if c.key == "skip_revisit":
            factor -= 0.05 + 0.04 * time_gap
    return t * _clamp(factor, 0.42, 1.0)


def _recovery_for_wrong(q: StudentQuestionReview, blend_gap: float) -> float:
    peer = _clamp((q.peer_accuracy_percent or 62.0) / 100.0, 0.32, 0.98)
    capsule = 0.0
    for c in q.insight_capsules or []:
        if c.key == "missed_opportunity":
            capsule += 0.07
        if c.key == "wasted_time":
            capsule += 0.05
        if c.key == "skip_revisit":
            capsule += 0.04
    base = 0.04 + blend_gap * 0.52
    peer_lift = blend_gap * peer * 0.38
    return _clamp(base + peer_lift + capsule, 0.0, 0.92)


def _has_capsule(q: StudentQuestionReview, key: str) -> bool:
    return any(c.key == key for c in (q.insight_capsules or []))


def compute_running_accuracy_series(
    questions: List[StudentQuestionReview],
    overall: Optional[StudentOverallAnalytics],
) -> Dict[str, Any]:
    ordered = sorted(questions, key=lambda q: q.index)
    n = len(ordered)
    if n == 0:
        return {"n": 0, "actual": [], "strategy": [], "wasted_time_flags": 0, "missed_flags": 0}

    blend_gap = strategy_blend_gap(overall)
    time_gap = time_strength_gap(overall)
    actual: List[float] = []
    strategy: List[float] = []
    correct = 0
    strat_sum = 0.0

    for i, q in enumerate(ordered):
        k = i + 1
        if q.is_correct:
            correct += 1
            strat_sum += 1.0
        else:
            strat_sum += _recovery_for_wrong(q, blend_gap)
        actual.append((correct / k) * 100.0)
        strategy.append(min(100.0, (strat_sum / k) * 100.0))

    wasted = sum(1 for q in ordered if _has_capsule(q, "wasted_time"))
    missed = sum(1 for q in ordered if _has_capsule(q, "missed_opportunity"))

    return {
        "n": n,
        "actual": actual,
        "strategy": strategy,
        "wasted_time_flags": wasted,
        "missed_flags": missed,
        "blend_gap": blend_gap,
    }


def score_strategy_follow(
    questions: List[StudentQuestionReview],
    overall: Optional[StudentOverallAnalytics],
) -> Tuple[StrategyFollowStatus, Optional[float], str, Optional[float], Optional[float], Optional[float]]:
    """
    Returns status, percent (0–100), note, actual_acc%, strategy_acc%, lift points.
  Higher percent = closer to the illustrative strategy-following path.
    """
    series = compute_running_accuracy_series(questions, overall)
    n = int(series["n"])
    if n == 0:
        return "insufficient_data", None, "No completed attempts with answers yet.", None, None, None

    actual_acc = float(series["actual"][-1])
    strategy_acc = float(series["strategy"][-1])
    lift = max(0.0, strategy_acc - actual_acc)
    wasted = int(series["wasted_time_flags"])
    missed = int(series["missed_flags"])

    wasted_ratio = wasted / n
    missed_ratio = missed / n
    penalty = min(38.0, lift * 1.35) + min(28.0, wasted_ratio * 100.0 * 0.45) + min(18.0, missed_ratio * 100.0 * 0.25)
    percent = _clamp(100.0 - penalty, 0.0, 100.0)

    if percent >= 72.0:
        status: StrategyFollowStatus = "on_track"
        note = "Recent attempt patterns align well with the recommended pacing and accuracy habits."
    elif percent >= 50.0:
        status = "partial"
        note = "Some strategy habits are in place; time on hard items or recoverable misses still leave room to improve."
    else:
        status = "needs_focus"
        note = "Large gap vs the illustrative strategy path — review time caps, skip/revisit rules, and error review."

    if lift >= 10.0:
        note += f" Illustrative accuracy lift on the latest attempt: +{lift:.1f} pts."
    if wasted > 0:
        note += f" {wasted} question(s) flagged for wasted time."

    return status, round(percent, 1), note, round(actual_acc, 1), round(strategy_acc, 1), round(lift, 1)
