"""Normalize exam category tags stored on questions (tags[])."""

from typing import List, Optional, Sequence

MAX_EXAM_TAG_LEN = 64

# Folder for questions with no exam category. Distinct from a tagged "OTHER" value.
OTHERS_EXAM_TAG = "OTHERS"
OTHERS_DISPLAY_NAME = "Others"
_UNCATEGORIZED_TAGS = frozenset({"", "OTHER", "OTHERS"})


def normalize_exam_tag(raw: str) -> str:
    t = " ".join(str(raw or "").strip().split()).upper()
    if not t:
        return OTHERS_EXAM_TAG
    return t[:MAX_EXAM_TAG_LEN]


def normalize_exam_tags(tags: List[str]) -> List[str]:
    """Keep only real exam categories. Empty input stays empty (Others folder)."""
    out: List[str] = []
    for raw in tags:
        if not str(raw or "").strip():
            continue
        t = normalize_exam_tag(raw)
        if t in _UNCATEGORIZED_TAGS:
            continue
        if t not in out:
            out.append(t)
    return out


def exam_folder_for_tags(tags: Optional[Sequence[str]]) -> str:
    """Primary exam folder: first real category, else Others."""
    folders = exam_folders_for_tags(tags)
    return folders[0]


def exam_folders_for_tags(tags: Optional[Sequence[str]]) -> List[str]:
    """Every exam folder this question belongs in (unique). Untagged → Others only."""
    out: List[str] = []
    for raw in tags or []:
        if not str(raw or "").strip():
            continue
        t = normalize_exam_tag(raw)
        if t in _UNCATEGORIZED_TAGS:
            continue
        if t not in out:
            out.append(t)
    return out or [OTHERS_EXAM_TAG]


def append_exam_tag(tags: Optional[Sequence[str]], dest_exam: str) -> List[str]:
    """Add destination exam tag; keep existing tags. Subject/topic are unchanged elsewhere."""
    dest = normalize_exam_tag(dest_exam)
    out = normalize_exam_tags(list(tags or []))
    if dest not in _UNCATEGORIZED_TAGS and dest not in out:
        out.append(dest)
    return out


def remove_exam_tag(tags: Optional[Sequence[str]], source_exam: str) -> List[str]:
    src = normalize_exam_tag(source_exam)
    out: List[str] = []
    for t in normalize_exam_tags(list(tags or [])):
        if t != src and t not in out:
            out.append(t)
    return out


def is_others_exam(exam_tag: str) -> bool:
    return normalize_exam_tag(exam_tag) in _UNCATEGORIZED_TAGS or normalize_exam_tag(exam_tag) == OTHERS_EXAM_TAG


def normalize_subject_name(raw: str) -> str:
    return " ".join(str(raw or "").strip().split())[:400] or "General"
