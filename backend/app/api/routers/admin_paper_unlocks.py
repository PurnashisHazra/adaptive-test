from typing import List

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps_auth import require_admin
from app.schemas.paper_unlock import PaperUnlockAdminItem, PaperUnlockOut
from app.services.paper_unlock_service import PaperUnlockService

router = APIRouter(prefix="/admin/paper-unlocks", tags=["admin-paper-unlock"])


def _svc() -> PaperUnlockService:
    return PaperUnlockService()


@router.get("/pending", response_model=List[PaperUnlockAdminItem])
async def list_pending_unlocks(_: dict = Depends(require_admin)) -> List[PaperUnlockAdminItem]:
    return await _svc().list_pending_admin()


@router.post("/{purchase_id}/approve", response_model=PaperUnlockOut)
async def approve_unlock(
    purchase_id: str,
    claims: dict = Depends(require_admin),
) -> PaperUnlockOut:
    try:
        return await _svc().approve(str(claims.get("sub", "")), purchase_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/{purchase_id}/reject", response_model=PaperUnlockOut)
async def reject_unlock(
    purchase_id: str,
    claims: dict = Depends(require_admin),
) -> PaperUnlockOut:
    try:
        return await _svc().reject(str(claims.get("sub", "")), purchase_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
