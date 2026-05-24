from typing import List

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_challenge_service
from app.api.deps_auth import require_admin
from app.schemas.challenge import ChallengeCreate, ChallengeOut, ChallengeUpdate
from app.services.challenge_service import ChallengeService

router = APIRouter(prefix="/admin/challenges", tags=["admin-challenges"])


@router.post("", response_model=ChallengeOut)
async def create_challenge(
    body: ChallengeCreate,
    claims: dict = Depends(require_admin),
    svc: ChallengeService = Depends(get_challenge_service),
) -> ChallengeOut:
    try:
        return await svc.create_challenge(body, created_by=str(claims.get("sub", "")))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("", response_model=List[ChallengeOut])
async def list_challenges(
    _claims: dict = Depends(require_admin),
    svc: ChallengeService = Depends(get_challenge_service),
) -> List[ChallengeOut]:
    return await svc.list_challenges()


@router.get("/{challenge_id}", response_model=ChallengeOut)
async def get_challenge(
    challenge_id: str,
    _claims: dict = Depends(require_admin),
    svc: ChallengeService = Depends(get_challenge_service),
) -> ChallengeOut:
    try:
        return await svc.get_challenge(challenge_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.patch("/{challenge_id}", response_model=ChallengeOut)
async def update_challenge(
    challenge_id: str,
    body: ChallengeUpdate,
    claims: dict = Depends(require_admin),
    svc: ChallengeService = Depends(get_challenge_service),
) -> ChallengeOut:
    try:
        return await svc.update_challenge(challenge_id, body, admin_username=str(claims.get("sub", "")))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/{challenge_id}/assign")
async def assign_challenge(
    challenge_id: str,
    body: dict,
    _claims: dict = Depends(require_admin),
    svc: ChallengeService = Depends(get_challenge_service),
) -> dict:
    username = (body.get("student_username") or "").strip()
    if not username:
        raise HTTPException(status_code=400, detail="student_username required")
    try:
        await svc.assign(challenge_id, username)
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.delete("/{challenge_id}/assign/{username}")
async def unassign_challenge(
    challenge_id: str,
    username: str,
    _claims: dict = Depends(require_admin),
    svc: ChallengeService = Depends(get_challenge_service),
) -> dict:
    await svc.unassign(challenge_id, username)
    return {"ok": True}


@router.get("/{challenge_id}/assignments")
async def list_challenge_assignments(
    challenge_id: str,
    _claims: dict = Depends(require_admin),
    svc: ChallengeService = Depends(get_challenge_service),
) -> List[dict]:
    try:
        return await svc.list_assignments(challenge_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.put("/{challenge_id}/assignments")
async def sync_challenge_assignments(
    challenge_id: str,
    body: dict,
    _claims: dict = Depends(require_admin),
    svc: ChallengeService = Depends(get_challenge_service),
) -> dict:
    raw = body.get("student_usernames")
    if not isinstance(raw, list):
        raise HTTPException(status_code=400, detail="student_usernames must be a list")
    usernames = [str(x) for x in raw if x is not None and str(x).strip()]
    try:
        await svc.sync_assignments(challenge_id, usernames)
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
