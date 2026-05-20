from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_challenge_service
from app.api.deps_auth import get_optional_claims, require_student
from app.schemas.attempt import TestStartResponse
from app.schemas.challenge import ChallengeCatalogItem
from app.schemas.paper import PaperResultSummary
from app.services.challenge_service import ChallengeService

router = APIRouter(prefix="/challenges", tags=["challenges"])


@router.get("/catalog", response_model=List[ChallengeCatalogItem])
async def list_challenge_catalog(
    claims: Optional[dict] = Depends(get_optional_claims),
    svc: ChallengeService = Depends(get_challenge_service),
) -> List[ChallengeCatalogItem]:
    username = str(claims.get("sub", "")) if claims and claims.get("role") == "student" else None
    return await svc.list_catalog(username)


@router.post("/{challenge_id}/start", response_model=TestStartResponse)
async def start_challenge(
    challenge_id: str,
    claims: dict = Depends(require_student),
    svc: ChallengeService = Depends(get_challenge_service),
) -> TestStartResponse:
    try:
        return await svc.start_challenge(challenge_id, str(claims.get("sub", "")))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/{challenge_id}/resume", response_model=TestStartResponse)
async def resume_challenge(
    challenge_id: str,
    claims: dict = Depends(require_student),
    svc: ChallengeService = Depends(get_challenge_service),
) -> TestStartResponse:
    try:
        return await svc.resume_challenge(challenge_id, str(claims.get("sub", "")))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/attempts/{challenge_attempt_id}/end")
async def end_challenge(
    challenge_attempt_id: str,
    claims: dict = Depends(require_student),
    svc: ChallengeService = Depends(get_challenge_service),
) -> dict:
    try:
        summary = await svc.end_challenge_early(challenge_attempt_id, student_username=str(claims.get("sub", "")))
        return {"paper_summary": summary.model_dump()}
    except ValueError as e:
        msg = str(e)
        code = 404 if msg == "Not found" else 400
        raise HTTPException(status_code=code, detail=msg) from e


@router.post("/attempts/{challenge_attempt_id}/timeout-section")
async def timeout_challenge_section(
    challenge_attempt_id: str,
    claims: dict = Depends(require_student),
    svc: ChallengeService = Depends(get_challenge_service),
):
    try:
        return await svc.timeout_current_section(challenge_attempt_id, student_username=str(claims.get("sub", "")))
    except ValueError as e:
        msg = str(e)
        code = 404 if msg == "Not found" else 400
        raise HTTPException(status_code=code, detail=msg) from e
