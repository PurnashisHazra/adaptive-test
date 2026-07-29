from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.api.deps_auth import get_optional_claims
from app.schemas.leader_connect_request import LeaderConnectRequestOut
from app.services.leader_connect_service import LeaderConnectService

router = APIRouter(prefix="/leader-connect", tags=["leader-connect"])


def _svc() -> LeaderConnectService:
    return LeaderConnectService()


@router.post("/requests", response_model=LeaderConnectRequestOut)
async def submit_leader_connect_request(
    company_clicked: str = Form(...),
    main_topic: str = Form(...),
    company_interested_in: str = Form(...),
    mobile: str = Form(...),
    cv_file: Optional[UploadFile] = File(None),
    claims: Optional[dict] = Depends(get_optional_claims),
) -> LeaderConnectRequestOut:
    student_username = str(claims.get("sub", "")).strip() if claims else None
    try:
        return await _svc().create(
            company_clicked=company_clicked,
            main_topic=main_topic,
            company_interested_in=company_interested_in,
            mobile=mobile,
            cv_file=cv_file,
            student_username=student_username or None,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
