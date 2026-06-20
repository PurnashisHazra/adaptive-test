from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_challenge_service
from app.api.deps_challenge_actor import get_challenge_actor, get_optional_challenge_actor
from app.schemas.attempt import TestStartResponse
from app.schemas.auth import AuthResponse
from app.schemas.challenge import (
    ChallengeCatalogPage,
    ChallengeGuestSignupBody,
    ChallengeGuestStartBody,
    ChallengeParticipantsPage,
    ChallengeRecapResponse,
)
from app.services.challenge_service import ChallengeService
from app.utils.guest import GUEST_EMAIL_REQUIRED

router = APIRouter(prefix="/challenges", tags=["challenges"])


@router.get("/catalog", response_model=ChallengeCatalogPage)
async def list_challenge_catalog(
    page: int = 1,
    page_size: int = 3,
    guest_id: Optional[str] = None,
    actor: tuple = Depends(get_optional_challenge_actor),
    svc: ChallengeService = Depends(get_challenge_service),
) -> ChallengeCatalogPage:
    username, _is_guest = actor
    return await svc.list_catalog(username, page=page, page_size=page_size)


@router.get("/{challenge_id}/participants", response_model=ChallengeParticipantsPage)
async def list_challenge_participants(
    challenge_id: str,
    page: int = 1,
    page_size: int = 20,
    svc: ChallengeService = Depends(get_challenge_service),
) -> ChallengeParticipantsPage:
    try:
        return await svc.list_challenge_participants(challenge_id, page=page, page_size=page_size)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.post("/{challenge_id}/start", response_model=TestStartResponse)
async def start_challenge(
    challenge_id: str,
    body: Optional[ChallengeGuestStartBody] = None,
    actor: tuple = Depends(get_challenge_actor),
    svc: ChallengeService = Depends(get_challenge_service),
) -> TestStartResponse:
    username, _is_guest = actor
    display_name = body.display_name if body else None
    try:
        return await svc.start_challenge(challenge_id, username, display_name=display_name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/{challenge_id}/resume", response_model=TestStartResponse)
async def resume_challenge(
    challenge_id: str,
    actor: tuple = Depends(get_challenge_actor),
    svc: ChallengeService = Depends(get_challenge_service),
) -> TestStartResponse:
    username, _is_guest = actor
    try:
        return await svc.resume_challenge(challenge_id, username)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/attempts/{challenge_attempt_id}/end")
async def end_challenge(
    challenge_attempt_id: str,
    actor: tuple = Depends(get_challenge_actor),
    svc: ChallengeService = Depends(get_challenge_service),
) -> dict:
    username, _is_guest = actor
    try:
        summary = await svc.end_challenge_early(challenge_attempt_id, student_username=username)
        return {"paper_summary": summary.model_dump()}
    except ValueError as e:
        msg = str(e)
        code = 404 if msg == "Not found" else 400
        raise HTTPException(status_code=code, detail=msg) from e


@router.post("/attempts/{challenge_attempt_id}/timeout-section")
async def timeout_challenge_section(
    challenge_attempt_id: str,
    actor: tuple = Depends(get_challenge_actor),
    svc: ChallengeService = Depends(get_challenge_service),
):
    username, _is_guest = actor
    try:
        return await svc.timeout_current_section(challenge_attempt_id, student_username=username)
    except ValueError as e:
        msg = str(e)
        code = 404 if msg == "Not found" else 400
        raise HTTPException(status_code=code, detail=msg) from e


@router.post("/attempts/{challenge_attempt_id}/guest-signup", response_model=AuthResponse)
async def submit_challenge_guest_signup(
    challenge_attempt_id: str,
    body: ChallengeGuestSignupBody,
    actor: tuple = Depends(get_challenge_actor),
    svc: ChallengeService = Depends(get_challenge_service),
) -> AuthResponse:
    username, _is_guest = actor
    try:
        return await svc.submit_guest_signup(
            challenge_attempt_id,
            username,
            body.email,
            body.password,
        )
    except ValueError as e:
        msg = str(e)
        if msg == "Not found":
            raise HTTPException(status_code=404, detail=msg) from e
        raise HTTPException(status_code=400, detail=msg) from e


@router.get("/attempts/{challenge_attempt_id}/recap", response_model=ChallengeRecapResponse)
async def get_challenge_recap(
    challenge_attempt_id: str,
    actor: tuple = Depends(get_challenge_actor),
    svc: ChallengeService = Depends(get_challenge_service),
) -> ChallengeRecapResponse:
    username, _is_guest = actor
    try:
        return await svc.get_challenge_recap(challenge_attempt_id, username)
    except ValueError as e:
        msg = str(e)
        if msg == GUEST_EMAIL_REQUIRED:
            raise HTTPException(status_code=403, detail=msg) from e
        code = 404 if msg == "Not found" else 400
        raise HTTPException(status_code=code, detail=msg) from e
