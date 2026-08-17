"""Shared helpers for attempt answers, marks, and attempted vs not-attempted questions."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple


def is_answer_attempted(answer: Dict[str, Any]) -> bool:
    if answer.get("is_attempted") is False:
        return False
    if answer.get("skipped"):
        return False
    raw = answer.get("chosen_answer")
    if raw is None:
        return False
    if isinstance(raw, bool):
        return True
    text = str(raw).strip()
    return bool(text) and text.lower() != "none"


def classify_answers(answers: List[Dict[str, Any]]) -> Tuple[int, int]:
    """Return (correct, wrong) for attempted rows only."""
    correct = 0
    wrong = 0
    for a in answers:
        if not is_answer_attempted(a):
            continue
        if bool(a.get("is_correct")):
            correct += 1
        else:
            wrong += 1
    return correct, wrong


def counts_against_total(answers: List[Dict[str, Any]], total_questions: int) -> Tuple[int, int, int]:
    """Correct / wrong from answers; remaining slots are not attempted."""
    correct, wrong = classify_answers(answers)
    not_attempted = max(0, int(total_questions) - correct - wrong)
    return correct, wrong, not_attempted


def marks_from_answer_entries(
    answers: List[Dict[str, Any]],
    mpc: float,
    mpi: float,
) -> Tuple[float, int, int, int]:
    """Return (marks, correct, wrong, not_attempted) for stored answer rows only."""
    correct = 0
    wrong = 0
    not_attempted = 0
    marks = 0.0
    for a in answers:
        if not is_answer_attempted(a):
            not_attempted += 1
            continue
        if bool(a.get("is_correct")):
            correct += 1
            marks += mpc
        else:
            wrong += 1
            marks -= mpi
    return marks, correct, wrong, not_attempted


def marks_for_section(
    answers: List[Dict[str, Any]],
    section_total_questions: int,
    mpc: float,
    mpi: float,
) -> Tuple[float, int, int, int]:
    """Section marks: unanswered slots in the section count as not attempted (0 marks, no penalty)."""
    marks, correct, wrong, _ = marks_from_answer_entries(answers, mpc, mpi)
    attempted = correct + wrong
    not_attempted = max(0, int(section_total_questions) - attempted)
    return marks, correct, wrong, not_attempted


def section_answer_rows(att: Dict[str, Any], section_total: int) -> List[Dict[str, Any]]:
    """Merge sequential answers with served-but-unanswered question ids for review/analytics."""
    served_ids = [str(x) for x in (att.get("question_ids") or []) if str(x).strip()]
    answers = list(att.get("answers") or [])
    rows: List[Dict[str, Any]] = []
    for i in range(max(0, int(section_total))):
        if i < len(answers):
            rows.append(dict(answers[i]))
        elif i < len(served_ids):
            rows.append(
                {
                    "question_id": served_ids[i],
                    "chosen_answer": "",
                    "is_correct": False,
                    "is_attempted": False,
                }
            )
    return rows


def standalone_result_counts(
    att: Dict[str, Any],
    answers: List[Dict[str, Any]],
) -> Tuple[int, int, int]:
    """Return (correct, wrong, not_attempted) for a standalone adaptive attempt."""
    correct, wrong = classify_answers(answers)
    planned = int(att.get("planned_total_questions") or 0) or int(att.get("total_questions") or 0)
    served = max(len(answers), int(att.get("questions_answered") or 0), len(att.get("question_ids") or []))
    if str(att.get("completion_reason") or "") == "no_more_questions":
        total = max(served, correct + wrong)
    else:
        total = max(planned, served, correct + wrong)
    if total <= 0:
        total = correct + wrong
    return correct, wrong, max(0, total - correct - wrong)


def standalone_test_name(att: Dict[str, Any]) -> str:
    subj = str(att.get("subject_filter") or "").strip()
    top = str(att.get("topic_filter") or "").strip()
    ex = str(att.get("exam_tag_filter") or "").strip()
    parts = [p for p in (subj, top, ex) if p]
    if parts:
        return f"Adaptive test ({' · '.join(parts)})"
    return "Adaptive test"


def standalone_accuracy_stats(answers: List[Dict[str, Any]]) -> Tuple[int, int, float]:
    """Return (correct, attempted, percentage) for standalone adaptive tests.

    Not-attempted answers are excluded from the denominator (no penalty).
    """
    attempted_rows = [a for a in answers if is_answer_attempted(a)]
    correct = sum(1 for a in attempted_rows if a.get("is_correct"))
    attempted = len(attempted_rows)
    pct = (correct / attempted * 100.0) if attempted else 0.0
    return correct, attempted, pct


def max_marks_from_section_results(
    section_results: List[Dict[str, Any]],
    mpc: float,
    *,
    ended_early: bool,
    full_max: float,
) -> float:
    """When a structured test ends early, max marks reflect only attempted questions."""
    if not ended_early:
        return full_max
    attempted = sum(int(r.get("correct", 0)) + int(r.get("wrong", 0)) for r in section_results)
    return float(attempted) * mpc if attempted > 0 else 0.0


def percentage_from_marks(total_marks: float, max_marks: float) -> float:
    if max_marks <= 0:
        return 0.0
    return max(0.0, min(100.0, round(total_marks / max_marks * 100.0, 2)))


def structured_section_totals(section_results: List[Dict[str, Any]]) -> Tuple[int, int, int]:
    """Sum correct, wrong, and not_attempted across paper/challenge section results."""
    correct = sum(int(r.get("correct", 0)) for r in section_results)
    wrong = sum(int(r.get("wrong", 0)) for r in section_results)
    stored_na = sum(int(r.get("not_attempted", 0)) for r in section_results)
    stored_total = sum(int(r.get("total_questions", 0)) for r in section_results)
    if stored_total > 0:
        not_attempted = max(stored_na, stored_total - correct - wrong)
    else:
        not_attempted = stored_na
    return correct, wrong, not_attempted


def structured_counts_from_live_answers(
    *,
    planned_total: int,
    section_answers: List[List[Dict[str, Any]]],
) -> Tuple[int, int, int]:
    """Recompute paper/challenge C/W/NA from live section answers vs planned question count."""
    correct = 0
    wrong = 0
    for answers in section_answers:
        c, w = classify_answers(answers)
        correct += c
        wrong += w
    total = max(int(planned_total), correct + wrong)
    return correct, wrong, max(0, total - correct - wrong)


def structured_attempt_stats(
    section_results: List[Dict[str, Any]],
    *,
    mpc: float,
    full_max: float,
    ended_early: bool,
    total_marks: Optional[float] = None,
) -> Tuple[int, int, int, float]:
    """Marks-based stats for a paper or challenge attempt."""
    correct, wrong, not_attempted = structured_section_totals(section_results)
    marks = (
        float(total_marks)
        if total_marks is not None
        else sum(float(r.get("marks", 0)) for r in section_results)
    )
    max_m = max_marks_from_section_results(section_results, mpc, ended_early=ended_early, full_max=full_max)
    if max_m <= 0 and (correct + wrong) > 0:
        max_m = float(correct + wrong) * mpc
    pct = percentage_from_marks(marks, max_m)
    return correct, wrong, not_attempted, pct
