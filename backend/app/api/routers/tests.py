from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_test_service
from app.repositories.question_repository import QuestionRepository
from app.schemas.attempt import (
    AttemptSummary,
    MarkReviewRequest,
    MarkReviewResponse,
    QuestionAtIndexResponse,
    SubmitAnswerRequest,
    SubmitAnswerResponse,
    TestStartRequest,
    TestStartResponse,
)
from app.services.test_service import TestService

router = APIRouter(prefix="/tests", tags=["tests"])


@router.post("/start", response_model=TestStartResponse)
async def start_test(
    body: TestStartRequest,
    svc: TestService = Depends(get_test_service),
) -> TestStartResponse:
    try:
        return await svc.start_test(
            student_name=body.student_name,
            subject=body.subject,
            topic=body.topic,
            exam_tag=body.exam_tag,
            total_questions=body.total_questions,
            time_limit_seconds=body.time_limit_seconds,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/topics")
async def list_topics(subject: Optional[str] = Query(default=None)) -> dict:
    repo = QuestionRepository()
    topics = await repo.list_topics(subject=subject.strip() if subject else None)
    return {"topics": topics}


@router.get("/subjects")
async def list_subjects() -> dict:
    repo = QuestionRepository()
    subjects = await repo.list_subjects()
    return {"subjects": subjects}


@router.post("/{attempt_id}/answer", response_model=SubmitAnswerResponse)
async def submit_answer(
    attempt_id: str,
    body: SubmitAnswerRequest,
    svc: TestService = Depends(get_test_service),
) -> SubmitAnswerResponse:
    try:
        return await svc.submit_answer(
            attempt_id=attempt_id,
            question_id=body.question_id,
            chosen_answer=body.chosen_answer,
            time_spent_seconds=body.elapsed_seconds,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/{attempt_id}/question/{question_index}", response_model=QuestionAtIndexResponse)
async def get_question_at_index(
    attempt_id: str,
    question_index: int,
    svc: TestService = Depends(get_test_service),
) -> QuestionAtIndexResponse:
    try:
        return await svc.get_question_at_index(attempt_id, question_index)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.patch("/{attempt_id}/mark-review", response_model=MarkReviewResponse)
async def patch_mark_review(
    attempt_id: str,
    body: MarkReviewRequest,
    svc: TestService = Depends(get_test_service),
) -> MarkReviewResponse:
    try:
        mf = await svc.set_mark_review(attempt_id, body.question_index, body.marked)
        return MarkReviewResponse(marked_for_review=mf)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/{attempt_id}/end", response_model=AttemptSummary)
async def end_test(
    attempt_id: str,
    svc: TestService = Depends(get_test_service),
) -> AttemptSummary:
    try:
        return await svc.end_test_early(attempt_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
