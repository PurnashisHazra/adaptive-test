from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_paper_service
from app.api.deps_auth import require_public_api_key
from app.schemas.paper import AssignPaperByTitleRequest, AssignPaperByTitleResponse
from app.services.paper_service import PaperService

router = APIRouter(prefix="/public/question-papers", tags=["public-question-papers"])


@router.post("/assign-by-title", response_model=AssignPaperByTitleResponse)
async def assign_paper_by_title_public(
    body: AssignPaperByTitleRequest,
    _: None = Depends(require_public_api_key),
    svc: PaperService = Depends(get_paper_service),
) -> AssignPaperByTitleResponse:
    """Public integration endpoint to replace assignees on a paper resolved by title."""
    try:
        paper_id, paper_title, assignees = await svc.assign_paper_by_title(body.title, body.assignees)
        return AssignPaperByTitleResponse(paper_id=paper_id, paper_title=paper_title, assignees=assignees)
    except ValueError as e:
        msg = str(e)
        if msg.startswith("No question paper"):
            raise HTTPException(status_code=404, detail=msg) from e
        raise HTTPException(status_code=400, detail=msg) from e
