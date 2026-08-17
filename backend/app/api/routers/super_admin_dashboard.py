from fastapi import APIRouter, Depends, HTTPException

from app.api.deps_auth import require_super_admin
from app.schemas.admin_limits import AdminLimits
from app.schemas.auth import Role
from app.schemas.super_admin_dashboard import (
    SetUserAdminCodeRequest,
    SuperAdminUserListResponse,
    SuperAdminUserRow,
    UpdateUserRoleRequest,
)
from app.schemas.super_admin_metrics import SuperAdminMetricsResponse
from app.services.super_admin_dashboard_service import SuperAdminDashboardService
from app.services.super_admin_metrics_service import SuperAdminMetricsService

router = APIRouter(prefix="/super-admin/dashboard", tags=["super-admin-dashboard"])


def _svc() -> SuperAdminDashboardService:
    return SuperAdminDashboardService()


@router.get("/users", response_model=SuperAdminUserListResponse)
async def list_users(_: dict = Depends(require_super_admin)) -> SuperAdminUserListResponse:
    users = await _svc().list_users()
    return SuperAdminUserListResponse(users=users)


@router.get("/metrics", response_model=SuperAdminMetricsResponse)
async def platform_metrics(_: dict = Depends(require_super_admin)) -> SuperAdminMetricsResponse:
    return await SuperAdminMetricsService().overview()


@router.patch("/users/{username}/role", response_model=SuperAdminUserRow)
async def update_user_role(
    username: str,
    body: UpdateUserRoleRequest,
    _: dict = Depends(require_super_admin),
) -> SuperAdminUserRow:
    try:
        return await _svc().update_role(username, body.role)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.put("/users/{username}/admin-code", response_model=SuperAdminUserRow)
async def set_admin_code(
    username: str,
    body: SetUserAdminCodeRequest,
    _: dict = Depends(require_super_admin),
) -> SuperAdminUserRow:
    try:
        return await _svc().set_admin_code(username, body.admin_code)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/users/{username}/admin-code/generate", response_model=SuperAdminUserRow)
async def generate_admin_code(
    username: str,
    _: dict = Depends(require_super_admin),
) -> SuperAdminUserRow:
    try:
        return await _svc().generate_admin_code(username)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.put("/users/{username}/admin-limits", response_model=SuperAdminUserRow)
async def set_admin_limits(
    username: str,
    body: AdminLimits,
    _: dict = Depends(require_super_admin),
) -> SuperAdminUserRow:
    try:
        return await _svc().update_admin_limits(username, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
