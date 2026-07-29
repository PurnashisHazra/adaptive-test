from typing import List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from app.api.deps_auth import require_admin
from app.schemas.leader_connect_request import LeaderConnectRequestAdminItem, LeaderConnectRequestOut
from app.services.leader_connect_service import LeaderConnectService

router = APIRouter(prefix="/admin/leader-connect", tags=["admin-leader-connect"])


def _svc() -> LeaderConnectService:
    return LeaderConnectService()


@router.get("/requests", response_model=List[LeaderConnectRequestAdminItem])
async def list_requests(_: dict = Depends(require_admin)) -> List[LeaderConnectRequestAdminItem]:
    return await _svc().list_admin()


@router.post("/requests/{request_id}/mark-reviewed", response_model=LeaderConnectRequestOut)
async def mark_reviewed(
    request_id: str,
    _: dict = Depends(require_admin),
) -> LeaderConnectRequestOut:
    try:
        return await _svc().mark_reviewed(request_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/requests/{request_id}/cv")
async def download_cv(
    request_id: str,
    _: dict = Depends(require_admin),
) -> FileResponse:
    svc = _svc()
    row = await svc.get_row(request_id)
    if not row:
        raise HTTPException(status_code=404, detail="Request not found")
    path = svc.cv_path_for_row(row)
    filename = str(row.get("cv_filename") or path.name)
    return FileResponse(path, filename=filename, media_type="application/octet-stream")
