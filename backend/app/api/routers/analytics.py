from fastapi import APIRouter, Depends

from app.api.deps import get_analytics_service
from app.schemas.analytics import AnalyticsOverview
from app.services.analytics_service import AnalyticsService
from app.api.deps_auth import require_admin

router = APIRouter(prefix="/analytics", tags=["analytics"], dependencies=[Depends(require_admin)])


@router.get("/overview", response_model=AnalyticsOverview)
async def analytics_overview(
    svc: AnalyticsService = Depends(get_analytics_service),
) -> AnalyticsOverview:
    return await svc.overview()
