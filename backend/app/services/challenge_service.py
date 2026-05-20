from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from app.models.domain import AttemptStatus
from app.repositories.challenge_repository import ChallengeRepository
from app.utils.ist_time import ensure_utc, utc_now
from app.schemas.attempt import (
    AttemptSummary,
    PaperNextSection,
    SubmitAnswerResponse,
    TestStartResponse,
)
from app.schemas.challenge import (
    ChallengeCatalogItem,
    ChallengeCreate,
    ChallengeOut,
    ChallengeUpdate,
)
from app.schemas.public_profile import ChallengeParticipantBrief
from app.services.public_profile_service import PublicProfileService
from app.schemas.paper import (
    PaperResultSummary,
    PaperSectionOut,
    PaperSectionResultItem,
    PaperSessionMeta,
)
from app.services.admin_limits_service import AdminLimitsService
from app.services.test_service import TestService, _attempt_filters_from_doc
from app.utils.ids import oid_str


def _as_utc_storage(dt: datetime) -> datetime:
    return ensure_utc(dt)


def _sorted_sections(challenge: Dict[str, Any]) -> List[Dict[str, Any]]:
    return sorted(challenge.get("sections", []), key=lambda s: int(s.get("order", 0)))


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


def _max_marks(challenge: Dict[str, Any], mpc: float) -> float:
    return sum(int(s.get("total_questions", 0)) for s in _sorted_sections(challenge)) * mpc


def _percentile_among_ranked(username: str, ranked: List[Dict[str, Any]]) -> Optional[float]:
    if not ranked:
        return None
    scores = [(str(r["student_username"]), float(r.get("total_marks", 0))) for r in ranked]
    user_score = next((s for u, s in scores if u == username), None)
    if user_score is None:
        return None
    n = len(scores)
    if n <= 1:
        return 100.0
    below = sum(1 for _, s in scores if s < user_score)
    return round(100.0 * below / (n - 1), 1)


def _window_status(launch_at: datetime, end_at: datetime, now: Optional[datetime] = None) -> Tuple[str, Optional[int], Optional[int]]:
    now = ensure_utc(now) if now is not None else utc_now()
    launch = ensure_utc(launch_at)
    end = ensure_utc(end_at)
    if now < launch:
        return "upcoming", int((launch - now).total_seconds()), None
    if now >= end:
        return "ended", None, None
    return "live", None, int((end - now).total_seconds())


class ChallengeService:
    def __init__(self) -> None:
        self._challenges = ChallengeRepository()
        self._tests = TestService()

    def _out_challenge(self, doc: Dict[str, Any]) -> ChallengeOut:
        secs = _sorted_sections(doc)
        return ChallengeOut(
            id=oid_str(doc["_id"]),
            title=doc["title"],
            description=str(doc.get("description") or ""),
            level=str(doc.get("level") or "INTERMEDIATE"),
            is_adaptive=bool(doc.get("is_adaptive", True)),
            launch_at=ensure_utc(doc["launch_at"]),
            end_at=ensure_utc(doc["end_at"]),
            open_to_all=bool(doc.get("open_to_all", False)),
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

    def _collect_pool_ids(self, body: ChallengeCreate) -> List[str]:
        ids: List[str] = []
        for sec in body.sections:
            pool = sec.question_pool_ids
            if pool:
                ids.extend(str(x).strip() for x in pool if str(x).strip())
        return ids

    async def create_challenge(self, body: ChallengeCreate, created_by: str) -> ChallengeOut:
        await AdminLimitsService().assert_can_create_paper(created_by)
        pool_ids = self._collect_pool_ids(body)
        if pool_ids:
            await AdminLimitsService().assert_questions_allowed_for_admin(created_by, pool_ids)
        doc = {
            "title": body.title,
            "description": body.description.strip(),
            "level": body.level,
            "is_adaptive": body.is_adaptive,
            "launch_at": _as_utc_storage(body.launch_at),
            "end_at": _as_utc_storage(body.end_at),
            "open_to_all": body.open_to_all,
            "sections": [s.model_dump() for s in body.sections],
            "marks_per_correct": float(body.marks_per_correct),
            "marks_per_incorrect": float(body.marks_per_incorrect),
            "created_by": created_by,
        }
        cid = await self._challenges.insert_challenge(doc)
        got = await self._challenges.get_challenge(cid)
        assert got is not None
        return self._out_challenge(got)

    async def update_challenge(
        self, challenge_id: str, patch: ChallengeUpdate, *, admin_username: Optional[str] = None
    ) -> ChallengeOut:
        p: Dict[str, Any] = {}
        if patch.title is not None:
            p["title"] = patch.title
        if patch.description is not None:
            p["description"] = patch.description.strip()
        if patch.level is not None:
            p["level"] = patch.level
        if patch.is_adaptive is not None:
            p["is_adaptive"] = patch.is_adaptive
        if patch.launch_at is not None:
            p["launch_at"] = _as_utc_storage(patch.launch_at)
        if patch.end_at is not None:
            p["end_at"] = _as_utc_storage(patch.end_at)
        if patch.open_to_all is not None:
            p["open_to_all"] = patch.open_to_all
        if patch.sections is not None:
            p["sections"] = [s.model_dump() for s in patch.sections]
            if admin_username:
                pool_ids: List[str] = []
                for sec in patch.sections:
                    pool = sec.question_pool_ids
                    if pool:
                        pool_ids.extend(str(x).strip() for x in pool if str(x).strip())
                if pool_ids:
                    await AdminLimitsService().assert_questions_allowed_for_admin(admin_username, pool_ids)
        if patch.marks_per_correct is not None:
            p["marks_per_correct"] = float(patch.marks_per_correct)
        if patch.marks_per_incorrect is not None:
            p["marks_per_incorrect"] = float(patch.marks_per_incorrect)
        if not p:
            got = await self._challenges.get_challenge(challenge_id)
            if not got:
                raise ValueError("Challenge not found")
            return self._out_challenge(got)
        got = await self._challenges.get_challenge(challenge_id)
        if not got:
            raise ValueError("Challenge not found")
        launch = p.get("launch_at", got["launch_at"])
        end = p.get("end_at", got["end_at"])
        if end <= launch:
            raise ValueError("end_at must be after launch_at")
        ok = await self._challenges.update_challenge(challenge_id, p)
        if not ok:
            raise ValueError("Challenge not found")
        got = await self._challenges.get_challenge(challenge_id)
        assert got is not None
        return self._out_challenge(got)

    async def get_challenge(self, challenge_id: str) -> ChallengeOut:
        got = await self._challenges.get_challenge(challenge_id)
        if not got:
            raise ValueError("Challenge not found")
        return self._out_challenge(got)

    async def list_challenges(self) -> List[ChallengeOut]:
        rows = await self._challenges.list_challenges()
        return [self._out_challenge(r) for r in rows]

    async def assign(self, challenge_id: str, student_username: str) -> None:
        got = await self._challenges.get_challenge(challenge_id)
        if not got:
            raise ValueError("Challenge not found")
        await self._challenges.upsert_assignment(challenge_id, student_username)

    async def unassign(self, challenge_id: str, student_username: str) -> None:
        await self._challenges.remove_assignment(challenge_id, student_username)

    async def sync_assignments(self, challenge_id: str, usernames: List[str]) -> None:
        got = await self._challenges.get_challenge(challenge_id)
        if not got:
            raise ValueError("Challenge not found")
        await self._challenges.sync_assignments_for_challenge(challenge_id, usernames)

    async def list_assignments(self, challenge_id: str) -> List[Dict[str, Any]]:
        got = await self._challenges.get_challenge(challenge_id)
        if not got:
            raise ValueError("Challenge not found")
        rows = await self._challenges.list_assignments_for_challenge(challenge_id)
        return [
            {
                "challenge_id": str(r["challenge_id"]),
                "student_username": str(r["student_username"]),
                "assigned_at": r["assigned_at"],
            }
            for r in rows
        ]

    def _has_access(self, challenge: Dict[str, Any], student_username: Optional[str]) -> bool:
        if bool(challenge.get("open_to_all", False)):
            return True
        if not student_username:
            return False
        return False  # checked async in catalog

    async def _student_has_access(self, challenge: Dict[str, Any], student_username: str) -> bool:
        if bool(challenge.get("open_to_all", False)):
            return True
        return await self._challenges.has_assignment(oid_str(challenge["_id"]), student_username)

    def _assert_live(self, challenge: Dict[str, Any]) -> None:
        status, _, _ = _window_status(challenge["launch_at"], challenge["end_at"])
        if status == "upcoming":
            raise ValueError("This challenge has not started yet")
        if status == "ended":
            raise ValueError("This challenge has ended")

    def _session_meta(self, challenge: Dict[str, Any], challenge_attempt_id: str, section_index: int) -> PaperSessionMeta:
        secs = _sorted_sections(challenge)
        sec = secs[section_index]
        return PaperSessionMeta(
            paper_attempt_id=challenge_attempt_id,
            paper_id=oid_str(challenge["_id"]),
            paper_title=challenge["title"],
            section_index=section_index,
            section_title=sec["title"],
            total_sections=len(secs),
            marks_per_correct=float(challenge.get("marks_per_correct", 1)),
            marks_per_incorrect=float(challenge.get("marks_per_incorrect", 0)),
        )

    async def _start_section_attempt(
        self,
        challenge: Dict[str, Any],
        challenge_attempt: Dict[str, Any],
        section_index: int,
    ) -> TestStartResponse:
        secs = _sorted_sections(challenge)
        if section_index < 0 or section_index >= len(secs):
            raise ValueError("Invalid section")
        sec = secs[section_index]
        ca_id = oid_str(challenge_attempt["_id"])
        ctx = {"challenge_attempt_id": ca_id, "challenge_section_index": section_index}
        pool = sec.get("question_pool_ids")
        pool_list = [str(x).strip() for x in pool] if isinstance(pool, list) else None
        if pool_list:
            pool_list = [x for x in pool_list if x]
        pool_arg = pool_list if pool_list else None
        adaptive = bool(challenge.get("is_adaptive", True))
        res = await self._tests.start_test(
            student_name=challenge_attempt["student_username"],
            subject=sec.get("subject"),
            topic=sec.get("topic"),
            exam_tag=sec.get("exam_tag"),
            total_questions=int(sec["total_questions"]),
            time_limit_seconds=int(sec["time_limit_seconds"]),
            challenge_context=ctx,
            question_pool_ids=pool_arg,
            student_username=challenge_attempt["student_username"],
            adaptive_disabled=not adaptive,
        )
        meta = self._session_meta(challenge, ca_id, section_index)
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
            attempt_filters=res.attempt_filters,
        )

    async def start_challenge(self, challenge_id: str, student_username: str) -> TestStartResponse:
        from app.services.student_profile_service import StudentProfileService

        await AdminLimitsService().assert_student_can_start_attempt(student_username)
        await StudentProfileService().assert_not_blocked(student_username)
        challenge = await self._challenges.get_challenge(challenge_id)
        if not challenge:
            raise ValueError("Challenge not found")
        uname = student_username.strip()
        if not await self._student_has_access(challenge, uname):
            raise ValueError("You do not have access to this challenge")
        self._assert_live(challenge)

        existing = await self._challenges.find_challenge_attempt(challenge_id, uname)
        if existing and existing.get("status") in ("in_progress", "completed", "ended_early"):
            raise ValueError("You have already started this challenge. It cannot be restarted.")

        doc = {
            "challenge_id": challenge_id,
            "student_username": uname,
            "status": "in_progress",
            "current_section_index": 0,
            "section_attempt_ids": [],
            "section_results": [],
            "active_attempt_id": "",
        }
        caid = await self._challenges.insert_challenge_attempt(doc)
        c_att = await self._challenges.get_challenge_attempt(caid)
        assert c_att is not None

        start = await self._start_section_attempt(challenge, c_att, 0)
        await self._challenges.update_challenge_attempt(
            caid,
            {
                "active_attempt_id": start.attempt_id,
                "section_attempt_ids": [start.attempt_id],
                "current_section_index": 0,
            },
        )
        return start

    async def resume_challenge(self, challenge_id: str, student_username: str) -> TestStartResponse:
        from app.services.student_profile_service import StudentProfileService

        await StudentProfileService().assert_not_blocked(student_username)
        challenge = await self._challenges.get_challenge(challenge_id)
        if not challenge:
            raise ValueError("Challenge not found")
        uname = student_username.strip()
        if not await self._student_has_access(challenge, uname):
            raise ValueError("You do not have access to this challenge")
        self._assert_live(challenge)

        ca = await self._challenges.find_challenge_attempt(challenge_id, uname)
        if not ca or ca.get("status") != "in_progress":
            raise ValueError("No challenge session in progress to resume")
        ca_id = oid_str(ca["_id"])
        active = str(ca.get("active_attempt_id", "")).strip()
        if not active:
            raise ValueError("No active section")
        att = await self._tests._attempts.get(active)
        if not att or att.get("status") != AttemptStatus.IN_PROGRESS.value:
            raise ValueError("Your session could not be restored.")

        answered = int(att.get("questions_answered", 0))
        next_idx = answered + 1
        qi = await self._tests.get_question_at_index(active, next_idx)
        sec_idx = int(ca.get("current_section_index", 0))
        meta = self._session_meta(challenge, ca_id, sec_idx)
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
            attempt_filters=_attempt_filters_from_doc(att),
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
        ca_id = str(att_done.get("challenge_attempt_id", ""))
        challenge_attempt = await self._challenges.get_challenge_attempt(ca_id)
        if not challenge_attempt:
            raise ValueError("Challenge attempt not found")
        challenge = await self._challenges.get_challenge(challenge_attempt["challenge_id"])
        if not challenge:
            raise ValueError("Challenge not found")

        secs = _sorted_sections(challenge)
        sec_idx = int(att_done.get("challenge_section_index", 0))
        mpc = float(challenge.get("marks_per_correct", 1))
        mpi = float(challenge.get("marks_per_incorrect", 0))
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
        prev_results = list(challenge_attempt.get("section_results", []))
        prev_results.append(sec_result)
        await self._challenges.update_challenge_attempt(ca_id, {"section_results": prev_results})
        c_att = await self._challenges.get_challenge_attempt(ca_id)
        assert c_att is not None

        if sec_idx + 1 < len(secs):
            nxt = await self._start_section_attempt(challenge, c_att, sec_idx + 1)
            ids = list(c_att.get("section_attempt_ids", []))
            if nxt.attempt_id not in ids:
                ids.append(nxt.attempt_id)
            await self._challenges.update_challenge_attempt(
                ca_id,
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
        max_m = _max_marks(challenge, mpc)
        pct = (total_marks / max_m * 100.0) if max_m > 0 else 0.0
        pct = max(0.0, min(100.0, round(pct, 2)))

        await self._challenges.update_challenge_attempt(
            ca_id,
            {"status": "completed", "completed_at": utc_now(), "total_marks": total_marks},
        )

        pr = PaperResultSummary(
            paper_attempt_id=ca_id,
            paper_id=oid_str(challenge["_id"]),
            title=challenge["title"],
            student_name=challenge_attempt["student_username"],
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
            started_at=challenge_attempt["started_at"],
            completed_at=utc_now(),
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

    async def end_challenge_early(self, challenge_attempt_id: str, student_username: Optional[str] = None) -> PaperResultSummary:
        ca = await self._challenges.get_challenge_attempt(challenge_attempt_id)
        if not ca:
            raise ValueError("Challenge attempt not found")
        if student_username and ca.get("student_username") != student_username.strip():
            raise ValueError("Not found")
        if ca.get("status") != "in_progress":
            raise ValueError("Challenge is not in progress")

        challenge = await self._challenges.get_challenge(ca["challenge_id"])
        if not challenge:
            raise ValueError("Challenge not found")

        active = str(ca.get("active_attempt_id", ""))
        if active:
            att = await self._tests._attempts.get(active)
            if att and att.get("status") == "in_progress":
                await self._tests.end_test_early(active, allow_structured=True)
                att_done = await self._tests._attempts.get(active)
                if att_done:
                    secs = _sorted_sections(challenge)
                    sec_idx = int(att_done.get("challenge_section_index", 0))
                    mpc = float(challenge.get("marks_per_correct", 1))
                    mpi = float(challenge.get("marks_per_incorrect", 0))
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
                    prev = list(ca.get("section_results", []))
                    if not any(r.get("attempt_id") == active for r in prev):
                        prev.append(sec_result)
                    await self._challenges.update_challenge_attempt(challenge_attempt_id, {"section_results": prev})
                    ca = await self._challenges.get_challenge_attempt(challenge_attempt_id) or ca

        await self._challenges.update_challenge_attempt(
            challenge_attempt_id,
            {"status": "ended_early", "completed_at": utc_now()},
        )
        ca = await self._challenges.get_challenge_attempt(challenge_attempt_id) or ca
        challenge = await self._challenges.get_challenge(ca["challenge_id"]) or challenge
        return self._finalize_result(ca, challenge, ended_early=True)

    def _finalize_result(
        self, challenge_attempt: Dict[str, Any], challenge: Dict[str, Any], ended_early: bool
    ) -> PaperResultSummary:
        ca_id = oid_str(challenge_attempt["_id"])
        mpc = float(challenge.get("marks_per_correct", 1))
        max_m = _max_marks(challenge, mpc)
        prev_results = list(challenge_attempt.get("section_results", []))
        total_marks = sum(float(r["marks"]) for r in prev_results)
        pct = (total_marks / max_m * 100.0) if max_m > 0 else 0.0
        pct = max(0.0, min(100.0, round(pct, 2)))
        return PaperResultSummary(
            paper_attempt_id=ca_id,
            paper_id=oid_str(challenge["_id"]),
            title=challenge["title"],
            student_name=challenge_attempt["student_username"],
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
            started_at=challenge_attempt["started_at"],
            completed_at=utc_now(),
            ended_early=ended_early,
        )

    async def timeout_current_section(
        self, challenge_attempt_id: str, student_username: Optional[str] = None
    ) -> SubmitAnswerResponse:
        ca = await self._challenges.get_challenge_attempt(challenge_attempt_id)
        if not ca:
            raise ValueError("Challenge attempt not found")
        if student_username and ca.get("student_username") != student_username.strip():
            raise ValueError("Not found")
        if ca.get("status") != "in_progress":
            raise ValueError("Challenge is not in progress")

        challenge = await self._challenges.get_challenge(ca["challenge_id"])
        if not challenge:
            raise ValueError("Challenge not found")

        active = str(ca.get("active_attempt_id", ""))
        if not active:
            raise ValueError("No active section")

        await self._tests.force_complete_attempt_timeout(active)
        att_done = await self._tests._attempts.get(active)
        if not att_done:
            raise ValueError("Attempt missing")

        secs = _sorted_sections(challenge)
        sec_idx = int(att_done.get("challenge_section_index", 0))
        mpc = float(challenge.get("marks_per_correct", 1))
        mpi = float(challenge.get("marks_per_incorrect", 0))
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
        prev = list(ca.get("section_results", []))
        prev.append(sec_result)
        await self._challenges.update_challenge_attempt(challenge_attempt_id, {"section_results": prev})
        ca = await self._challenges.get_challenge_attempt(challenge_attempt_id)
        assert ca is not None

        if sec_idx + 1 < len(secs):
            nxt = await self._start_section_attempt(challenge, ca, sec_idx + 1)
            await self._challenges.update_challenge_attempt(
                challenge_attempt_id,
                {
                    "current_section_index": sec_idx + 1,
                    "active_attempt_id": nxt.attempt_id,
                    "section_attempt_ids": list(ca.get("section_attempt_ids", [])) + [nxt.attempt_id],
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
        await self._challenges.update_challenge_attempt(
            challenge_attempt_id,
            {"status": "completed", "completed_at": utc_now(), "total_marks": total_marks},
        )
        ca = await self._challenges.get_challenge_attempt(challenge_attempt_id) or ca
        pr = self._finalize_result(ca, challenge, ended_early=False)
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

    async def _challenge_participants(self, challenge_id: str) -> Tuple[int, int, List[ChallengeParticipantBrief]]:
        attempts = await self._challenges.list_attempts_for_challenge(challenge_id)
        ranked = await self._challenges.list_ranked_attempts_for_challenge(challenge_id)
        usernames = [str(a["student_username"]) for a in attempts if a.get("student_username")]
        profiles = await PublicProfileService().brief_for_usernames(usernames)
        participants: List[ChallengeParticipantBrief] = []
        for att in attempts:
            un = str(att.get("student_username", "")).strip()
            if not un:
                continue
            meta = profiles.get(un, {"profile_slug": un, "display_name": un})
            participants.append(
                ChallengeParticipantBrief(
                    profile_slug=meta["profile_slug"],
                    display_name=meta["display_name"],
                    completed=att.get("status") in ("completed", "ended_early"),
                )
            )
        return len(attempts), len(ranked), participants

    async def list_catalog(self, student_username: Optional[str] = None) -> List[ChallengeCatalogItem]:
        rows = await self._challenges.list_challenges()
        out: List[ChallengeCatalogItem] = []
        uname = student_username.strip() if student_username else None
        for doc in rows:
            cid = oid_str(doc["_id"])
            status, until_launch, until_end = _window_status(doc["launch_at"], doc["end_at"])
            has_access = False
            has_started = False
            completed = False
            attempt_id: Optional[str] = None
            my_percentile: Optional[float] = None
            if uname:
                has_access = await self._student_has_access(doc, uname)
                ca = await self._challenges.find_challenge_attempt(cid, uname)
                if ca:
                    has_started = True
                    completed = ca.get("status") in ("completed", "ended_early")
                    if ca.get("status") == "in_progress":
                        attempt_id = oid_str(ca["_id"])
            p_count, ranked_count, participants = await self._challenge_participants(cid)
            if uname and completed:
                ranked = await self._challenges.list_ranked_attempts_for_challenge(cid)
                my_percentile = _percentile_among_ranked(uname, ranked)
            secs = _sorted_sections(doc)
            out.append(
                ChallengeCatalogItem(
                    challenge_id=cid,
                    title=doc["title"],
                    description=str(doc.get("description") or ""),
                    level=str(doc.get("level") or "INTERMEDIATE"),
                    is_adaptive=bool(doc.get("is_adaptive", True)),
                    launch_at=ensure_utc(doc["launch_at"]),
                    end_at=ensure_utc(doc["end_at"]),
                    open_to_all=bool(doc.get("open_to_all", False)),
                    section_count=len(secs),
                    marks_per_correct=float(doc.get("marks_per_correct", 1)),
                    marks_per_incorrect=float(doc.get("marks_per_incorrect", 0)),
                    status=status,
                    seconds_until_launch=until_launch,
                    seconds_until_end=until_end,
                    has_access=has_access,
                    has_started=has_started,
                    completed=completed,
                    challenge_attempt_id=attempt_id,
                    participants_count=p_count,
                    ranked_count=ranked_count,
                    my_percentile=my_percentile,
                    participants=participants,
                )
            )
        return out
