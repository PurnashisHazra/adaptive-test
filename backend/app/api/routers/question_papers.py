from typing import List

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_paper_service
from app.api.deps_auth import require_role
from app.schemas.attempt import TestStartResponse
from app.schemas.auth import Role
from app.schemas.paper import AssignedPaperItem
from app.services.paper_service import PaperService

router = APIRouter(prefix="/papers", tags=["question-papers"])

require_student = require_role([Role.student])


@router.get("/assigned", response_model=List[AssignedPaperItem])
async def list_assigned_papers(
    claims: dict = Depends(require_student),
    svc: PaperService = Depends(get_paper_service),
) -> List[AssignedPaperItem]:
    rows = await svc.list_assigned_for_student(str(claims.get("sub", "")))
    return [AssignedPaperItem(**r) for r in rows]


@router.post("/{paper_id}/start", response_model=TestStartResponse)
async def start_question_paper(
    paper_id: str,
    claims: dict = Depends(require_student),
    svc: PaperService = Depends(get_paper_service),
) -> TestStartResponse:
    try:
        return await svc.start_paper(paper_id, str(claims.get("sub", "")))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/{paper_id}/resume", response_model=TestStartResponse)
async def resume_question_paper(
    paper_id: str,
    claims: dict = Depends(require_student),
    svc: PaperService = Depends(get_paper_service),
) -> TestStartResponse:
    try:
        return await svc.resume_paper(paper_id, str(claims.get("sub", "")))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/attempts/{paper_attempt_id}/end")
async def end_question_paper(
    paper_attempt_id: str,
    claims: dict = Depends(require_student),
    svc: PaperService = Depends(get_paper_service),
) -> dict:
    try:
        summary = await svc.end_paper_early(paper_attempt_id, student_username=str(claims.get("sub", "")))
        return {"paper_summary": summary.model_dump()}
    except ValueError as e:
        msg = str(e)
        code = 404 if msg == "Not found" else 400
        raise HTTPException(status_code=code, detail=msg) from e


@router.post("/attempts/{paper_attempt_id}/timeout-section")
async def timeout_section(
    paper_attempt_id: str,
    claims: dict = Depends(require_student),
    svc: PaperService = Depends(get_paper_service),
):
    try:
        return await svc.timeout_current_section(paper_attempt_id, student_username=str(claims.get("sub", "")))
    except ValueError as e:
        msg = str(e)
        code = 404 if msg == "Not found" else 400
        raise HTTPException(status_code=code, detail=msg) from e
