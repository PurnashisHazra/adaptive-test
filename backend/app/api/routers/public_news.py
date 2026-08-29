from asyncio import to_thread

from fastapi import APIRouter

from app.schemas.exam_news import ExamNewsResponse
from app.services.exam_news_service import get_exam_news

router = APIRouter(prefix="/public", tags=["public-news"])


@router.get("/exam-news", response_model=ExamNewsResponse)
async def list_exam_news() -> ExamNewsResponse:
    return await to_thread(get_exam_news)
