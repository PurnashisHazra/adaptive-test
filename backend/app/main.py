from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routers import (
    admin_challenges,
    admin_consultation_requests,
    admin_leader_connect,
    admin_mentorship_bookings,
    admin_paper_unlocks,
    admin_question_papers,
    admin_rc_sets,
    admin_students,
    admin_users,
    analytics,
    attempts,
    auth,
    config,
    health,
    public_profiles,
    public_provisioning,
    public_question_papers,
    public_news,
    challenges,
    consultation_requests,
    paper_unlocks,
    leader_connect,
    mentorship_bookings,
    question_papers,
    question_reports,
    questions,
    student_analytics,
    student_me,
    super_admin,
    super_admin_dashboard,
    god,
    tests,
)
from app.core.config import get_settings
from app.db.mongodb import close_client
from app.repositories.attempt_repository import AttemptRepository
from app.repositories.config_repository import ConfigRepository
from app.repositories.question_repository import QuestionRepository
from app.repositories.challenge_repository import ChallengeRepository
from app.repositories.paper_repository import PaperRepository
from app.repositories.question_report_repository import QuestionReportRepository
from app.repositories.student_coach_plan_repository import StudentCoachPlanRepository
from app.repositories.paper_unlock_repository import PaperUnlockRepository
from app.repositories.consultation_request_repository import ConsultationRequestRepository
from app.repositories.reading_passage_repository import ReadingPassageRepository
from app.repositories.leader_connect_repository import LeaderConnectRepository
from app.repositories.mentorship_booking_repository import MentorshipBookingRepository
from app.repositories.practice_attempt_request_repository import PracticeAttemptRequestRepository
from app.repositories.student_profile_repository import StudentProfileRepository
from app.repositories.student_public_profile_repository import StudentPublicProfileRepository
from app.repositories.user_repository import UserRepository
from app.services.landing_showcase_service import LandingShowcaseService

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await QuestionRepository().ensure_indexes()
        await AttemptRepository().ensure_indexes()
        await ConfigRepository().ensure_indexes()
        await UserRepository().ensure_indexes()
        await PaperRepository().ensure_indexes()
        await ChallengeRepository().ensure_indexes()
        await QuestionReportRepository().ensure_indexes()
        await StudentCoachPlanRepository().ensure_indexes()
        await StudentProfileRepository().ensure_indexes()
        await PracticeAttemptRequestRepository().ensure_indexes()
        await MentorshipBookingRepository().ensure_indexes()
        await PaperUnlockRepository().ensure_indexes()
        await LeaderConnectRepository().ensure_indexes()
        await ConsultationRequestRepository().ensure_indexes()
        await ReadingPassageRepository().ensure_indexes()
        await StudentPublicProfileRepository().ensure_indexes()
        from app.services.question_bank_folder_service import QuestionBankFolderService

        await QuestionBankFolderService().ensure_indexes()
        await LandingShowcaseService().ensure_showcase_papers()
    except Exception as exc:
        # Keep API available even if MongoDB is temporarily unreachable.
        logger.exception("MongoDB initialization failed; continuing startup without DB indexes: %s", exc)
    yield
    try:
        await close_client()
    except Exception as exc:
        logger.warning("MongoDB client shutdown failed: %s", exc)


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version="1.0.0",
        lifespan=lifespan,
        description="Adaptive student testing platform — server-controlled difficulty and question selection.",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health.router, prefix="/api")
    app.include_router(auth.router, prefix="/api")
    app.include_router(config.router, prefix="/api")
    app.include_router(questions.router, prefix="/api")
    app.include_router(tests.router, prefix="/api")
    app.include_router(attempts.router, prefix="/api")
    app.include_router(student_analytics.router, prefix="/api")
    app.include_router(analytics.router, prefix="/api")
    app.include_router(admin_users.router, prefix="/api")
    app.include_router(admin_students.router, prefix="/api")
    app.include_router(student_me.router, prefix="/api")
    app.include_router(admin_question_papers.router, prefix="/api")
    app.include_router(admin_challenges.router, prefix="/api")
    app.include_router(admin_mentorship_bookings.router, prefix="/api")
    app.include_router(admin_paper_unlocks.router, prefix="/api")
    app.include_router(admin_leader_connect.router, prefix="/api")
    app.include_router(admin_consultation_requests.router, prefix="/api")
    app.include_router(admin_rc_sets.router, prefix="/api")
    app.include_router(challenges.router, prefix="/api")
    app.include_router(mentorship_bookings.router, prefix="/api")
    app.include_router(paper_unlocks.router, prefix="/api")
    app.include_router(leader_connect.router, prefix="/api")
    app.include_router(consultation_requests.router, prefix="/api")
    app.include_router(public_profiles.router, prefix="/api")
    app.include_router(public_news.router, prefix="/api")
    app.include_router(public_question_papers.router, prefix="/api")
    app.include_router(public_provisioning.router, prefix="/api")
    app.include_router(question_papers.router, prefix="/api")
    app.include_router(question_reports.student_router, prefix="/api")
    app.include_router(question_reports.admin_router, prefix="/api")
    app.include_router(super_admin.router, prefix="/api")
    app.include_router(super_admin_dashboard.router, prefix="/api")
    app.include_router(god.router, prefix="/api")
    return app


app = create_app()
