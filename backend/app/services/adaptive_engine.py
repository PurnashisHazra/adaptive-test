"""Server-controlled adaptive difficulty and question selection."""

import random
from typing import List, Optional, Sequence

from app.models.domain import DIFFICULTY_ORDER, Difficulty
from app.repositories.question_repository import QuestionRepository


def get_next_difficulty(current: Difficulty, is_correct: bool) -> Difficulty:
    """Compute the next difficulty bucket after an answer."""
    if is_correct:
        if current == Difficulty.EASY:
            return Difficulty.MEDIUM
        if current == Difficulty.MEDIUM:
            return Difficulty.HARD
        if current == Difficulty.HARD:
            return Difficulty.EXPERT
        return Difficulty.EXPERT
    if current == Difficulty.EXPERT:
        return Difficulty.HARD
    if current == Difficulty.HARD:
        return Difficulty.MEDIUM
    if current == Difficulty.MEDIUM:
        return Difficulty.EASY
    return Difficulty.EASY


def ordered_fallback_difficulties(target: Difficulty) -> List[Difficulty]:
    """Try target first, then nearest difficulties."""
    idx = DIFFICULTY_ORDER.index(target)
    ranked: List[tuple[int, int, Difficulty]] = []
    for i, d in enumerate(DIFFICULTY_ORDER):
        dist = abs(i - idx)
        ranked.append((dist, i, d))
    ranked.sort(key=lambda x: (x[0], x[1]))
    return [d for _, _, d in ranked]


async def get_next_question_id(
    repo: QuestionRepository,
    target_difficulty: Difficulty,
    used_ids: Sequence[str],
    subject: Optional[str] = None,
    topic: Optional[str] = None,
    exam_tag: Optional[str] = None,
) -> Optional[str]:
    """
    Pick a random unused question at target difficulty, or nearest available difficulty.
    """
    for diff in ordered_fallback_difficulties(target_difficulty):
        qid = await repo.pick_random_id(diff, used_ids, subject, topic, exam_tag)
        if qid:
            return qid
    return None


def shuffle_options_if_needed(options: List[dict], question_type: str) -> List[dict]:
    """Optionally shuffle MCQ options for presentation (deterministic per question id done elsewhere)."""
    if question_type != "mcq_single":
        return list(options)
    opts = list(options)
    random.shuffle(opts)
    return opts
