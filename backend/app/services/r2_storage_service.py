import asyncio
import uuid
from typing import Dict, Optional

import boto3
from botocore.config import Config
from fastapi import HTTPException, UploadFile, status

from app.core.config import get_settings

_MAX_BYTES = 5 * 1024 * 1024

# content-type -> file suffix
_CT_SUFFIX: Dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


def _suffix_from_filename(name: str) -> Optional[str]:
    lower = (name or "").lower()
    if lower.endswith(".jpg") or lower.endswith(".jpeg"):
        return ".jpg"
    if lower.endswith(".png"):
        return ".png"
    if lower.endswith(".webp"):
        return ".webp"
    if lower.endswith(".gif"):
        return ".gif"
    return None


class R2StorageService:
    """Upload images to Cloudflare R2 via the S3-compatible API."""

    def __init__(self) -> None:
        s = get_settings()
        self._endpoint = (s.r2_endpoint_url or "").strip()
        self._ak = (s.r2_access_key_id or "").strip()
        self._sk = (s.r2_secret_access_key or "").strip()
        self._bucket = (s.r2_bucket or "").strip()
        self._public_base = (s.r2_public_base_url or "").strip().rstrip("/")

    def is_configured(self) -> bool:
        return bool(self._endpoint and self._ak and self._sk and self._bucket and self._public_base)

    def _client(self):
        return boto3.client(
            "s3",
            endpoint_url=self._endpoint,
            aws_access_key_id=self._ak,
            aws_secret_access_key=self._sk,
            config=Config(signature_version="s3v4"),
            region_name="auto",
        )

    def _put_object_sync(self, key: str, body: bytes, content_type: str) -> None:
        self._client().put_object(Bucket=self._bucket, Key=key, Body=body, ContentType=content_type)

    async def upload_question_image(self, file: UploadFile) -> str:
        if not self.is_configured():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="R2 storage is not configured (set R2_ENDPOINT_URL, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL)",
            )
        raw = await file.read()
        if len(raw) > _MAX_BYTES:
            raise HTTPException(status_code=400, detail="Image too large (max 5MB)")

        ct_raw = (file.content_type or "").split(";")[0].strip().lower()
        suffix: Optional[str] = None
        content_type = ct_raw
        if ct_raw in _CT_SUFFIX:
            suffix = _CT_SUFFIX[ct_raw]
        else:
            suffix = _suffix_from_filename(file.filename or "")
            if suffix == ".jpg":
                content_type = "image/jpeg"
            elif suffix == ".png":
                content_type = "image/png"
            elif suffix == ".webp":
                content_type = "image/webp"
            elif suffix == ".gif":
                content_type = "image/gif"

        if not suffix or content_type not in _CT_SUFFIX:
            raise HTTPException(
                status_code=400,
                detail="Unsupported image type (use JPEG, PNG, WebP, or GIF)",
            )

        key = f"questions/{uuid.uuid4().hex}{suffix}"
        await asyncio.to_thread(self._put_object_sync, key, raw, content_type)
        return f"{self._public_base}/{key}"
