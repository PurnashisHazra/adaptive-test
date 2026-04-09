from typing import List

from fastapi import APIRouter, Depends

from app.api.deps_auth import require_admin
from app.repositories.user_repository import UserRepository

router = APIRouter(prefix="/admin/users", tags=["admin-users"])


@router.get("/students")
async def list_students(_claims: dict = Depends(require_admin)) -> List[dict]:
    repo = UserRepository()
    users = await repo.list_by_role("student", limit=500)
    return [{"username": u["username"]} for u in users]
