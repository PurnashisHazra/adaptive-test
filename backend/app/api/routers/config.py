from fastapi import APIRouter, Depends

from app.repositories.config_repository import ConfigRepository, DEFAULT_TRANSITION_MAP
from app.schemas.attempt import AppConfigPublic, AppConfigUpdate
from app.api.deps_auth import require_admin

router = APIRouter(prefix="/config", tags=["config"])


def _repo() -> ConfigRepository:
    return ConfigRepository()


@router.get("", response_model=AppConfigPublic)
async def get_config(repo: ConfigRepository = Depends(_repo)) -> AppConfigPublic:
    doc = await repo.get_or_create()
    return AppConfigPublic(
        subject_filter_enabled=bool(doc.get("subject_filter_enabled", True)),
        topic_filter_enabled=bool(doc.get("topic_filter_enabled", True)),
        default_test_question_count=int(doc.get("default_test_question_count", 10)),
        default_time_limit_seconds=int(doc.get("default_time_limit_seconds", 1800)),
        difficulty_wave_enabled=bool(doc.get("difficulty_wave_enabled", False)),
        difficulty_sequence=doc.get("difficulty_sequence", []),
        difficulty_transition_enabled=bool(doc.get("difficulty_transition_enabled", True)),
        difficulty_transition_map=doc.get("difficulty_transition_map", DEFAULT_TRANSITION_MAP),
    )


@router.patch("", response_model=AppConfigPublic)
async def patch_config(
    body: AppConfigUpdate,
    repo: ConfigRepository = Depends(_repo),
    _: object = Depends(require_admin),
) -> AppConfigPublic:
    patch = body.model_dump(exclude_unset=True)
    doc = await repo.update(patch)
    return AppConfigPublic(
        subject_filter_enabled=bool(doc.get("subject_filter_enabled", True)),
        topic_filter_enabled=bool(doc.get("topic_filter_enabled", True)),
        default_test_question_count=int(doc.get("default_test_question_count", 10)),
        default_time_limit_seconds=int(doc.get("default_time_limit_seconds", 1800)),
        difficulty_wave_enabled=bool(doc.get("difficulty_wave_enabled", False)),
        difficulty_sequence=doc.get("difficulty_sequence", []),
        difficulty_transition_enabled=bool(doc.get("difficulty_transition_enabled", True)),
        difficulty_transition_map=doc.get("difficulty_transition_map", DEFAULT_TRANSITION_MAP),
    )
