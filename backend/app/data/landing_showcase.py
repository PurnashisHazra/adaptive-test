"""Landing page showcase papers — titles, slots, and section templates per exam category."""

from __future__ import annotations

from typing import Any, Dict, List, TypedDict

LandingCategoryId = str


class ShowcaseSectionSpec(TypedDict, total=False):
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


class ShowcasePaperSpec(TypedDict):
    title: str
    slot: int
    sections: List[ShowcaseSectionSpec]


QUANT_SUBJECTS = ["Quantitative Aptitude", "Mathematics", "Quant", "Quantitative Ability"]
VERBAL_SUBJECTS = ["Verbal Ability", "English", "Verbal", "Reading Comprehension"]
LRDI_SUBJECTS = ["Logical Reasoning", "Data Interpretation", "Logical Reasoning and Data Interpretation"]
REASONING_SUBJECTS = LRDI_SUBJECTS + ["General Intelligence", "Reasoning"]

DEFAULT_DIFFICULTIES = ["EASY", "MEDIUM", "HARD"]


def _quant(order: int, *, exam_tag: str, total: int = 10) -> ShowcaseSectionSpec:
    return {
        "title": "Quantitative Ability",
        "order": order,
        "total_questions": total,
        "time_limit_seconds": 600,
        "exam_tag": exam_tag,
        "subjects": QUANT_SUBJECTS,
        "subject_patterns": [r"quant", r"math"],
        "exam_tags": [exam_tag],
        "difficulties": DEFAULT_DIFFICULTIES,
    }


def _verbal(order: int, *, exam_tag: str, total: int = 10) -> ShowcaseSectionSpec:
    return {
        "title": "Verbal Ability & RC",
        "order": order,
        "total_questions": total,
        "time_limit_seconds": 600,
        "exam_tag": exam_tag,
        "subjects": VERBAL_SUBJECTS,
        "subject_patterns": [r"verbal", r"english", r"reading"],
        "exam_tags": [exam_tag],
        "difficulties": DEFAULT_DIFFICULTIES,
    }


def _reasoning(order: int, *, exam_tag: str, total: int = 10) -> ShowcaseSectionSpec:
    return {
        "title": "Reasoning",
        "order": order,
        "total_questions": total,
        "time_limit_seconds": 600,
        "exam_tag": exam_tag,
        "subjects": REASONING_SUBJECTS,
        "subject_patterns": [r"logic", r"reasoning", r"puzzle"],
        "exam_tags": [exam_tag],
        "difficulties": DEFAULT_DIFFICULTIES,
    }


LANDING_SHOWCASE_SPECS: Dict[LandingCategoryId, List[ShowcasePaperSpec]] = {
    "mba": [
        {
            "title": "CAT Full Mock Test 1",
            "slot": 1,
            "sections": [_quant(0, exam_tag="CAT"), _verbal(1, exam_tag="CAT")],
        },
        {
            "title": "CAT Full Mock Test 2",
            "slot": 2,
            "sections": [_quant(0, exam_tag="CAT"), _reasoning(1, exam_tag="CAT"), _verbal(2, exam_tag="CAT")],
        },
    ],
    "law": [
        {
            "title": "CLAT Mock Test 1",
            "slot": 1,
            "sections": [
                _verbal(0, exam_tag="OTHER", total=8),
                _reasoning(1, exam_tag="OTHER", total=8),
            ],
        },
        {
            "title": "CLAT Mock Test 2",
            "slot": 2,
            "sections": [
                _reasoning(0, exam_tag="OTHER", total=10),
                _verbal(1, exam_tag="OTHER", total=10),
            ],
        },
    ],
    "banking": [
        {
            "title": "IBPS PO Mock Test 1",
            "slot": 1,
            "sections": [_quant(0, exam_tag="BANK"), _reasoning(1, exam_tag="BANK")],
        },
        {
            "title": "IBPS PO Mock Test 2",
            "slot": 2,
            "sections": [_quant(0, exam_tag="BANK"), _verbal(1, exam_tag="BANK"), _reasoning(2, exam_tag="BANK")],
        },
    ],
    "railways": [
        {
            "title": "RRB NTPC Mock Test 1",
            "slot": 1,
            "sections": [_quant(0, exam_tag="RAILWAY"), _reasoning(1, exam_tag="RAILWAY")],
        },
        {
            "title": "RRB NTPC Mock Test 2",
            "slot": 2,
            "sections": [_quant(0, exam_tag="RAILWAY"), _verbal(1, exam_tag="RAILWAY")],
        },
    ],
    "defense": [
        {
            "title": "SSC CGL Mock Test 1",
            "slot": 1,
            "sections": [_quant(0, exam_tag="SSC"), _reasoning(1, exam_tag="SSC")],
        },
        {
            "title": "SSC CGL Mock Test 2",
            "slot": 2,
            "sections": [_quant(0, exam_tag="SSC"), _verbal(1, exam_tag="SSC"), _reasoning(2, exam_tag="DEFENCE")],
        },
    ],
}

VALID_LANDING_CATEGORIES = frozenset(LANDING_SHOWCASE_SPECS.keys())

# Backward-compatible title list
LANDING_SHOWCASE_TITLES: Dict[LandingCategoryId, List[str]] = {
    cat: [p["title"] for p in specs] for cat, specs in LANDING_SHOWCASE_SPECS.items()
}
