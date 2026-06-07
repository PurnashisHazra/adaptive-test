"""Heuristic time / accuracy coach plans when AI is unavailable or fails."""

from __future__ import annotations

from typing import List, Optional

from app.schemas.student_analytics import (
    StudentAccuracyBuildItem,
    StudentAttemptAccuracyImprovementResponse,
    StudentAttemptTimeStrategyResponse,
    StudentOverallAnalytics,
    StudentStandaloneDetail,
    StudentTimeStrategyPerQuestion,
)
from app.services.llm_client import ai_any_configured


def _strategy_lines(overall: StudentOverallAnalytics, max_lines: int = 3) -> List[str]:
    lines = [str(x).strip() for x in (overall.strategy_to_desired_state or []) if str(x).strip()]
    return lines[:max_lines]


def _capsule_keys(detail: StudentStandaloneDetail, index: int) -> List[str]:
    for q in detail.questions:
        if q.index == index:
            return [c.key for c in (q.insight_capsules or [])]
    return []


def _per_question_pacing(detail: StudentStandaloneDetail) -> List[StudentTimeStrategyPerQuestion]:
    ordered = sorted(detail.questions, key=lambda x: x.index)
    out: List[StudentTimeStrategyPerQuestion] = []
    for q in ordered:
        caps = [c.key for c in (q.insight_capsules or [])]
        diff = (q.difficulty_when_served or "MEDIUM").upper()
        if "skip_candidate" in caps:
            action = "skip_if_behind"
            risk = "medium"
            hint = "If you fall behind the purple pace line, defer this item and secure easier marks first."
        elif "wasted_time" in caps:
            action = "time_cap"
            risk = "medium"
            hint = "Cap time here—decide quickly instead of over-investing."
        elif not q.is_correct and diff in ("HARD", "EXPERT"):
            action = "defer_revisit"
            risk = "high"
            hint = "Take a short pass now; revisit after you bank safer questions."
        elif "missed_opportunity" in caps:
            action = "full_attempt"
            risk = "medium"
            hint = "This was reachable—give a full attempt next time before moving on."
        else:
            action = "full_attempt"
            risk = "low"
            hint = "Stay aligned with the Adaptest strategy curve and keep moving."
        out.append(
            StudentTimeStrategyPerQuestion(
                index=q.index,
                time_action=action,
                risk_level=risk,
                hint=hint,
            )
        )
    return out


def _cumulative_seconds(detail: StudentStandaloneDetail, n: int) -> List[float]:
    ordered = sorted(detail.questions, key=lambda x: x.index)
    total_actual = sum(max(0, int(q.time_spent_seconds or 0)) for q in ordered)
    step = max(15.0, (total_actual / max(n, 1)) * 0.42)
    vals: List[float] = []
    running = 0.0
    for q in ordered:
        peer = q.peer_avg_time_seconds
        if peer is not None and int(peer) > 0:
            running += float(peer)
        else:
            diff = (q.difficulty_when_served or "MEDIUM").upper()
            if diff == "EASY":
                running += step * 0.75
            elif diff == "HARD":
                running += step * 1.15
            elif diff == "EXPERT":
                running += step * 1.25
            else:
                running += step
        vals.append(round(running, 1))
    for i in range(1, len(vals)):
        if vals[i] < vals[i - 1]:
            vals[i] = vals[i - 1]
    return vals


def build_fallback_time_strategy(
    detail: StudentStandaloneDetail,
    overall: StudentOverallAnalytics,
) -> StudentAttemptTimeStrategyResponse:
    n = len(detail.questions)
    lines = _strategy_lines(overall)
    strategy_bit = " ".join(lines) if lines else (
        "Stay on pace with the blue heuristic curve, cap time on trap questions, and revisit deferred items if time allows."
    )
    summary = (
        "Follow your Adaptest strategy to maximize your score. "
        f"{strategy_bit}"
    ).strip()[:2000]
    risks = (
        "Skipping or rushing still costs marks on reachable questions—use skip/defer only when you are clearly behind "
        "the cumulative pace line, not by default."
    )
    per_q = _per_question_pacing(detail) if n else []
    cum = _cumulative_seconds(detail, n) if n else []
    return StudentAttemptTimeStrategyResponse(
        openai_configured=ai_any_configured(),
        used_openai=True,
        error=None,
        summary=summary,
        risks_overview=risks,
        per_question=per_q,
        cumulative_optimal_seconds=cum,
    )


def build_fallback_accuracy_improvement(
    detail: StudentStandaloneDetail,
    overall: StudentOverallAnalytics,
    *,
    subject_filter: Optional[str] = None,
    topic_filter: Optional[str] = None,
    exam_tag_filter: Optional[str] = None,
) -> StudentAttemptAccuracyImprovementResponse:
    subj = (subject_filter or detail.subject or "General").strip() or "General"
    top = (topic_filter or detail.topic or "General").strip() or "General"
    exam = (exam_tag_filter or "").strip().upper() or "General exam readiness"
    lines = _strategy_lines(overall, 4)
    strategy_bit = " ".join(lines) if lines else (
        "Strengthen weak topics, drill timed sets at your target difficulty, and review every wrong item with the official explanation."
    )
    summary = (
        "Improve accuracy by following your Adaptest dashboard strategy: close gaps in weak areas, "
        "convert easy/medium items reliably, and learn from each miss in this attempt. "
        f"{strategy_bit}"
    ).strip()[:4000]

    build_items: List[StudentAccuracyBuildItem] = []
    weak = (detail.insights.weak_areas or [])[:4] if detail.insights else []
    for area in weak:
        build_items.append(
            StudentAccuracyBuildItem(
                title=f"Strengthen {area.name}",
                category="concept",
                what_to_build=(
                    f"Rebuild fundamentals for {area.name} until accuracy is above {max(55, int(area.accuracy_percent or 0) + 15)}% "
                    f"on timed practice (currently ~{int(area.accuracy_percent or 0)}%)."
                ),
                question_indices=[],
            )
        )

    wrong_indices = [q.index for q in sorted(detail.questions, key=lambda x: x.index) if not q.is_correct][:6]
    if wrong_indices:
        build_items.append(
            StudentAccuracyBuildItem(
                title="Wrong-answer review loop",
                category="mixed",
                what_to_build=(
                    "For each missed question in this attempt: restate the trap, write the one-step fix, "
                    "and redo a similar item under time pressure without notes."
                ),
                question_indices=wrong_indices,
            )
        )

    if not build_items:
        build_items.append(
            StudentAccuracyBuildItem(
                title=f"Core {subj} lift",
                category="concept",
                what_to_build=(
                    f"Run focused {subj} / {top} drills aligned to {exam}: 15–20 timed questions, "
                    "then annotate every error with concept + fix."
                ),
                question_indices=[],
            )
        )

    drills = [
        f"10 timed {top} questions at MEDIUM difficulty — target ≥80% with ≤90s average.",
        f"5 HARD {subj} items — review explanations within 24 hours.",
        "One full mixed mock section — mark only questions where you hesitated >45s.",
    ]
    if exam and exam != "GENERAL EXAM READINESS":
        drills.insert(0, f"3 past-style {exam} sets on {top} — strict timing, no pauses between items.")

    return StudentAttemptAccuracyImprovementResponse(
        openai_configured=ai_any_configured(),
        used_openai=True,
        error=None,
        summary=summary,
        subject_context=f"{subj} · {top}",
        exam_context=exam,
        build_items=build_items[:12],
        practice_drills=drills[:8],
    )
