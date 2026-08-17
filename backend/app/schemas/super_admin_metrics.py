from datetime import datetime

from pydantic import BaseModel, Field


class PeriodCounts(BaseModel):
    last_day: int = 0
    last_week: int = 0
    last_month: int = 0
    all_time: int = 0


class PeriodAmounts(BaseModel):
    last_day: int = 0
    last_week: int = 0
    last_month: int = 0
    all_time: int = 0


class SuperAdminUserMetrics(BaseModel):
    total: PeriodCounts
    students: PeriodCounts
    admins: PeriodCounts
    super_admins: PeriodCounts


class SuperAdminAttemptMetrics(BaseModel):
    adaptive_tests: PeriodCounts
    adaptive_tests_completed: PeriodCounts
    paper_attempts: PeriodCounts
    paper_attempts_completed: PeriodCounts
    challenge_attempts: PeriodCounts
    challenge_attempts_completed: PeriodCounts


class SuperAdminPaymentStreamMetrics(BaseModel):
    confirmed: PeriodCounts
    revenue_inr: PeriodAmounts
    pending: int = 0
    rejected: PeriodCounts


class SuperAdminRevenueMetrics(BaseModel):
    mentorship: SuperAdminPaymentStreamMetrics
    paper_unlocks: SuperAdminPaymentStreamMetrics
    total_revenue_inr: PeriodAmounts
    pending_payments: int = 0


class SuperAdminLeadMetrics(BaseModel):
    consultations: PeriodCounts
    leader_connect: PeriodCounts


class SuperAdminCatalogMetrics(BaseModel):
    questions: int = 0
    papers: int = 0
    challenges: int = 0


class SuperAdminMetricsResponse(BaseModel):
    generated_at: datetime
    last_day_start: datetime
    last_week_start: datetime
    last_month_start: datetime
    currency: str = Field(default="INR")
    users: SuperAdminUserMetrics
    attempts: SuperAdminAttemptMetrics
    revenue: SuperAdminRevenueMetrics
    leads: SuperAdminLeadMetrics
    catalog: SuperAdminCatalogMetrics
