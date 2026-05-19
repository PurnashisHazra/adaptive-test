from typing import Any, Dict, List, Optional, Type

from app.repositories.attempt_repository import AttemptRepository
from app.repositories.student_coach_plan_repository import StudentCoachPlanRepository
from app.repositories.student_profile_repository import StudentProfileRepository
from app.repositories.user_repository import UserRepository
from app.schemas.admin_student_report import (
    AdminStudentReportCardDetail,
    AdminStudentReportCardSummary,
    AdminStudentReportCardsResponse,
    AdminStudentReportLatestAttempt,
    AdminStudentReportPdfBundle,
    LiveCoachStatus,
)
from app.schemas.student_analytics import (
    StudentAttemptAccuracyImprovementResponse,
    StudentAttemptTimeStrategyResponse,
)
from app.services.strategy_adherence import score_strategy_follow
from app.services.student_analytics_service import StudentAnalyticsService
from app.services.student_profile_service import StudentProfileService
class AdminStudentReportService:
    def __init__(self) -> None:
        self._profiles = StudentProfileService()
        self._users = UserRepository()
        self._student_profiles = StudentProfileRepository()
        self._analytics = StudentAnalyticsService()
        self._attempts = AttemptRepository()
        self._coach_plans = StudentCoachPlanRepository()

    async def _coach_hints_total(self, student_username: str) -> int:
        atts = await self._attempts.list_trend_attempts_for_student(student_username, limit=500)
        total = 0
        for att in atts:
            total += int(att.get("coach_explanation_hints_count") or 0)
            if not att.get("coach_explanation_hints_count"):
                qids = att.get("coach_explanation_question_ids")
                if isinstance(qids, list):
                    total += len(qids)
        return total

    async def _live_coach_status(self, student_username: str, hints_total: int) -> tuple[LiveCoachStatus, bool, str]:
        has_plan = await self._coach_plans.student_has_any_plan(student_username)
        if hints_total > 0:
            return (
                "active",
                has_plan,
                f"Used live explanation coach on {hints_total} question(s) across recent attempts.",
            )
        if has_plan:
            return (
                "plan_ready",
                True,
                "A saved time/accuracy coach plan exists; student can see live coach nudges during tests.",
            )
        return (
            "inactive",
            False,
            "No coach plan saved yet — student has not run time or accuracy coach on past attempts.",
        )

    async def _build_summary(self, student_username: str, display_name: Optional[str], blocked: bool) -> AdminStudentReportCardSummary:
        uname = student_username.strip()
        trends = await self._analytics.learning_trends(uname)
        overall = await self._analytics.overall_analytics(uname)
        hints_total = await self._coach_hints_total(uname)
        live_status, has_plan, _live_note = await self._live_coach_status(uname, hints_total)

        latest_meta: Optional[AdminStudentReportLatestAttempt] = None
        strategy_status = "insufficient_data"
        strategy_percent: Optional[float] = None

        standalone_points = [p for p in trends.points if p.session_kind == "standalone"]
        if standalone_points:
            latest_pt = max(standalone_points, key=lambda p: p.started_at)
            try:
                detail = await self._analytics.standalone_detail(uname, latest_pt.attempt_id)
                st, pct, _, actual_acc, strat_acc, lift = score_strategy_follow(detail.questions, overall)
                strategy_status = st  # type: ignore[assignment]
                strategy_percent = pct
                latest_meta = AdminStudentReportLatestAttempt(
                    attempt_id=detail.attempt_id,
                    title=detail.title,
                    started_at=detail.started_at,
                    score=detail.score,
                    total_questions=detail.total_questions,
                    accuracy_percent=round(100.0 * detail.score / max(1, detail.total_questions), 1),
                    actual_running_accuracy_percent=actual_acc,
                    strategy_running_accuracy_percent=strat_acc,
                    accuracy_lift_points=lift,
                    wasted_time_flags=sum(
                        1 for q in detail.questions if any(c.key == "wasted_time" for c in (q.insight_capsules or []))
                    ),
                    missed_opportunity_flags=sum(
                        1
                        for q in detail.questions
                        if any(c.key == "missed_opportunity" for c in (q.insight_capsules or []))
                    ),
                )
            except ValueError:
                pass

        avg_acc: Optional[float] = None
        if trends.points:
            accs = [float(p.accuracy_percent) for p in trends.points]
            avg_acc = round(sum(accs) / len(accs), 1)

        return AdminStudentReportCardSummary(
            student_username=uname,
            display_name=display_name,
            blocked=blocked,
            attempts_considered=overall.attempts_considered,
            tests_taken=len(trends.points),
            average_accuracy_percent=avg_acc,
            strategy_follow_status=strategy_status,  # type: ignore[arg-type]
            strategy_follow_percent=strategy_percent,
            live_coach_status=live_status,
            has_coach_plan=has_plan,
            coach_explanation_hints_total=hints_total,
            latest_attempt=latest_meta,
            strategy_preview=list(overall.strategy_to_desired_state[:4]),
        )

    async def list_report_cards(self, admin_username: str) -> AdminStudentReportCardsResponse:
        students = await self._profiles.list_students_admin(admin_username)
        profiles = {p["student_username"]: p for p in await self._student_profiles.list_all()}
        cards: List[AdminStudentReportCardSummary] = []
        for s in students:
            doc = profiles.get(s.student_username) or {}
            cards.append(
                await self._build_summary(
                    s.student_username,
                    doc.get("display_name") or s.display_name,
                    bool(doc.get("blocked", s.blocked)),
                )
            )
        cards.sort(key=lambda c: (c.display_name or c.student_username).lower())
        return AdminStudentReportCardsResponse(students=cards)

    async def get_report_card(self, admin_username: str, student_username: str) -> AdminStudentReportCardDetail:
        admin_code = await self._profiles._admin_code_for(admin_username)  # noqa: SLF001
        if not admin_code:
            raise ValueError("Your admin account has no admin code yet. Ask a super admin to assign one.")
        uname = student_username.strip()
        if not await self._profiles._student_belongs_to_admin(uname, admin_code):  # noqa: SLF001
            raise ValueError("Student not found")

        user = await self._users.get_by_username(uname)
        if not user:
            raise ValueError("Student not found")
        doc = await self._profiles.get_or_create_doc(uname)
        summary = await self._build_summary(uname, doc.get("display_name"), bool(doc.get("blocked")))

        overall = await self._analytics.overall_analytics(uname)
        latest_detail = None
        strategy_note = ""
        if summary.latest_attempt:
            try:
                latest_detail = await self._analytics.standalone_detail(uname, summary.latest_attempt.attempt_id)
                _, _, strategy_note, _, _, _ = score_strategy_follow(latest_detail.questions, overall)
            except ValueError:
                pass

        hints_total = summary.coach_explanation_hints_total
        _, _, live_note = await self._live_coach_status(uname, hints_total)

        return AdminStudentReportCardDetail(
            **summary.model_dump(),
            overall=overall,
            latest_attempt_detail=latest_detail,
            strategy_follow_note=strategy_note,
            live_coach_note=live_note,
        )

    def _coach_response_from_plan(
        self,
        plan: Optional[Dict[str, Any]],
        model_cls: Type,
    ):
        if not isinstance(plan, dict) or not plan:
            return None
        try:
            return model_cls.model_validate(plan)
        except Exception:
            return None

    async def get_pdf_bundle(
        self,
        admin_username: str,
        student_username: str,
        *,
        refresh_coach: bool = False,
    ) -> AdminStudentReportPdfBundle:
        report = await self.get_report_card(admin_username, student_username)
        uname = student_username.strip()
        trends = await self._analytics.learning_trends(uname)

        time_strategy: Optional[StudentAttemptTimeStrategyResponse] = None
        accuracy_improvement: Optional[StudentAttemptAccuracyImprovementResponse] = None

        if report.latest_attempt and report.latest_attempt_detail:
            aid = report.latest_attempt.attempt_id
            detail = report.latest_attempt_detail
            subj = None
            topic = None
            exam = None
            if detail.questions:
                pass
            att = await self._attempts.get(aid)
            if att:
                subj = str(att.get("subject_filter") or "").strip() or None
                topic = str(att.get("topic_filter") or "").strip() or None
                exam = str(att.get("exam_tag_filter") or "").strip().upper() or None

            coach = await self._analytics.get_coach_plan(uname, subject=subj, topic=topic, exam_tag=exam)
            if not refresh_coach:
                time_strategy = self._coach_response_from_plan(
                    coach.time_plan, StudentAttemptTimeStrategyResponse
                )
                accuracy_improvement = self._coach_response_from_plan(
                    coach.accuracy_plan, StudentAttemptAccuracyImprovementResponse
                )

            if refresh_coach or not time_strategy:
                try:
                    time_strategy = await self._analytics.openai_time_strategy(
                        uname, aid, subject=subj, topic=topic, exam_tag=exam
                    )
                except ValueError:
                    pass
            if refresh_coach or not accuracy_improvement:
                try:
                    accuracy_improvement = await self._analytics.openai_accuracy_improvement(
                        uname, aid, subject=subj, topic=topic, exam_tag=exam
                    )
                except ValueError:
                    pass

        return AdminStudentReportPdfBundle(
            report=report,
            trends=trends,
            time_strategy=time_strategy,
            accuracy_improvement=accuracy_improvement,
        )
