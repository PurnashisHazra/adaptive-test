from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routers import (
    admin_question_papers,
    admin_users,
    analytics,
    attempts,
    auth,
    config,
    health,
    public_provisioning,
    public_question_papers,
    question_papers,
    question_reports,
    questions,
    student_analytics,
    super_admin,
    tests,
)
from app.core.config import get_settings
from app.db.mongodb import close_client
from app.repositories.attempt_repository import AttemptRepository
from app.repositories.config_repository import ConfigRepository
from app.repositories.question_repository import QuestionRepository
from app.repositories.paper_repository import PaperRepository
from app.repositories.question_report_repository import QuestionReportRepository
from app.repositories.user_repository import UserRepository

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await QuestionRepository().ensure_indexes()
        await AttemptRepository().ensure_indexes()
        await ConfigRepository().ensure_indexes()
        await UserRepository().ensure_indexes()
        await PaperRepository().ensure_indexes()
        await QuestionReportRepository().ensure_indexes()
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
    app.include_router(admin_question_papers.router, prefix="/api")
    app.include_router(public_question_papers.router, prefix="/api")
    app.include_router(public_provisioning.router, prefix="/api")
    app.include_router(question_papers.router, prefix="/api")
    app.include_router(question_reports.student_router, prefix="/api")
    app.include_router(question_reports.admin_router, prefix="/api")
    app.include_router(super_admin.router, prefix="/api")
    return app


app = create_app()
