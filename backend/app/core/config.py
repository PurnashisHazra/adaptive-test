from functools import lru_cache
from pathlib import Path
import re
from typing import List

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve `backend/.env` regardless of process cwd (uvicorn may start from repo root).
_BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent
_ENV_PATH = _BACKEND_ROOT / ".env"


def _read_openai_key_from_env_file() -> str:
    """Fallback for cases where a `.env` parser fails (e.g. spaces around `=`)."""
    if not _ENV_PATH.is_file():
        return ""
    try:
        raw = _ENV_PATH.read_text(encoding="utf-8")
    except Exception:
        return ""

    for key in ("OPENAI_API_KEY", "OPEN_API_KEY"):
        # Allow whitespace around `=`
        m = re.search(rf"(?m)^{re.escape(key)}\\s*=\\s*(.+?)\\s*$", raw)
        if m:
            v = m.group(1).strip()
            # Strip surrounding quotes if present
            if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
                v = v[1:-1].strip()
            return v
    return ""


class Settings(BaseSettings):
    """Settings load from environment / `.env`. MongoDB is reached only via connection URI."""

    model_config = SettingsConfigDict(
        env_file=str(_ENV_PATH) if _ENV_PATH.is_file() else None,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Adaptive Testing API"
    debug: bool = False
    mongodb_uri: str = Field(
        default="mongodb://localhost:27017",
        description=(
            "MongoDB connection URI (mongodb:// or mongodb+srv://). "
            "Set via env MONGODB_URI — same URI string you would pass to Mongoose in Node."
        ),
    )
    mongodb_db_name: str = "adaptive_testing"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Accept both `OPENAI_API_KEY` (preferred) and your current `OPEN_API_KEY`.
    openai_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("OPENAI_API_KEY", "OPEN_API_KEY"),
        description="OpenAI API key used to generate fresh EXPERT questions.",
    )
    openai_model: str = "gpt-4o-mini"
    openai_api_url: str = "https://api.openai.com/v1/chat/completions"

    # Auth (login/signup) JWT
    auth_jwt_secret: str = Field(
        default="dev-change-me",
        validation_alias=AliasChoices("AUTH_JWT_SECRET", "AUTH_SECRET"),
        description="JWT signing secret for issuing admin/student tokens.",
    )
    auth_jwt_expires_minutes: int = Field(
        default=60 * 24,
        validation_alias=AliasChoices("AUTH_JWT_EXPIRES_MINUTES"),
        description="JWT expiration in minutes.",
        ge=1,
        le=60 * 24 * 365,
    )
    public_assign_api_keys: str = Field(
        default="",
        validation_alias=AliasChoices("PUBLIC_ASSIGN_API_KEYS", "PUBLIC_ASSIGN_API_KEY"),
        description="Comma-separated API keys for public integration: assign-by-title and student provisioning.",
    )

    # Cloudflare R2 (S3-compatible) for question images
    r2_endpoint_url: str = Field(
        default="",
        validation_alias=AliasChoices("R2_ENDPOINT_URL"),
        description="R2 S3 API endpoint, e.g. https://<accountid>.r2.cloudflarestorage.com",
    )
    r2_access_key_id: str = Field(default="", validation_alias=AliasChoices("R2_ACCESS_KEY_ID"))
    r2_secret_access_key: str = Field(default="", validation_alias=AliasChoices("R2_SECRET_ACCESS_KEY"))
    r2_bucket: str = Field(default="", validation_alias=AliasChoices("R2_BUCKET"))
    r2_public_base_url: str = Field(
        default="",
        validation_alias=AliasChoices("R2_PUBLIC_BASE_URL"),
        description="Public URL prefix for objects (custom domain or r2.dev), no trailing slash.",
    )
    super_admin_api_keys: str = Field(
        default="",
        validation_alias=AliasChoices("SUPER_ADMIN_API_KEYS", "SUPER_ADMIN_API_KEY"),
        description="Comma-separated API keys allowed to call hidden super-admin endpoints.",
    )

    @field_validator("openai_api_key")
    @classmethod
    def _strip_openai_api_key(cls, v: str) -> str:
        v = (v or "").strip()
        if v:
            return v
        # Fallback: try reading from `.env` manually.
        return _read_openai_key_from_env_file().strip()

    default_test_question_count: int = 10
    default_test_time_limit_seconds: int = 1800

    @property
    def cors_origin_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def public_assign_api_keys_list(self) -> List[str]:
        return [k.strip() for k in self.public_assign_api_keys.split(",") if k.strip()]

    @property
    def super_admin_api_keys_list(self) -> List[str]:
        return [k.strip() for k in self.super_admin_api_keys.split(",") if k.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
