from typing import List

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_paper_service
from app.api.deps_auth import require_admin
from app.schemas.paper import (
    AssignPaperByTitleRequest,
    AssignPaperByTitleResponse,
    QuestionPaperCreate,
    QuestionPaperOut,
    QuestionPaperUpdate,
)
from app.services.paper_service import PaperService

router = APIRouter(prefix="/admin/question-papers", tags=["admin-question-papers"])


@router.post("", response_model=QuestionPaperOut)
async def create_paper(
    body: QuestionPaperCreate,
    claims: dict = Depends(require_admin),
    svc: PaperService = Depends(get_paper_service),
) -> QuestionPaperOut:
    try:
        return await svc.create_paper(body, created_by=str(claims.get("sub", "")))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("", response_model=List[QuestionPaperOut])
async def list_papers(
    _claims: dict = Depends(require_admin),
    svc: PaperService = Depends(get_paper_service),
) -> List[QuestionPaperOut]:
    return await svc.list_papers()


@router.post("/assign-by-title", response_model=AssignPaperByTitleResponse)
async def assign_paper_by_title(
    body: AssignPaperByTitleRequest,
    _claims: dict = Depends(require_admin),
    svc: PaperService = Depends(get_paper_service),
) -> AssignPaperByTitleResponse:
    """Find a paper by title and set its assignees (replaces existing assignments)."""
    try:
        paper_id, paper_title, assignees = await svc.assign_paper_by_title(body.title, body.assignees)
        return AssignPaperByTitleResponse(paper_id=paper_id, paper_title=paper_title, assignees=assignees)
    except ValueError as e:
        msg = str(e)
        if msg.startswith("No question paper"):
            raise HTTPException(status_code=404, detail=msg) from e
        raise HTTPException(status_code=400, detail=msg) from e


@router.get("/{paper_id}", response_model=QuestionPaperOut)
async def get_paper(
    paper_id: str,
    _claims: dict = Depends(require_admin),
    svc: PaperService = Depends(get_paper_service),
) -> QuestionPaperOut:
    try:
        return await svc.get_paper(paper_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.patch("/{paper_id}", response_model=QuestionPaperOut)
async def update_paper(
    paper_id: str,
    body: QuestionPaperUpdate,
    claims: dict = Depends(require_admin),
    svc: PaperService = Depends(get_paper_service),
) -> QuestionPaperOut:
    try:
        return await svc.update_paper(paper_id, body, admin_username=str(claims.get("sub", "")))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/{paper_id}/assign")
async def assign_paper(
    paper_id: str,
    body: dict,
    _claims: dict = Depends(require_admin),
    svc: PaperService = Depends(get_paper_service),
) -> dict:
    username = (body.get("student_username") or "").strip()
    if not username:
        raise HTTPException(status_code=400, detail="student_username required")
    try:
        await svc.assign(paper_id, username)
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.delete("/{paper_id}/assign/{username}")
async def unassign_paper(
    paper_id: str,
    username: str,
    _claims: dict = Depends(require_admin),
    svc: PaperService = Depends(get_paper_service),
) -> dict:
    await svc.unassign(paper_id, username)
    return {"ok": True}


@router.get("/{paper_id}/assignments")
async def list_paper_assignments(
    paper_id: str,
    _claims: dict = Depends(require_admin),
    svc: PaperService = Depends(get_paper_service),
) -> List[dict]:
    try:
        return await svc.list_assignments(paper_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.put("/{paper_id}/assignments")
async def sync_paper_assignments(
    paper_id: str,
    body: dict,
    _claims: dict = Depends(require_admin),
    svc: PaperService = Depends(get_paper_service),
) -> dict:
    raw = body.get("student_usernames")
    if not isinstance(raw, list):
        raise HTTPException(status_code=400, detail="student_usernames must be a list")
    usernames = [str(x) for x in raw if x is not None and str(x).strip()]
    try:
        await svc.sync_assignments(paper_id, usernames)
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
