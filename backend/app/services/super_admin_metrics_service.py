from datetime import datetime
from typing import Any, Dict, Tuple

import asyncio

from app.repositories.super_admin_metrics_repository import (
    SuperAdminMetricsRepository,
    lookback_windows,
)
from app.schemas.super_admin_metrics import (
    PeriodAmounts,
    PeriodCounts,
    SuperAdminAttemptMetrics,
    SuperAdminCatalogMetrics,
    SuperAdminLeadMetrics,
    SuperAdminMetricsResponse,
    SuperAdminPaymentStreamMetrics,
    SuperAdminRevenueMetrics,
    SuperAdminUserMetrics,
)

_COMPLETED = {"status": {"$in": ["completed", "ended_early"]}}
_CONFIRMED = {"status": "confirmed"}
_REJECTED = {"status": "rejected"}
_PENDING = {"status": {"$in": ["pending_payment", "under_review"]}}


def _counts(raw: Dict[str, int]) -> PeriodCounts:
    return PeriodCounts(**raw)


def _amounts(raw: Dict[str, int]) -> PeriodAmounts:
    return PeriodAmounts(**raw)


def _add_amounts(a: PeriodAmounts, b: PeriodAmounts) -> PeriodAmounts:
    return PeriodAmounts(
        last_day=a.last_day + b.last_day,
        last_week=a.last_week + b.last_week,
        last_month=a.last_month + b.last_month,
        all_time=a.all_time + b.all_time,
    )


class SuperAdminMetricsService:
    def __init__(self) -> None:
        self._repo = SuperAdminMetricsRepository()

    async def _payment_stream(
        self,
        col: Any,
        starts: Tuple[datetime, datetime, datetime],
    ) -> SuperAdminPaymentStreamMetrics:
        confirmed = await self._repo.period_counts(col, "confirmed_at", starts, _CONFIRMED)
        revenue = await self._repo.period_amounts(col, starts, _CONFIRMED, "confirmed_at")
        rejected = await self._repo.period_counts(col, "rejected_at", starts, _REJECTED)
        pending = await self._repo.count(col, _PENDING)
        return SuperAdminPaymentStreamMetrics(
            confirmed=_counts(confirmed),
            revenue_inr=_amounts(revenue),
            pending=pending,
            rejected=_counts(rejected),
        )

    async def overview(self) -> SuperAdminMetricsResponse:
        day, week, month, generated_at = lookback_windows()
        starts = (day, week, month)
        repo = self._repo
        standalone = repo.standalone_test_filter()
        completed_standalone = {**standalone, **_COMPLETED}

        (
            users_total,
            users_students,
            users_admins,
            users_super,
            adaptive,
            adaptive_done,
            papers,
            papers_done,
            challenges,
            challenges_done,
            mentorship,
            unlocks,
            consultations,
            leader_connect,
            questions,
            paper_count,
            challenge_count,
        ) = await asyncio.gather(
            repo.period_counts(repo.users, "created_at", starts),
            repo.period_counts(repo.users, "created_at", starts, {"role": "student"}),
            repo.period_counts(repo.users, "created_at", starts, {"role": "admin"}),
            repo.period_counts(repo.users, "created_at", starts, {"role": "super_admin"}),
            repo.period_counts(repo.test_attempts, "started_at", starts, standalone),
            repo.period_counts(repo.test_attempts, "started_at", starts, completed_standalone),
            repo.period_counts(repo.paper_attempts, "started_at", starts),
            repo.period_counts(repo.paper_attempts, "started_at", starts, _COMPLETED),
            repo.period_counts(repo.challenge_attempts, "started_at", starts),
            repo.period_counts(repo.challenge_attempts, "started_at", starts, _COMPLETED),
            self._payment_stream(repo.mentorship, starts),
            self._payment_stream(repo.paper_unlocks, starts),
            repo.period_counts(repo.consultations, "created_at", starts),
            repo.period_counts(repo.leader_connect, "created_at", starts),
            repo.count(repo.questions),
            repo.count(repo.papers),
            repo.count(repo.challenges),
        )

        return SuperAdminMetricsResponse(
            generated_at=generated_at,
            last_day_start=day,
            last_week_start=week,
            last_month_start=month,
            users=SuperAdminUserMetrics(
                total=_counts(users_total),
                students=_counts(users_students),
                admins=_counts(users_admins),
                super_admins=_counts(users_super),
            ),
            attempts=SuperAdminAttemptMetrics(
                adaptive_tests=_counts(adaptive),
                adaptive_tests_completed=_counts(adaptive_done),
                paper_attempts=_counts(papers),
                paper_attempts_completed=_counts(papers_done),
                challenge_attempts=_counts(challenges),
                challenge_attempts_completed=_counts(challenges_done),
            ),
            revenue=SuperAdminRevenueMetrics(
                mentorship=mentorship,
                paper_unlocks=unlocks,
                total_revenue_inr=_add_amounts(mentorship.revenue_inr, unlocks.revenue_inr),
                pending_payments=mentorship.pending + unlocks.pending,
            ),
            leads=SuperAdminLeadMetrics(
                consultations=_counts(consultations),
                leader_connect=_counts(leader_connect),
            ),
            catalog=SuperAdminCatalogMetrics(
                questions=questions,
                papers=paper_count,
                challenges=challenge_count,
            ),
        )
