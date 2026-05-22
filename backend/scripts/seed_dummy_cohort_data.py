"""Static personas and challenge templates for seed_dummy_cohort.py."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, TypedDict


class Persona(TypedDict):
    username: str
    display_name: str
    profile_slug: str
    college: str
    bio: str


class SectionSpec(TypedDict, total=False):
    title: str
    order: int
    total_questions: int
    time_limit_seconds: int
    exam_tag: str
    subjects: List[str]
    subject_patterns: List[str]
    topic_patterns: List[str]
    exam_tags: List[str]
    difficulties: List[str]


def validate_personas(personas: List[Persona]) -> None:
    """Fail fast if any display name, username, or slug repeats."""
    if not personas:
        raise ValueError("personas list is empty")
    seen_names: set[str] = set()
    seen_users: set[str] = set()
    seen_slugs: set[str] = set()
    for p in personas:
        name_key = p["display_name"].strip().lower()
        user_key = p["username"].strip().lower()
        slug_key = p["profile_slug"].strip().lower()
        if name_key in seen_names:
            raise ValueError(f"Duplicate display_name: {p['display_name']}")
        if user_key in seen_users:
            raise ValueError(f"Duplicate username: {p['username']}")
        if slug_key in seen_slugs:
            raise ValueError(f"Duplicate profile_slug: {p['profile_slug']}")
        seen_names.add(name_key)
        seen_users.add(user_key)
        seen_slugs.add(slug_key)


# Subject aliases in the question bank (see sample_questions_upload.csv / admin uploads).
QUANT_SUBJECTS = ["Quantitative Aptitude", "Mathematics", "Quant", "Quantitative Ability"]
VERBAL_SUBJECTS = ["Verbal Ability", "English", "Verbal", "Reading Comprehension"]
LRDI_SUBJECTS = ["Logical Reasoning", "Data Interpretation", "Logical Reasoning and Data Interpretation"]

LEVEL_DIFFICULTIES: Dict[str, List[str]] = {
    "BEGINNER": ["EASY", "MEDIUM"],
    "INTERMEDIATE": ["EASY", "MEDIUM", "HARD"],
    "ADVANCED": ["MEDIUM", "HARD", "EXPERT"],
    "EXPERT": ["HARD", "EXPERT"],
}


def _quant_section(order: int = 0, *, total: int = 10, exam_tag: str = "CAT", difficulties: List[str] | None = None) -> SectionSpec:
    return {
        "title": "Quantitative Ability",
        "order": order,
        "total_questions": total,
        "time_limit_seconds": 600,
        "exam_tag": exam_tag,
        "subjects": QUANT_SUBJECTS,
        "subject_patterns": [r"quant", r"math"],
        "topic_patterns": [
            r"algebra",
            r"arithmetic",
            r"number",
            r"geometry",
            r"percent",
            r"profit",
            r"time",
            r"speed",
            r"probability",
            r"calculus",
            r"equation",
        ],
        "exam_tags": [exam_tag] if exam_tag else [],
        "difficulties": difficulties or [],
    }


def _varc_section(order: int = 0, *, total: int = 10, exam_tag: str = "CAT", difficulties: List[str] | None = None) -> SectionSpec:
    return {
        "title": "Verbal Ability & RC",
        "order": order,
        "total_questions": total,
        "time_limit_seconds": 600,
        "exam_tag": exam_tag,
        "subjects": VERBAL_SUBJECTS,
        "subject_patterns": [r"verbal", r"english", r"rc", r"reading"],
        "topic_patterns": [r"vocab", r"reading", r"comprehension", r"grammar", r"para"],
        "exam_tags": [exam_tag] if exam_tag else [],
        "difficulties": difficulties or [],
    }


def _lrdi_section(order: int = 0, *, total: int = 10, exam_tag: str = "CAT", difficulties: List[str] | None = None) -> SectionSpec:
    return {
        "title": "Logical Reasoning & DI",
        "order": order,
        "total_questions": total,
        "time_limit_seconds": 720,
        "exam_tag": exam_tag,
        "subjects": LRDI_SUBJECTS,
        "subject_patterns": [r"logic", r"reasoning", r"data interpretation", r"lrdi"],
        "topic_patterns": [r"logic", r"reasoning", r"di\b", r"data", r"arrangement", r"puzzle", r"set"],
        "exam_tags": [exam_tag] if exam_tag else [],
        "difficulties": difficulties or [],
    }


CHALLENGE_TEMPLATES: List[Dict[str, Any]] = [
    {
        "title": "CAT Sprint — Spring 2026",
        "description": "Adaptive CAT-style sprint: quant then verbal, drawn from matching question pools.",
        "level": "INTERMEDIATE",
        "sections": [_quant_section(0, total=10), _varc_section(1, total=10)],
    },
    {
        "title": "IIM Dream Quant Dash",
        "description": "Adaptive quant-only drill — QA questions from the quant pool only.",
        "level": "ADVANCED",
        "sections": [_quant_section(0, total=12)],
    },
    {
        "title": "LRDI Speed Challenge",
        "description": "Adaptive LR + DI sets — logical reasoning and data interpretation questions only.",
        "level": "INTERMEDIATE",
        "sections": [_lrdi_section(0, total=12)],
    },
    {
        "title": "VARC Precision Series",
        "description": "Adaptive verbal section — vocabulary, grammar, and RC from the verbal pool.",
        "level": "INTERMEDIATE",
        "sections": [_varc_section(0, total=12)],
    },
    {
        "title": "Weekend Warriors Full Mock",
        "description": "Two adaptive sectionals: full quant block then full verbal block.",
        "level": "EXPERT",
        "sections": [_quant_section(0, total=10), _varc_section(1, total=10)],
    },
    {
        "title": "Beginner CAT Warm-up",
        "description": "Shorter adaptive warm-up from easier CAT-tagged quant & verbal questions.",
        "level": "BEGINNER",
        "sections": [
            {
                "title": "Mixed Warm-up",
                "order": 0,
                "total_questions": 8,
                "time_limit_seconds": 480,
                "exam_tag": "CAT",
                "subjects": QUANT_SUBJECTS + VERBAL_SUBJECTS,
                "subject_patterns": [r"quant", r"verbal", r"english", r"math"],
                "topic_patterns": [],
                "exam_tags": ["CAT"],
                "difficulties": ["EASY", "MEDIUM"],
            }
        ],
    },
    {
        "title": "Banking + MBA Crossover",
        "description": "Adaptive set from BANK / SSC-tagged questions (quant + reasoning mix).",
        "level": "INTERMEDIATE",
        "sections": [
            {
                "title": "Banking Aptitude",
                "order": 0,
                "total_questions": 10,
                "time_limit_seconds": 600,
                "exam_tag": "BANK",
                "subjects": QUANT_SUBJECTS + LRDI_SUBJECTS,
                "subject_patterns": [r"quant", r"math", r"logic", r"reasoning"],
                "topic_patterns": [r"percent", r"interest", r"di\b", r"puzzle"],
                "exam_tags": ["BANK", "SSC"],
                "difficulties": ["EASY", "MEDIUM", "HARD"],
            }
        ],
    },
    {
        "title": "99 Percentile Club Mock",
        "description": "Hard adaptive quant + hard verbal — elite CAT-tagged pools.",
        "level": "EXPERT",
        "sections": [
            _quant_section(0, total=10, difficulties=["HARD", "EXPERT"]),
            _varc_section(1, total=10, difficulties=["HARD", "EXPERT"]),
        ],
    },
]
