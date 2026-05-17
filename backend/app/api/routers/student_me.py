from fastapi import APIRouter, Depends

from app.api.deps_auth import require_student, require_student_with_admin_code
from app.schemas.student_profile import StudentSessionControls
from app.services.student_profile_service import StudentProfileService

router = APIRouter(prefix="/me", tags=["student-me"])


@router.get("/session-controls", response_model=StudentSessionControls)
async def get_my_session_controls(claims: dict = Depends(require_student_with_admin_code)) -> StudentSessionControls:
    username = str(claims.get("sub", "")).strip()
    return await StudentProfileService().get_session_controls(username)
