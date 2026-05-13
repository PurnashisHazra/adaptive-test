from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from app.models.domain import AttemptStatus
from app.repositories.paper_repository import PaperRepository
from app.schemas.attempt import (
    AttemptSummary,
    PaperNextSection,
    SubmitAnswerResponse,
    TestStartResponse,
)
from app.schemas.paper import (
    PaperResultSummary,
    PaperSectionResultItem,
    PaperSessionMeta,
    QuestionPaperCreate,
    QuestionPaperOut,
    QuestionPaperUpdate,
)
from app.services.test_service import TestService
from app.utils.ids import oid_str


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _sorted_sections(paper: Dict[str, Any]) -> List[Dict[str, Any]]:
    return sorted(paper.get("sections", []), key=lambda s: int(s.get("order", 0)))


def _marks_from_answers(answers: List[Dict[str, Any]], mpc: float, mpi: float) -> Tuple[float, int, int]:
    correct = 0
    wrong = 0
    m = 0.0
    for a in answers:
        if bool(a.get("is_correct")):
            correct += 1
            m += mpc
        else:
            wrong += 1
            m -= mpi
    return m, correct, wrong


def _max_marks(paper: Dict[str, Any], mpc: float) -> float:
    return sum(int(s.get("total_questions", 0)) for s in _sorted_sections(paper)) * mpc


class PaperService:
    def __init__(self) -> None:
        self._papers = PaperRepository()
        self._tests = TestService()

    def _out_paper(self, doc: Dict[str, Any]) -> QuestionPaperOut:
        from app.schemas.paper import PaperSectionOut

        secs = _sorted_sections(doc)
        return QuestionPaperOut(
            id=oid_str(doc["_id"]),
            title=doc["title"],
            sections=[
                PaperSectionOut(
                    id=str(s["id"]),
                    title=s["title"],
                    order=int(s.get("order", 0)),
                    subject=s.get("subject"),
                    topic=s.get("topic"),
                    exam_tag=s.get("exam_tag"),
                    total_questions=int(s["total_questions"]),
                    time_limit_seconds=int(s["time_limit_seconds"]),
                    question_pool_ids=list(s["question_pool_ids"])
                    if isinstance(s.get("question_pool_ids"), list) and s.get("question_pool_ids")
                    else None,
                )
                for s in secs
            ],
            marks_per_correct=float(doc.get("marks_per_correct", 1)),
            marks_per_incorrect=float(doc.get("marks_per_incorrect", 0)),
            created_at=doc["created_at"],
            updated_at=doc.get("updated_at") or doc["created_at"],
        )

    async def create_paper(self, body: QuestionPaperCreate, created_by: str) -> QuestionPaperOut:
        doc = {
            "title": body.title,
            "sections": [s.model_dump() for s in body.sections],
            "marks_per_correct": float(body.marks_per_correct),
            "marks_per_incorrect": float(body.marks_per_incorrect),
            "created_by": created_by,
        }
        pid = await self._papers.insert_paper(doc)
        got = await self._papers.get_paper(pid)
        assert got is not None
        return self._out_paper(got)

    async def update_paper(self, paper_id: str, patch: QuestionPaperUpdate) -> QuestionPaperOut:
        p: Dict[str, Any] = {}
        if patch.title is not None:
            p["title"] = patch.title
        if patch.sections is not None:
            p["sections"] = [s.model_dump() for s in patch.sections]
        if patch.marks_per_correct is not None:
            p["marks_per_correct"] = float(patch.marks_per_correct)
        if patch.marks_per_incorrect is not None:
            p["marks_per_incorrect"] = float(patch.marks_per_incorrect)
        if not p:
            got = await self._papers.get_paper(paper_id)
            if not got:
                raise ValueError("Paper not found")
            return self._out_paper(got)
        ok = await self._papers.update_paper(paper_id, p)
        if not ok:
            raise ValueError("Paper not found")
        got = await self._papers.get_paper(paper_id)
        assert got is not None
        return self._out_paper(got)

    async def get_paper(self, paper_id: str) -> QuestionPaperOut:
        got = await self._papers.get_paper(paper_id)
        if not got:
            raise ValueError("Paper not found")
        return self._out_paper(got)

    async def list_papers(self) -> List[QuestionPaperOut]:
        rows = await self._papers.list_papers()
        return [self._out_paper(r) for r in rows]

    async def assign(self, paper_id: str, student_username: str) -> None:
        got = await self._papers.get_paper(paper_id)
        if not got:
            raise ValueError("Paper not found")
        await self._papers.upsert_assignment(paper_id, student_username)

    async def ensure_assigned(self, paper_id: str, student_username: str) -> bool:
        """Assign the paper to the student if not already assigned. Returns True if a new row was created."""
        uname = student_username.strip()
        if await self._papers.has_assignment(paper_id, uname):
            return False
        await self.assign(paper_id, uname)
        return True

    async def unassign(self, paper_id: str, student_username: str) -> None:
        await self._papers.remove_assignment(paper_id, student_username)

    async def sync_assignments(self, paper_id: str, usernames: List[str]) -> None:
        got = await self._papers.get_paper(paper_id)
        if not got:
            raise ValueError("Paper not found")
        await self._papers.sync_assignments_for_paper(paper_id, usernames)

    async def assign_paper_by_title(self, title: str, assignees: List[str]) -> Tuple[str, str, List[str]]:
        """Resolve paper by title (case-insensitive, exact match) and replace its assignment list."""
        normalized = sorted({str(u).strip() for u in assignees if u is not None and str(u).strip()})
        if not normalized:
            raise ValueError("assignees must contain at least one non-empty username")
        rows = await self._papers.list_papers_by_title_case_insensitive(title)
        if not rows:
            raise ValueError("No question paper matches this title")
        if len(rows) > 1:
            ids = [oid_str(r["_id"]) for r in rows[:8]]
            raise ValueError(
                f"Multiple question papers match this title ({len(rows)} found). "
                f"Rename duplicates or assign by paper id. Matching ids: {ids}"
            )
        pid = oid_str(rows[0]["_id"])
        await self.sync_assignments(pid, normalized)
        return pid, str(rows[0].get("title", "")), normalized

    async def list_assignments(self, paper_id: str) -> List[Dict[str, Any]]:
        got = await self._papers.get_paper(paper_id)
        if not got:
            raise ValueError("Paper not found")
        rows = await self._papers.list_assignments_for_paper(paper_id)
        # Raw docs include BSON ObjectId on _id; only expose JSON-serializable fields.
        return [
            {
                "paper_id": str(r["paper_id"]),
                "student_username": str(r["student_username"]),
                "assigned_at": r["assigned_at"],
            }
            for r in rows
        ]

    def _session_meta(
        self,
        paper: Dict[str, Any],
        paper_attempt_id: str,
        section_index: int,
    ) -> PaperSessionMeta:
        secs = _sorted_sections(paper)
        sec = secs[section_index]
        return PaperSessionMeta(
            paper_attempt_id=paper_attempt_id,
            paper_id=oid_str(paper["_id"]),
            paper_title=paper["title"],
            section_index=section_index,
            section_title=sec["title"],
            total_sections=len(secs),
            marks_per_correct=float(paper.get("marks_per_correct", 1)),
            marks_per_incorrect=float(paper.get("marks_per_incorrect", 0)),
        )

    async def _start_section_attempt(
        self,
        paper: Dict[str, Any],
        paper_attempt: Dict[str, Any],
        section_index: int,
    ) -> TestStartResponse:
        secs = _sorted_sections(paper)
        if section_index < 0 or section_index >= len(secs):
            raise ValueError("Invalid section")
        sec = secs[section_index]
        pa_id = oid_str(paper_attempt["_id"])
        ctx = {"paper_attempt_id": pa_id, "paper_section_index": section_index}
        pool = sec.get("question_pool_ids")
        pool_list = [str(x).strip() for x in pool] if isinstance(pool, list) else None
        if pool_list:
            pool_list = [x for x in pool_list if x]
        pool_arg = pool_list if pool_list else None
        res = await self._tests.start_test(
            student_name=paper_attempt["student_username"],
            subject=sec.get("subject"),
            topic=sec.get("topic"),
            exam_tag=sec.get("exam_tag"),
            total_questions=int(sec["total_questions"]),
            time_limit_seconds=int(sec["time_limit_seconds"]),
            paper_context=ctx,
            question_pool_ids=pool_arg,
        )
        meta = self._session_meta(paper, pa_id, section_index)
        return TestStartResponse(
            attempt_id=res.attempt_id,
            question=res.question,
            question_index=res.question_index,
            total_questions=res.total_questions,
            time_limit_seconds=res.time_limit_seconds,
            started_at=res.started_at,
            marked_for_review=res.marked_for_review,
            questions_answered=res.questions_answered,
            max_reachable_index=res.max_reachable_index,
            can_submit=True,
            paper=meta,
        )

    async def start_paper(self, paper_id: str, student_username: str) -> TestStartResponse:
        paper = await self._papers.get_paper(paper_id)
        if not paper:
            raise ValueError("Paper not found")
        uname = student_username.strip()
        if not await self._papers.has_assignment(paper_id, uname):
            raise ValueError("This paper is not assigned to you")

        existing = await self._papers.find_paper_attempt(paper_id, uname)
        if existing and existing.get("status") in ("in_progress", "completed", "ended_early"):
            raise ValueError("You have already started this question paper. It cannot be restarted.")

        doc = {
            "paper_id": paper_id,
            "student_username": uname,
            "status": "in_progress",
            "current_section_index": 0,
            "section_attempt_ids": [],
            "section_results": [],
            "active_attempt_id": "",
        }
        paid = await self._papers.insert_paper_attempt(doc)
        p_att = await self._papers.get_paper_attempt(paid)
        assert p_att is not None

        start = await self._start_section_attempt(paper, p_att, 0)
        await self._papers.update_paper_attempt(
            paid,
            {
                "active_attempt_id": start.attempt_id,
                "section_attempt_ids": [start.attempt_id],
                "current_section_index": 0,
            },
        )
        return start

    async def resume_paper(self, paper_id: str, student_username: str) -> TestStartResponse:
        paper = await self._papers.get_paper(paper_id)
        if not paper:
            raise ValueError("Paper not found")
        uname = student_username.strip()
        if not await self._papers.has_assignment(paper_id, uname):
            raise ValueError("This paper is not assigned to you")
        pa = await self._papers.find_paper_attempt(paper_id, uname)
        if not pa or pa.get("status") != "in_progress":
            raise ValueError("No paper session in progress to resume")
        pa_id = oid_str(pa["_id"])
        active = str(pa.get("active_attempt_id", "")).strip()
        if not active:
            raise ValueError("No active section")
        att = await self._tests._attempts.get(active)
        if not att or att.get("status") != AttemptStatus.IN_PROGRESS.value:
            raise ValueError("Your session could not be restored. Please contact your instructor.")

        answered = int(att.get("questions_answered", 0))
        next_idx = answered + 1
        try:
            qi = await self._tests.get_question_at_index(active, next_idx)
        except ValueError as e:
            raise ValueError(str(e) or "Could not resume this paper") from e

        sec_idx = int(pa.get("current_section_index", 0))
        meta = self._session_meta(paper, pa_id, sec_idx)
        tl = att.get("time_limit_seconds")
        tl_int = int(tl) if tl is not None else None
        return TestStartResponse(
            attempt_id=active,
            question=qi.question,
            question_index=qi.question_index,
            total_questions=qi.total_questions,
            time_limit_seconds=tl_int,
            started_at=att["started_at"],
            marked_for_review=qi.marked_for_review,
            questions_answered=qi.questions_answered,
            max_reachable_index=qi.max_reachable_index,
            can_submit=qi.can_submit,
            paper=meta,
        )

    async def after_section_attempt_completed(
        self,
        *,
        attempt_id: str,
        att_done: Dict[str, Any],
        section_summary: AttemptSummary,
        is_correct: bool,
        explanation: Optional[str],
        mf: List[int],
        new_answered: int,
    ) -> SubmitAnswerResponse:
        pa_id = str(att_done.get("paper_attempt_id", ""))
        paper_attempt = await self._papers.get_paper_attempt(pa_id)
        if not paper_attempt:
            raise ValueError("Paper attempt not found")
        paper = await self._papers.get_paper(paper_attempt["paper_id"])
        if not paper:
            raise ValueError("Paper not found")

        secs = _sorted_sections(paper)
        sec_idx = int(att_done.get("paper_section_index", 0))
        mpc = float(paper.get("marks_per_correct", 1))
        mpi = float(paper.get("marks_per_incorrect", 0))
        answers = list(att_done.get("answers", []))
        marks, correct, wrong = _marks_from_answers(answers, mpc, mpi)

        sec_result = {
            "section_index": sec_idx,
            "section_title": secs[sec_idx]["title"],
            "attempt_id": attempt_id,
            "marks": marks,
            "correct": correct,
            "wrong": wrong,
            "total_questions": int(secs[sec_idx]["total_questions"]),
        }
        prev_results = list(paper_attempt.get("section_results", []))
        prev_results.append(sec_result)
        await self._papers.update_paper_attempt(pa_id, {"section_results": prev_results})
        p_att = await self._papers.get_paper_attempt(pa_id)
        assert p_att is not None

        if sec_idx + 1 < len(secs):
            nxt = await self._start_section_attempt(paper, p_att, sec_idx + 1)
            ids = list(p_att.get("section_attempt_ids", []))
            if nxt.attempt_id not in ids:
                ids.append(nxt.attempt_id)
            await self._papers.update_paper_attempt(
                pa_id,
                {
                    "current_section_index": sec_idx + 1,
                    "active_attempt_id": nxt.attempt_id,
                    "section_attempt_ids": ids,
                },
            )
            assert nxt.paper is not None
            pn = PaperNextSection(
                attempt_id=nxt.attempt_id,
                question=nxt.question,
                question_index=nxt.question_index,
                total_questions=nxt.total_questions,
                time_limit_seconds=nxt.time_limit_seconds,
                started_at=nxt.started_at,
                marked_for_review=nxt.marked_for_review,
                questions_answered=nxt.questions_answered,
                max_reachable_index=nxt.max_reachable_index,
                paper=nxt.paper,
            )
            return SubmitAnswerResponse(
                is_correct=is_correct,
                explanation=explanation,
                completed=False,
                next_question=None,
                question_index=None,
                summary=None,
                marked_for_review=mf,
                questions_answered=new_answered,
                max_reachable_index=len(list(att_done.get("question_ids", []))),
                paper_next=pn,
                paper_summary=None,
            )

        total_marks = sum(float(r["marks"]) for r in prev_results)
        max_m = _max_marks(paper, mpc)
        pct = (total_marks / max_m * 100.0) if max_m > 0 else 0.0
        pct = max(0.0, min(100.0, round(pct, 2)))

        await self._papers.update_paper_attempt(
            pa_id,
            {
                "status": "completed",
                "completed_at": _utc_now(),
                "total_marks": total_marks,
            },
        )

        pr = PaperResultSummary(
            paper_attempt_id=pa_id,
            paper_id=oid_str(paper["_id"]),
            title=paper["title"],
            student_name=paper_attempt["student_username"],
            total_marks=round(total_marks, 4),
            max_marks=round(max_m, 4),
            percentage=pct,
            sections=[
                PaperSectionResultItem(
                    section_title=str(r["section_title"]),
                    total_questions=int(r["total_questions"]),
                    correct=int(r["correct"]),
                    wrong=int(r["wrong"]),
                    marks=round(float(r["marks"]), 4),
                )
                for r in prev_results
            ],
            started_at=paper_attempt["started_at"],
            completed_at=_utc_now(),
            ended_early=False,
        )

        return SubmitAnswerResponse(
            is_correct=is_correct,
            explanation=explanation,
            completed=True,
            next_question=None,
            question_index=None,
            summary=None,
            marked_for_review=mf,
            questions_answered=new_answered,
            max_reachable_index=len(list(att_done.get("question_ids", []))),
            paper_next=None,
            paper_summary=pr,
        )

    async def _finalize_paper_result(
        self,
        paper_attempt: Dict[str, Any],
        paper: Dict[str, Any],
        ended_early: bool,
    ) -> PaperResultSummary:
        pa_id = oid_str(paper_attempt["_id"])
        mpc = float(paper.get("marks_per_correct", 1))
        max_m = _max_marks(paper, mpc)
        prev_results = list(paper_attempt.get("section_results", []))
        total_marks = sum(float(r["marks"]) for r in prev_results)
        pct = (total_marks / max_m * 100.0) if max_m > 0 else 0.0
        pct = max(0.0, min(100.0, round(pct, 2)))
        return PaperResultSummary(
            paper_attempt_id=pa_id,
            paper_id=oid_str(paper["_id"]),
            title=paper["title"],
            student_name=paper_attempt["student_username"],
            total_marks=round(total_marks, 4),
            max_marks=round(max_m, 4),
            percentage=pct,
            sections=[
                PaperSectionResultItem(
                    section_title=str(r["section_title"]),
                    total_questions=int(r["total_questions"]),
                    correct=int(r["correct"]),
                    wrong=int(r["wrong"]),
                    marks=round(float(r["marks"]), 4),
                )
                for r in prev_results
            ],
            started_at=paper_attempt["started_at"],
            completed_at=_utc_now(),
            ended_early=ended_early,
        )

    async def end_paper_early(self, paper_attempt_id: str, student_username: Optional[str] = None) -> PaperResultSummary:
        pa = await self._papers.get_paper_attempt(paper_attempt_id)
        if not pa:
            raise ValueError("Paper attempt not found")
        if student_username and pa.get("student_username") != student_username.strip():
            raise ValueError("Not found")
        if pa.get("status") != "in_progress":
            raise ValueError("Paper is not in progress")

        paper = await self._papers.get_paper(pa["paper_id"])
        if not paper:
            raise ValueError("Paper not found")

        active = str(pa.get("active_attempt_id", ""))
        if active:
            att = await self._tests._attempts.get(active)
            if att and att.get("status") == "in_progress":
                await self._tests.end_test_early(active, allow_paper=True)
                att_done = await self._tests._attempts.get(active)
                if att_done:
                    secs = _sorted_sections(paper)
                    sec_idx = int(att_done.get("paper_section_index", 0))
                    mpc = float(paper.get("marks_per_correct", 1))
                    mpi = float(paper.get("marks_per_incorrect", 0))
                    answers = list(att_done.get("answers", []))
                    marks, correct, wrong = _marks_from_answers(answers, mpc, mpi)
                    sec_result = {
                        "section_index": sec_idx,
                        "section_title": secs[sec_idx]["title"],
                        "attempt_id": active,
                        "marks": marks,
                        "correct": correct,
                        "wrong": wrong,
                        "total_questions": int(secs[sec_idx]["total_questions"]),
                    }
                    prev = list(pa.get("section_results", []))
                    if not any(r.get("attempt_id") == active for r in prev):
                        prev.append(sec_result)
                    await self._papers.update_paper_attempt(paper_attempt_id, {"section_results": prev})
                    pa = await self._papers.get_paper_attempt(paper_attempt_id) or pa

        await self._papers.update_paper_attempt(
            paper_attempt_id,
            {"status": "ended_early", "completed_at": _utc_now()},
        )
        pa = await self._papers.get_paper_attempt(paper_attempt_id) or pa
        paper = await self._papers.get_paper(pa["paper_id"]) or paper
        return await self._finalize_paper_result(pa, paper, ended_early=True)

    async def timeout_current_section(
        self, paper_attempt_id: str, student_username: Optional[str] = None
    ) -> SubmitAnswerResponse:
        pa = await self._papers.get_paper_attempt(paper_attempt_id)
        if not pa:
            raise ValueError("Paper attempt not found")
        if student_username and pa.get("student_username") != student_username.strip():
            raise ValueError("Not found")
        if pa.get("status") != "in_progress":
            raise ValueError("Paper is not in progress")

        paper = await self._papers.get_paper(pa["paper_id"])
        if not paper:
            raise ValueError("Paper not found")

        active = str(pa.get("active_attempt_id", ""))
        if not active:
            raise ValueError("No active section")

        await self._tests.force_complete_attempt_timeout(active)
        att_done = await self._tests._attempts.get(active)
        if not att_done:
            raise ValueError("Attempt missing")

        secs = _sorted_sections(paper)
        sec_idx = int(att_done.get("paper_section_index", 0))
        mpc = float(paper.get("marks_per_correct", 1))
        mpi = float(paper.get("marks_per_incorrect", 0))
        answers = list(att_done.get("answers", []))
        marks, correct, wrong = _marks_from_answers(answers, mpc, mpi)

        sec_result = {
            "section_index": sec_idx,
            "section_title": secs[sec_idx]["title"],
            "attempt_id": active,
            "marks": marks,
            "correct": correct,
            "wrong": wrong,
            "total_questions": int(secs[sec_idx]["total_questions"]),
        }
        prev = list(pa.get("section_results", []))
        prev.append(sec_result)
        await self._papers.update_paper_attempt(paper_attempt_id, {"section_results": prev})
        pa = await self._papers.get_paper_attempt(paper_attempt_id)
        assert pa is not None

        if sec_idx + 1 < len(secs):
            nxt = await self._start_section_attempt(paper, pa, sec_idx + 1)
            await self._papers.update_paper_attempt(
                paper_attempt_id,
                {
                    "current_section_index": sec_idx + 1,
                    "active_attempt_id": nxt.attempt_id,
                    "section_attempt_ids": list(pa.get("section_attempt_ids", [])) + [nxt.attempt_id],
                },
            )
            assert nxt.paper is not None
            pn = PaperNextSection(
                attempt_id=nxt.attempt_id,
                question=nxt.question,
                question_index=nxt.question_index,
                total_questions=nxt.total_questions,
                time_limit_seconds=nxt.time_limit_seconds,
                started_at=nxt.started_at,
                marked_for_review=nxt.marked_for_review,
                questions_answered=nxt.questions_answered,
                max_reachable_index=nxt.max_reachable_index,
                paper=nxt.paper,
            )
            return SubmitAnswerResponse(
                is_correct=False,
                explanation=None,
                completed=False,
                next_question=None,
                question_index=None,
                summary=None,
                marked_for_review=[],
                questions_answered=int(att_done.get("questions_answered", 0)),
                max_reachable_index=len(list(att_done.get("question_ids", []))),
                paper_next=pn,
                paper_summary=None,
            )

        total_marks = sum(float(r["marks"]) for r in prev)
        max_m = _max_marks(paper, mpc)
        pct = (total_marks / max_m * 100.0) if max_m > 0 else 0.0
        pct = max(0.0, min(100.0, round(pct, 2)))
        await self._papers.update_paper_attempt(
            paper_attempt_id,
            {"status": "completed", "completed_at": _utc_now(), "total_marks": total_marks},
        )
        pa = await self._papers.get_paper_attempt(paper_attempt_id) or pa
        pr = await self._finalize_paper_result(pa, paper, ended_early=False)
        return SubmitAnswerResponse(
            is_correct=False,
            explanation=None,
            completed=True,
            next_question=None,
            question_index=None,
            summary=None,
            marked_for_review=[],
            questions_answered=int(att_done.get("questions_answered", 0)),
            max_reachable_index=len(list(att_done.get("question_ids", []))),
            paper_next=None,
            paper_summary=pr,
        )

    async def list_assigned_for_student(self, student_username: str) -> List[Dict[str, Any]]:
        assigns = await self._papers.list_assignments_for_student(student_username)
        out: List[Dict[str, Any]] = []
        for a in assigns:
            pid = a["paper_id"]
            pdoc = await self._papers.get_paper(pid)
            if not pdoc:
                continue
            pa = await self._papers.find_paper_attempt(pid, student_username)
            secs = _sorted_sections(pdoc)
            in_progress = pa is not None and pa.get("status") == "in_progress"
            out.append(
                {
                    "paper_id": pid,
                    "title": pdoc["title"],
                    "marks_per_correct": float(pdoc.get("marks_per_correct", 1)),
                    "marks_per_incorrect": float(pdoc.get("marks_per_incorrect", 0)),
                    "section_count": len(secs),
                    "has_started": pa is not None,
                    "completed": pa is not None and pa.get("status") in ("completed", "ended_early"),
                    "paper_attempt_id": oid_str(pa["_id"]) if in_progress else None,
                }
            )
        return out
