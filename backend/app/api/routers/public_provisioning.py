from fastapi import APIRouter, Depends, HTTPException

from app.api.deps_auth import require_public_api_key
from app.schemas.integration import ProvisionStudentRequest, ProvisionStudentResponse
from app.services.provisioning_service import ProvisioningService

router = APIRouter(prefix="/public/students", tags=["public-provisioning"])


def get_provisioning_service() -> ProvisioningService:
    return ProvisioningService()


@router.post("/provision", response_model=ProvisionStudentResponse)
async def provision_student_after_payment(
    body: ProvisionStudentRequest,
    _: None = Depends(require_public_api_key),
    svc: ProvisioningService = Depends(get_provisioning_service),
) -> ProvisionStudentResponse:
    """
    **Payment / checkout integration:** create a student account (if it does not exist) and assign
    question papers by id. Send header `X-API-Key` with a value from `PUBLIC_ASSIGN_API_KEYS`.

    - New user: `password` is required.
    - Existing student: `password` is ignored; only missing paper assignments are added (safe for retries).
    """
    try:
        created, newly, already = await svc.provision_student_with_papers(
            username=body.username,
            password=body.password,
            paper_ids=body.paper_ids,
        )
        return ProvisionStudentResponse(
            username=body.username.strip(),
            created=created,
            assigned_paper_ids=newly,
            already_assigned_paper_ids=already,
        )
    except ValueError as e:
        msg = str(e)
        if msg.startswith("Paper not found"):
            raise HTTPException(status_code=404, detail=msg) from e
        raise HTTPException(status_code=400, detail=msg) from e
