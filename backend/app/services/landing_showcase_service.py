"""Ensure and list landing-page showcase question papers."""

from __future__ import annotations

import logging
import uuid
from typing import Any, Dict, List, Optional, Tuple

from app.data.landing_showcase import LANDING_SHOWCASE_SPECS, VALID_LANDING_CATEGORIES
from app.repositories.paper_repository import PaperRepository
from app.repositories.question_repository import QuestionRepository
from app.schemas.paper_unlock import ExamShowcasePaperOut
from app.utils.ids import oid_str

logger = logging.getLogger(__name__)

SHOWCASE_CREATED_BY = "landing_showcase"


async def _query_question_ids(repo: QuestionRepository, filt: Dict[str, Any], *, limit: int = 2000) -> List[str]:
    if not filt:
        return []
    cur = repo._col.find(filt, {"_id": 1}).limit(limit)
    return [oid_str(d["_id"]) async for d in cur]


async def _expand_pool_for_spec(repo: QuestionRepository, spec: Dict[str, Any]) -> Tuple[List[str], int]:
    want = int(spec["total_questions"])
    diffs = list(spec.get("difficulties") or [])

    subjects: List[str] = list(spec.get("subjects") or [])
    exam_tags: List[str] = list(spec.get("exam_tags") or [])
    exam_tag = spec.get("exam_tag")
    if exam_tag and str(exam_tag).strip().upper() not in [t.upper() for t in exam_tags]:
        exam_tags.append(str(exam_tag).strip().upper())

    strategies: List[Dict[str, Any]] = []
    if subjects and exam_tags:
        strategies.append({"subject": {"$in": subjects}, "tags": {"$in": exam_tags}})
    if subjects:
        strategies.append({"subject": {"$in": subjects}})

    or_parts: List[Dict[str, Any]] = []
    for pat in spec.get("subject_patterns") or []:
        or_parts.append({"subject": {"$regex": pat, "$options": "i"}})
    for pat in spec.get("topic_patterns") or []:
        or_parts.append({"topic": {"$regex": pat, "$options": "i"}})
    if or_parts:
        strategies.append({"$or": or_parts})
    if exam_tags:
        strategies.append({"tags": {"$in": exam_tags}})

    def _with_difficulty(base: Dict[str, Any], use_diffs: List[str]) -> Dict[str, Any]:
        if not use_diffs:
            return base
        clause = {"difficulty": {"$in": use_diffs}}
        if not base:
            return clause
        return {"$and": [base, clause]}

    collected: List[str] = []
    seen: set[str] = set()

    async def _merge(use_diffs: List[str]) -> None:
        nonlocal collected, seen
        for strat in strategies:
            filt = _with_difficulty(strat, use_diffs)
            for qid in await _query_question_ids(repo, filt):
                if qid not in seen:
                    seen.add(qid)
                    collected.append(qid)
            if len(collected) >= want:
                return

    await _merge(diffs)
    if len(collected) < want and diffs:
        await _merge([])

    if not collected:
        return [], 0
    actual = min(want, len(collected))
    return collected[:2000], actual


async def _build_sections(repo: QuestionRepository, specs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    sections: List[Dict[str, Any]] = []
    for spec in specs:
        pool, tq = await _expand_pool_for_spec(repo, spec)
        primary_subject = (spec.get("subjects") or [None])[0]
        sec: Dict[str, Any] = {
            "id": f"sec_{uuid.uuid4().hex[:12]}",
            "title": spec["title"],
            "order": int(spec.get("order", 0)),
            "subject": primary_subject,
            "topic": None,
            "exam_tag": spec.get("exam_tag"),
            "total_questions": tq if tq > 0 else int(spec["total_questions"]),
            "time_limit_seconds": int(spec.get("time_limit_seconds", 600)),
        }
        if pool and tq > 0:
            sec["question_pool_ids"] = pool
        sections.append(sec)
    return sections


class LandingShowcaseService:
    def __init__(self) -> None:
        self._papers = PaperRepository()
        self._questions = QuestionRepository()

    async def ensure_showcase_papers(self) -> None:
        for category, paper_specs in LANDING_SHOWCASE_SPECS.items():
            for pspec in paper_specs:
                try:
                    await self._ensure_one(category, pspec)
                except Exception as exc:
                    logger.warning(
                        "Could not ensure showcase paper %r (%s): %s",
                        pspec["title"],
                        category,
                        exc,
                    )

    async def _ensure_one(self, category: str, pspec: Dict[str, Any]) -> None:
        slot = int(pspec["slot"])
        title = str(pspec["title"])
        existing = await self._papers.find_showcase_paper(category, slot)
        if existing:
            return

        by_title = await self._papers.list_papers_by_title_case_insensitive(title)
        if by_title:
            doc = by_title[0]
            await self._papers.update_paper(
                oid_str(doc["_id"]),
                {
                    "showcase_category": category,
                    "showcase_slot": slot,
                    "is_landing_showcase": True,
                },
            )
            return

        sections = await _build_sections(self._questions, pspec["sections"])
        if not sections:
            raise ValueError("no sections built")

        await self._papers.insert_paper(
            {
                "title": title,
                "sections": sections,
                "marks_per_correct": 1.0,
                "marks_per_incorrect": 0.25,
                "created_by": SHOWCASE_CREATED_BY,
                "showcase_category": category,
                "showcase_slot": slot,
                "is_landing_showcase": True,
            }
        )

    async def list_for_category(
        self,
        category: str,
        *,
        student_username: Optional[str] = None,
    ) -> List[ExamShowcasePaperOut]:
        cat = category.strip().lower()
        if cat not in VALID_LANDING_CATEGORIES:
            raise ValueError("Unknown exam category")

        await self.ensure_showcase_papers()

        specs = LANDING_SHOWCASE_SPECS[cat]
        rows = await self._papers.list_showcase_by_category(cat)
        by_slot = {int(r.get("showcase_slot", 0)): r for r in rows}

        out: List[ExamShowcasePaperOut] = []
        for pspec in specs:
            slot = int(pspec["slot"])
            paper = by_slot.get(slot)
            if not paper:
                rows_by_title = await self._papers.list_papers_by_title_case_insensitive(pspec["title"])
                paper = rows_by_title[0] if rows_by_title else None

            paper_id = oid_str(paper["_id"]) if paper else None
            section_count = len(paper.get("sections", [])) if paper else len(pspec["sections"])
            title = str(paper.get("title", pspec["title"])) if paper else pspec["title"]
            locked = True
            if student_username and paper_id:
                locked = not await self._papers.has_assignment(paper_id, student_username)

            out.append(
                ExamShowcasePaperOut(
                    id=paper_id,
                    title=title,
                    section_count=section_count,
                    category=cat,
                    locked=locked,
                    purchasable=paper_id is not None,
                )
            )
        return out
