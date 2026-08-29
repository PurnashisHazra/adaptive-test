from collections import defaultdict
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
    ChallengeCatalogPage,
    ChallengeCreate,
    ChallengeOut,
    ChallengeParticipantBrief,
    ChallengeParticipantsPage,
    ChallengeUpdate,
    TodaysTopperOut,
    TodaysTopperResponse,
)
from app.utils.cohort_percentile import percentile_among_ranked_attempts
from app.utils.guest import GUEST_EMAIL_REQUIRED, is_guest_username
from app.schemas.auth import AuthResponse, SignupRequest
from app.services.auth_service import AuthService
from app.services.public_profile_service import PublicProfileService
from app.schemas.challenge import ChallengeKnowledgeGapItem, ChallengeRecapResponse
from app.schemas.student_analytics import StudentPerformanceInsights, StudentQuestionReview
from app.services.student_analytics_service import StudentAnalyticsService
from app.schemas.paper import (
    PaperResultSummary,
    PaperSectionOut,
    PaperSectionResultItem,
    PaperSessionMeta,
)
from app.services.admin_limits_service import AdminLimitsService
from app.services.cohort_percentile_service import CohortPercentileService
from app.services.test_service import TestService, _attempt_filters_from_doc
from app.utils.ids import oid_str


def _as_utc_storage(dt: datetime) -> datetime:
    return ensure_utc(dt)


def _sorted_sections(challenge: Dict[str, Any]) -> List[Dict[str, Any]]:
    return sorted(challenge.get("sections", []), key=lambda s: int(s.get("order", 0)))


from app.utils.attempt_scoring import (
    marks_for_section,
    max_marks_from_section_results,
    percentage_from_marks,
    section_answer_rows,
)


def _max_marks(challenge: Dict[str, Any], mpc: float) -> float:
    return sum(int(s.get("total_questions", 0)) for s in _sorted_sections(challenge)) * mpc


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

    async def todays_topper(self) -> TodaysTopperResponse:
        latest = await self._challenges.find_latest_completed_attempt()
        if not latest:
            return TodaysTopperResponse(topper=None)
        cid = str(latest.get("challenge_id") or "").strip()
        rows = await self._challenges.find_top_completed_for_challenge(cid, limit=16)
        preferred = [r for r in rows if not is_guest_username(str(r.get("student_username") or ""))]
        candidates = preferred or rows
        for att in candidates:
            uname = str(att.get("student_username") or "").strip()
            if not uname or not cid:
                continue
            challenge = await self._challenges.get_challenge(cid)
            if not challenge:
                continue
            mpc = float(challenge.get("marks_per_correct", 1))
            max_m = _max_marks(challenge, mpc)
            total_marks = float(att.get("total_marks") or 0)
            pct = percentage_from_marks(total_marks, max_m)
            try:
                profile = await PublicProfileService().ensure_for_student(uname)
                slug = profile.profile_slug
                display = profile.display_name or self._display_name(att)
            except ValueError:
                slug = uname
                display = self._display_name(att)
            return TodaysTopperResponse(
                topper=TodaysTopperOut(
                    display_name=display,
                    profile_slug=slug,
                    percentage=pct,
                    total_marks=round(total_marks, 2),
                    max_marks=round(max_m, 2),
                    challenge_id=cid,
                    challenge_title=str(challenge.get("title") or "Challenge"),
                )
            )
        return TodaysTopperResponse(topper=None)

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
            student_name=self._display_name(challenge_attempt),
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
            adaptive_disabled=res.adaptive_disabled,
            answered_indices=list(res.answered_indices or []),
            paper=meta,
            attempt_filters=res.attempt_filters,
        )

    def _display_name(self, challenge_attempt: Dict[str, Any]) -> str:
        dn = str(challenge_attempt.get("display_name") or "").strip()
        if dn:
            return dn
        return str(challenge_attempt.get("student_username", ""))

    async def _assert_attempt_owner(self, ca: Dict[str, Any], student_username: str) -> None:
        if str(ca.get("student_username", "")).strip() != student_username.strip():
            raise ValueError("Not found")

    def _build_knowledge_gaps(
        self,
        reviews: List[Any],
        insights: Any,
    ) -> List[ChallengeKnowledgeGapItem]:
        """Aggregate insight themes (not per-question blunders) for challenge recap."""
        from app.schemas.student_analytics import StudentPerformanceInsights, StudentQuestionReview

        gaps: List[ChallengeKnowledgeGapItem] = []
        if not isinstance(insights, StudentPerformanceInsights):
            return gaps

        for w in insights.weak_areas:
            gaps.append(
                ChallengeKnowledgeGapItem(
                    title=f"{w.name} difficulty",
                    detail=(
                        f"Accuracy was {w.accuracy_percent:.0f}% across {w.attempts} "
                        f"question{'s' if w.attempts != 1 else ''} at this level — revise fundamentals here first."
                    ),
                    metric=f"{w.accuracy_percent:.0f}%",
                    tone="warn",
                )
            )

        capsule_counts: Dict[str, int] = defaultdict(int)
        for r in reviews:
            if not isinstance(r, StudentQuestionReview):
                continue
            for c in r.insight_capsules:
                capsule_counts[str(c.key)] += 1

        if capsule_counts.get("missed_opportunity", 0) > 0:
            n = capsule_counts["missed_opportunity"]
            gaps.append(
                ChallengeKnowledgeGapItem(
                    title="Missed opportunity",
                    detail="Questions where peers usually convert but you did not — concept refresh and option elimination drills help most.",
                    metric=str(n),
                    tone="warn",
                )
            )
        if capsule_counts.get("wasted_time", 0) > 0:
            n = capsule_counts["wasted_time"]
            gaps.append(
                ChallengeKnowledgeGapItem(
                    title="Wasted time",
                    detail="Items where you spent notably more time than your own average without a correct payoff — cap time and revisit later.",
                    metric=str(n),
                    tone="time",
                )
            )
        if capsule_counts.get("skip_revisit", 0) > 0:
            n = capsule_counts["skip_revisit"]
            gaps.append(
                ChallengeKnowledgeGapItem(
                    title="Skip & revisit",
                    detail="Hard items where marking and returning after easier marks may recover score — use a strict two-pass rule.",
                    metric=str(n),
                    tone="accent",
                )
            )

        topic_stats: Dict[str, Dict[str, int]] = defaultdict(lambda: {"total": 0, "wrong": 0})
        for r in reviews:
            if not isinstance(r, StudentQuestionReview):
                continue
            topic = str(r.topic_when_served or "").strip() or "General"
            topic_stats[topic]["total"] += 1
            if not r.is_correct:
                topic_stats[topic]["wrong"] += 1

        topic_rows = sorted(
            ((t, s["total"], s["wrong"]) for t, s in topic_stats.items() if s["wrong"] > 0),
            key=lambda x: (-x[2], x[0]),
        )
        for topic, total, wrong in topic_rows[:4]:
            acc = ((total - wrong) / total * 100.0) if total else 0.0
            if wrong >= 2 or acc < 50.0:
                gaps.append(
                    ChallengeKnowledgeGapItem(
                        title=f"Topic: {topic}",
                        detail=f"{wrong} of {total} wrong in this topic ({acc:.0f}% accuracy) — targeted revision recommended.",
                        metric=f"{acc:.0f}%",
                        tone="warn" if acc < 50 else "neutral",
                    )
                )

        for tip in insights.recommendations[:3]:
            gaps.append(
                ChallengeKnowledgeGapItem(
                    title=tip.title,
                    detail=tip.detail,
                    tone="accent",
                )
            )

        if not gaps and insights.attempted_questions > 0:
            for s in insights.strong_areas[:2]:
                gaps.append(
                    ChallengeKnowledgeGapItem(
                        title=f"Strength: {s.name}",
                        detail=f"Solid {s.accuracy_percent:.0f}% accuracy over {s.attempts} questions — keep this band in your exam plan.",
                        metric=f"{s.accuracy_percent:.0f}%",
                        tone="accent",
                    )
                )

        return gaps[:10]

    async def start_challenge(
        self,
        challenge_id: str,
        student_username: str,
        *,
        display_name: Optional[str] = None,
    ) -> TestStartResponse:
        uname = student_username.strip()
        if not is_guest_username(uname):
            from app.services.student_profile_service import StudentProfileService

            await AdminLimitsService().assert_student_can_start_attempt(uname)
            await StudentProfileService().assert_not_blocked(uname)
        challenge = await self._challenges.get_challenge(challenge_id)
        if not challenge:
            raise ValueError("Challenge not found")
        if is_guest_username(uname) and not bool(challenge.get("open_to_all", False)):
            raise ValueError("This challenge requires an account. Sign in to enter.")
        if not await self._student_has_access(challenge, uname):
            raise ValueError("You do not have access to this challenge")
        self._assert_live(challenge)

        existing = await self._challenges.find_challenge_attempt(challenge_id, uname)
        if existing and existing.get("status") in ("in_progress", "completed", "ended_early"):
            raise ValueError("You have already started this challenge. It cannot be restarted.")

        guest_label = str(display_name or "").strip()[:120] if is_guest_username(uname) else ""
        doc = {
            "challenge_id": challenge_id,
            "student_username": uname,
            "display_name": guest_label,
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

        from app.services.test_service import _resume_question_index

        next_idx = _resume_question_index(att)
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
            adaptive_disabled=qi.adaptive_disabled,
            answered_indices=list(qi.answered_indices or []),
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
        section_total = int(secs[sec_idx]["total_questions"])
        answers = list(att_done.get("answers", []))
        marks, correct, wrong, not_attempted = marks_for_section(answers, section_total, mpc, mpi)

        sec_result = {
            "section_index": sec_idx,
            "section_title": secs[sec_idx]["title"],
            "attempt_id": attempt_id,
            "marks": marks,
            "correct": correct,
            "wrong": wrong,
            "not_attempted": not_attempted,
            "total_questions": section_total,
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
                adaptive_disabled=nxt.adaptive_disabled,
                answered_indices=list(nxt.answered_indices or []),
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

        c_att = await self._challenges.get_challenge_attempt(ca_id) or c_att
        pr = await self._finalize_result(c_att, challenge, ended_early=False)

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
                    section_total = int(secs[sec_idx]["total_questions"])
                    answers = list(att_done.get("answers", []))
                    marks, correct, wrong, not_attempted = marks_for_section(
                        answers, section_total, mpc, mpi
                    )
                    sec_result = {
                        "section_index": sec_idx,
                        "section_title": secs[sec_idx]["title"],
                        "attempt_id": active,
                        "marks": marks,
                        "correct": correct,
                        "wrong": wrong,
                        "not_attempted": not_attempted,
                        "total_questions": section_total,
                    }
                    prev = list(ca.get("section_results", []))
                    if not any(r.get("attempt_id") == active for r in prev):
                        prev.append(sec_result)
                    await self._challenges.update_challenge_attempt(challenge_attempt_id, {"section_results": prev})
                    ca = await self._challenges.get_challenge_attempt(challenge_attempt_id) or ca

        ca = await self._challenges.get_challenge_attempt(challenge_attempt_id) or ca
        challenge = await self._challenges.get_challenge(ca["challenge_id"]) or challenge
        return await self._finalize_result(ca, challenge, ended_early=True)

    async def _finalize_result(
        self, challenge_attempt: Dict[str, Any], challenge: Dict[str, Any], ended_early: bool
    ) -> PaperResultSummary:
        ca_id = oid_str(challenge_attempt["_id"])
        cid = oid_str(challenge["_id"])
        mpc = float(challenge.get("marks_per_correct", 1))
        full_max = _max_marks(challenge, mpc)
        prev_results = list(challenge_attempt.get("section_results", []))
        total_marks = sum(float(r["marks"]) for r in prev_results)
        max_m = max_marks_from_section_results(prev_results, mpc, ended_early=ended_early, full_max=full_max)
        pct = percentage_from_marks(total_marks, max_m)
        status_val = "ended_early" if ended_early else "completed"
        await self._challenges.update_challenge_attempt(
            ca_id,
            {
                "status": status_val,
                "completed_at": utc_now(),
                "total_marks": round(total_marks, 4),
            },
        )
        ch_status, _, _ = _window_status(challenge["launch_at"], challenge["end_at"])
        cohort = await CohortPercentileService().for_challenge(
            cid,
            str(challenge_attempt["student_username"]),
            challenge_ended=ch_status == "ended",
        )
        if is_guest_username(str(challenge_attempt.get("student_username", ""))) and not str(
            challenge_attempt.get("guest_email") or ""
        ).strip():
            cohort = {"cohort_percentile": None, "cohort_size": 0, "percentile_is_final": False}
        return PaperResultSummary(
            paper_attempt_id=ca_id,
            paper_id=cid,
            title=challenge["title"],
            student_name=self._display_name(challenge_attempt),
            total_marks=round(total_marks, 4),
            max_marks=round(max_m, 4),
            percentage=pct,
            sections=[
                PaperSectionResultItem(
                    section_title=str(r["section_title"]),
                    total_questions=int(r["total_questions"]),
                    correct=int(r["correct"]),
                    wrong=int(r["wrong"]),
                    not_attempted=int(r.get("not_attempted", 0)),
                    marks=round(float(r["marks"]), 4),
                )
                for r in prev_results
            ],
            started_at=challenge_attempt["started_at"],
            completed_at=utc_now(),
            ended_early=ended_early,
            **cohort,
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
        section_total = int(secs[sec_idx]["total_questions"])
        answers = list(att_done.get("answers", []))
        marks, correct, wrong, not_attempted = marks_for_section(answers, section_total, mpc, mpi)

        sec_result = {
            "section_index": sec_idx,
            "section_title": secs[sec_idx]["title"],
            "attempt_id": active,
            "marks": marks,
            "correct": correct,
            "wrong": wrong,
            "not_attempted": not_attempted,
            "total_questions": section_total,
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
                adaptive_disabled=nxt.adaptive_disabled,
                answered_indices=list(nxt.answered_indices or []),
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

        ca = await self._challenges.get_challenge_attempt(challenge_attempt_id) or ca
        pr = await self._finalize_result(ca, challenge, ended_early=False)
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

    PREVIEW_PARTICIPANTS_LIMIT = 8

    async def _participant_briefs_for_challenges(
        self,
        challenge_ids: List[str],
        *,
        limit_per: int = PREVIEW_PARTICIPANTS_LIMIT,
    ) -> Dict[str, List[ChallengeParticipantBrief]]:
        previews = await self._challenges.participant_previews_for_challenges(
            challenge_ids, limit_per=limit_per
        )
        usernames: List[str] = []
        for rows in previews.values():
            for row in rows:
                u = str(row.get("student_username", "")).strip()
                if u:
                    usernames.append(u)
        profiles = await PublicProfileService().brief_for_usernames(
            list(dict.fromkeys(usernames))
        )
        out: Dict[str, List[ChallengeParticipantBrief]] = {}
        for cid in challenge_ids:
            briefs: List[ChallengeParticipantBrief] = []
            for row in previews.get(cid, []):
                u = str(row.get("student_username", "")).strip()
                if not u:
                    continue
                meta = profiles.get(u, {"profile_slug": u, "display_name": u})
                briefs.append(
                    ChallengeParticipantBrief(
                        profile_slug=meta["profile_slug"],
                        display_name=meta["display_name"],
                        completed=bool(row.get("completed")),
                    )
                )
            out[cid] = briefs
        return out

    async def list_challenge_participants(
        self,
        challenge_id: str,
        *,
        page: int = 1,
        page_size: int = 20,
    ) -> ChallengeParticipantsPage:
        got = await self._challenges.get_challenge(challenge_id)
        if not got:
            raise ValueError("Challenge not found")
        page = max(1, int(page))
        page_size = max(1, min(100, int(page_size)))
        skip = (page - 1) * page_size
        rows, total = await self._challenges.list_attempt_usernames_paginated(
            challenge_id, skip=skip, limit=page_size
        )
        total_pages = max(0, (total + page_size - 1) // page_size) if total else 0
        usernames = [str(r.get("student_username", "")).strip() for r in rows if r.get("student_username")]
        profiles = await PublicProfileService().brief_for_usernames(usernames)
        participants: List[ChallengeParticipantBrief] = []
        for row in rows:
            u = str(row.get("student_username", "")).strip()
            if not u:
                continue
            meta = profiles.get(u, {"profile_slug": u, "display_name": u})
            participants.append(
                ChallengeParticipantBrief(
                    profile_slug=meta["profile_slug"],
                    display_name=meta["display_name"],
                    completed=row.get("status") in ("completed", "ended_early"),
                )
            )
        return ChallengeParticipantsPage(
            challenge_id=challenge_id,
            participants=participants,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )

    async def list_catalog(
        self,
        student_username: Optional[str] = None,
        *,
        page: int = 1,
        page_size: int = 3,
    ) -> ChallengeCatalogPage:
        """Paginated catalog (newest challenge first) with batched DB reads."""
        page = max(1, int(page))
        page_size = max(1, min(50, int(page_size)))
        total = await self._challenges.count_challenges()
        total_pages = max(0, (total + page_size - 1) // page_size) if total else 0
        if total == 0:
            return ChallengeCatalogPage(
                items=[],
                total=0,
                page=page,
                page_size=page_size,
                total_pages=0,
            )

        skip = (page - 1) * page_size
        all_rows = await self._challenges.list_all_challenges()
        order_map = {"live": 0, "upcoming": 1, "ended": 2}

        def _catalog_sort_key(doc: Dict[str, Any]) -> tuple:
            status, _, _ = _window_status(doc["launch_at"], doc["end_at"])
            created = doc.get("created_at")
            ts = created.timestamp() if created is not None and hasattr(created, "timestamp") else 0.0
            return (order_map.get(status, 9), -ts)

        all_rows.sort(key=_catalog_sort_key)
        rows = all_rows[skip : skip + page_size]
        uname = student_username.strip() if student_username else None

        cids = [oid_str(doc["_id"]) for doc in rows]
        stats = await self._challenges.aggregate_attempt_counts(cids)
        preview_limit = self.PREVIEW_PARTICIPANTS_LIMIT
        participant_previews = await self._participant_briefs_for_challenges(
            cids, limit_per=preview_limit
        )
        assigned_ids: set[str] = set()
        attempts_by_cid: Dict[str, Dict[str, Any]] = {}
        ranked_by_cid: Dict[str, List[Dict[str, Any]]] = {}
        if uname:
            assigned_ids = set(await self._challenges.list_assigned_challenge_ids(uname))
            attempts_by_cid = await self._challenges.find_attempts_for_student_on_challenges(uname, cids)
            completed_cids = [
                cid
                for cid, att in attempts_by_cid.items()
                if att.get("status") in ("completed", "ended_early") and att.get("total_marks") is not None
            ]
            if completed_cids:
                ranked_by_cid = await self._challenges.list_ranked_attempts_for_challenges(completed_cids)

        out: List[ChallengeCatalogItem] = []
        for doc in rows:
            cid = oid_str(doc["_id"])
            status, until_launch, until_end = _window_status(doc["launch_at"], doc["end_at"])
            open_to_all = bool(doc.get("open_to_all", False))
            if uname and is_guest_username(uname):
                has_access = open_to_all
            elif uname:
                has_access = open_to_all or cid in assigned_ids
            else:
                has_access = open_to_all
            ca = attempts_by_cid.get(cid) if uname else None
            has_started = ca is not None
            completed = bool(
                ca and ca.get("status") in ("completed", "ended_early")
            )
            attempt_id: Optional[str] = None
            if ca and ca.get("status") == "in_progress":
                attempt_id = oid_str(ca["_id"])

            st = stats.get(cid, {})
            p_count = int(st.get("participants_count", 0))
            ranked_count = int(st.get("ranked_count", 0))

            my_percentile: Optional[float] = None
            my_final_percentile: Optional[float] = None
            if uname and completed and ca and ca.get("total_marks") is not None:
                ranked = ranked_by_cid.get(cid, [])
                my_percentile, ranked_count = percentile_among_ranked_attempts(uname, ranked)
                if status == "ended":
                    my_final_percentile = my_percentile

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
                    open_to_all=open_to_all,
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
                    my_final_percentile=my_final_percentile,
                    participants=participant_previews.get(cid, []),
                    participants_preview_limit=preview_limit,
                )
            )

        return ChallengeCatalogPage(
            items=out,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )

    async def submit_guest_signup(
        self,
        challenge_attempt_id: str,
        guest_username: str,
        email: str,
        password: str,
    ) -> AuthResponse:
        ca = await self._challenges.get_challenge_attempt(challenge_attempt_id)
        if not ca:
            raise ValueError("Not found")
        await self._assert_attempt_owner(ca, guest_username)
        if not is_guest_username(guest_username):
            raise ValueError("Not a guest attempt")
        if ca.get("status") not in ("completed", "ended_early"):
            raise ValueError("Challenge attempt is not finished yet")

        normalized = (email or "").strip().lower()
        if not normalized or "@" not in normalized or len(normalized) > 320:
            raise ValueError("Invalid email address")
        if len((password or "").strip()) < 8:
            raise ValueError("Password must be at least 8 characters")

        auth = AuthService()
        auth_res = await auth.signup(
            SignupRequest(username=normalized, password=password.strip()),
        )

        display = normalized.split("@")[0][:120] or normalized[:120]
        patch: Dict[str, Any] = {
            "student_username": normalized,
            "guest_email": normalized,
            "guest_email_at": utc_now(),
            "display_name": display,
            "migrated_from_guest": guest_username.strip(),
        }
        await self._challenges.update_challenge_attempt(challenge_attempt_id, patch)

        for attempt_id in list(ca.get("section_attempt_ids") or []):
            aid = str(attempt_id).strip()
            if not aid:
                continue
            await self._tests._attempts.update(
                aid,
                {"student_username": normalized, "student_name": display},
            )

        return auth_res

    async def get_challenge_recap(self, challenge_attempt_id: str, student_username: str) -> ChallengeRecapResponse:
        ca = await self._challenges.get_challenge_attempt(challenge_attempt_id)
        if not ca:
            raise ValueError("Not found")
        await self._assert_attempt_owner(ca, student_username)

        if ca.get("status") not in ("completed", "ended_early"):
            raise ValueError("Challenge attempt is not finished yet")

        if is_guest_username(student_username) and not str(ca.get("guest_email") or "").strip():
            raise ValueError(GUEST_EMAIL_REQUIRED)

        challenge = await self._challenges.get_challenge(str(ca["challenge_id"]))
        if not challenge:
            raise ValueError("Challenge not found")

        analytics = StudentAnalyticsService()
        all_reviews: List[StudentQuestionReview] = []
        idx = 0
        secs = _sorted_sections(challenge)
        for attempt_id in list(ca.get("section_attempt_ids") or []):
            att = await self._tests._attempts.get(str(attempt_id))
            if not att:
                continue
            answers = list(att.get("answers") or [])
            sec_idx = int(att.get("challenge_section_index", 0))
            section_total = int(secs[sec_idx]["total_questions"]) if 0 <= sec_idx < len(secs) else len(answers)
            answer_rows = section_answer_rows(att, section_total)
            chunk = await analytics._reviews_from_answers(answer_rows, str(attempt_id), index_offset=idx)
            all_reviews.extend(chunk)
            idx += len(answer_rows)

        if all_reviews:
            qids = [r.question_id for r in all_reviews if r.question_id != "unknown"]
            rows = await analytics._attempts.list_answer_slices_for_questions(qids)
            analytics._apply_peer_stats(all_reviews, rows)
            analytics._apply_question_insight_capsules(all_reviews)

        ended_early = ca.get("status") == "ended_early"
        insights = analytics._build_performance_insights(all_reviews, ended_early=ended_early)
        knowledge_gaps = self._build_knowledge_gaps(all_reviews, insights)

        ca_id = oid_str(ca["_id"])
        cid = oid_str(challenge["_id"])
        mpc = float(challenge.get("marks_per_correct", 1))
        full_max = _max_marks(challenge, mpc)
        prev_results = list(ca.get("section_results", []))
        total_marks = float(ca.get("total_marks") or sum(float(r["marks"]) for r in prev_results))
        max_m = max_marks_from_section_results(prev_results, mpc, ended_early=ended_early, full_max=full_max)
        pct = percentage_from_marks(total_marks, max_m)
        ch_status, _, _ = _window_status(challenge["launch_at"], challenge["end_at"])
        cohort = await CohortPercentileService().for_challenge(
            cid,
            str(ca["student_username"]),
            challenge_ended=ch_status == "ended",
        )
        paper_summary = PaperResultSummary(
            paper_attempt_id=ca_id,
            paper_id=cid,
            title=challenge["title"],
            student_name=self._display_name(ca),
            total_marks=round(total_marks, 4),
            max_marks=round(max_m, 4),
            percentage=pct,
            sections=[
                PaperSectionResultItem(
                    section_title=str(r["section_title"]),
                    total_questions=int(r["total_questions"]),
                    correct=int(r["correct"]),
                    wrong=int(r["wrong"]),
                    not_attempted=int(r.get("not_attempted", 0)),
                    marks=round(float(r["marks"]), 4),
                )
                for r in prev_results
            ],
            started_at=ca["started_at"],
            completed_at=ca.get("completed_at") or utc_now(),
            ended_early=ended_early,
            **cohort,
        )
        return ChallengeRecapResponse(
            paper_summary=paper_summary,
            insights=insights,
            questions=all_reviews,
            knowledge_gaps=knowledge_gaps,
        )
