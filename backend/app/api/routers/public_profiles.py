from fastapi import APIRouter, Depends, HTTPException

from app.services.public_profile_service import PublicProfileService
from app.schemas.public_profile import PublicProfileOut

router = APIRouter(prefix="/public/students", tags=["public-profiles"])


@router.get("/{profile_slug}", response_model=PublicProfileOut)
async def get_public_student_profile(profile_slug: str) -> PublicProfileOut:
    try:
        return await PublicProfileService().get_public_by_slug(profile_slug)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
