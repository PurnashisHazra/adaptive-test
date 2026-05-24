from app.services.analytics_service import AnalyticsService
from app.services.bulk_import_service import BulkImportService
from app.services.challenge_service import ChallengeService
from app.services.paper_service import PaperService
from app.services.pdf_question_import_service import PdfQuestionImportService
from app.services.question_report_service import QuestionReportService
from app.services.question_service import QuestionService
from app.services.r2_storage_service import R2StorageService
from app.services.student_analytics_service import StudentAnalyticsService
from app.services.student_history_service import StudentHistoryService
from app.services.test_service import TestService


def get_question_service() -> QuestionService:
    return QuestionService()


def get_test_service() -> TestService:
    return TestService()


def get_paper_service() -> PaperService:
    return PaperService()


def get_challenge_service() -> ChallengeService:
    return ChallengeService()


def get_analytics_service() -> AnalyticsService:
    return AnalyticsService()


def get_bulk_import_service() -> BulkImportService:
    return BulkImportService()


def get_student_history_service() -> StudentHistoryService:
    return StudentHistoryService()


def get_student_analytics_service() -> StudentAnalyticsService:
    return StudentAnalyticsService()


def get_question_report_service() -> QuestionReportService:
    return QuestionReportService()


def get_r2_storage_service() -> R2StorageService:
    return R2StorageService()


def get_pdf_question_import_service() -> PdfQuestionImportService:
    return PdfQuestionImportService()
