from typing import List

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps_auth import require_admin
from app.schemas.reading_passage import RcSetCreate, RcSetDetail, RcSetListItem, RcSetUpdate
from app.services.rc_set_service import RcSetService

router = APIRouter(prefix="/admin/rc-sets", tags=["admin-rc-sets"])


def _svc() -> RcSetService:
    return RcSetService()


@router.get("", response_model=List[RcSetListItem])
async def list_rc_sets(_: dict = Depends(require_admin)) -> List[RcSetListItem]:
    return await _svc().list_sets()


@router.get("/{passage_id}", response_model=RcSetDetail)
async def get_rc_set(passage_id: str, _: dict = Depends(require_admin)) -> RcSetDetail:
    try:
        return await _svc().get_set(passage_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.post("", response_model=RcSetDetail)
async def create_rc_set(body: RcSetCreate, _: dict = Depends(require_admin)) -> RcSetDetail:
    try:
        return await _svc().create_set(body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.put("/{passage_id}", response_model=RcSetDetail)
async def update_rc_set(
    passage_id: str,
    body: RcSetUpdate,
    _: dict = Depends(require_admin),
) -> RcSetDetail:
    try:
        return await _svc().update_set(passage_id, body)
    except ValueError as e:
        msg = str(e)
        code = 404 if "not found" in msg.lower() else 400
        raise HTTPException(status_code=code, detail=msg) from e


@router.delete("/{passage_id}")
async def delete_rc_set(passage_id: str, _: dict = Depends(require_admin)) -> dict:
    try:
        await _svc().delete_set(passage_id)
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
