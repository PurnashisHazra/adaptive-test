from datetime import datetime, timezone
from typing import Any, Dict, Optional

from app.core.config import get_settings
from app.db.mongodb import get_database


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


DEFAULT_CONFIG_ID = "app_config_singleton"
DEFAULT_TRANSITION_MAP = {
    "EASY": {"if_correct": "MEDIUM", "if_wrong": "EASY"},
    "MEDIUM": {"if_correct": "HARD", "if_wrong": "EASY"},
    "HARD": {"if_correct": "EXPERT", "if_wrong": "MEDIUM"},
    "EXPERT": {"if_correct": "EXPERT", "if_wrong": "HARD"},
}


class ConfigRepository:
    def __init__(self) -> None:
        self._col = get_database()["app_config"]

    async def ensure_indexes(self) -> None:
        await self._col.create_index([("_id", 1)])

    async def get_or_create(self) -> Dict[str, Any]:
        doc = await self._col.find_one({"_id": DEFAULT_CONFIG_ID})
        if doc:
            stored = int(doc.get("default_time_limit_seconds") or 0)
            desired = int(get_settings().default_test_time_limit_seconds)
            # 60s was a leftover local default and ends practice tests almost immediately.
            if stored == 60 and desired > 60:
                doc["default_time_limit_seconds"] = desired
                await self._col.update_one(
                    {"_id": DEFAULT_CONFIG_ID},
                    {"$set": {"default_time_limit_seconds": desired, "updated_at": _utc_now()}},
                )
            return doc
        settings = get_settings()
        default_doc = {
            "_id": DEFAULT_CONFIG_ID,
            "subject_filter_enabled": True,
            "topic_filter_enabled": True,
            "default_test_question_count": settings.default_test_question_count,
            "default_time_limit_seconds": settings.default_test_time_limit_seconds,
            "difficulty_wave_enabled": False,
            "difficulty_sequence": [],
            "difficulty_transition_enabled": True,
            "difficulty_transition_map": DEFAULT_TRANSITION_MAP,
            "updated_at": _utc_now(),
        }
        await self._col.insert_one(default_doc)
        return default_doc

    async def update(self, patch: Dict[str, Any]) -> Dict[str, Any]:
        patch["updated_at"] = _utc_now()
        await self._col.update_one(
            {"_id": DEFAULT_CONFIG_ID},
            {"$set": patch},
            upsert=True,
        )
        return await self.get_or_create()
