import re
import uuid
from pathlib import Path
from typing import List, Optional

from fastapi import HTTPException, UploadFile

from app.repositories.leader_connect_repository import LeaderConnectRepository
from app.schemas.leader_connect_request import LeaderConnectRequestAdminItem, LeaderConnectRequestOut
from app.utils.ids import oid_str

_CV_DIR = Path(__file__).resolve().parents[2] / "data" / "leader_connect_cvs"
_MAX_CV_BYTES = 5 * 1024 * 1024
_ALLOWED_CV_SUFFIXES = {".pdf", ".doc", ".docx"}


def _safe_mobile(raw: str) -> str:
    digits = re.sub(r"\D", "", raw.strip())
    if len(digits) < 10:
        raise ValueError("Enter a valid 10-digit mobile number")
    return digits


def _suffix_for_upload(filename: str, content_type: str) -> str:
    lower = (filename or "").lower()
    for suffix in _ALLOWED_CV_SUFFIXES:
        if lower.endswith(suffix):
            return suffix
    ct = (content_type or "").split(";")[0].strip().lower()
    if ct == "application/pdf":
        return ".pdf"
    if ct == "application/msword":
        return ".doc"
    if ct == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return ".docx"
    raise ValueError("CV must be PDF, DOC, or DOCX")


class LeaderConnectService:
    def __init__(self) -> None:
        self._repo = LeaderConnectRepository()

    async def ensure_indexes(self) -> None:
        await self._repo.ensure_indexes()
        _CV_DIR.mkdir(parents=True, exist_ok=True)

    async def create(
        self,
        *,
        company_clicked: str,
        main_topic: str,
        company_interested_in: str,
        mobile: str,
        cv_file: Optional[UploadFile],
        student_username: Optional[str] = None,
    ) -> LeaderConnectRequestOut:
        topic = main_topic.strip()
        if len(topic) < 10:
            raise ValueError("Please describe your main topic (at least 10 characters)")
        company = company_interested_in.strip()
        if len(company) < 2:
            raise ValueError("Company interested in is required")
        clicked = company_clicked.strip()
        if len(clicked) < 2:
            raise ValueError("Company selection is required")

        cv_filename: Optional[str] = None
        cv_storage_key: Optional[str] = None
        if cv_file and cv_file.filename:
            raw = await cv_file.read()
            if len(raw) > _MAX_CV_BYTES:
                raise ValueError("CV file too large (max 5MB)")
            suffix = _suffix_for_upload(cv_file.filename, cv_file.content_type or "")
            cv_storage_key = f"{uuid.uuid4().hex}{suffix}"
            cv_filename = Path(cv_file.filename).name
            _CV_DIR.mkdir(parents=True, exist_ok=True)
            (_CV_DIR / cv_storage_key).write_bytes(raw)

        rid = await self._repo.insert(
            {
                "company_clicked": clicked,
                "main_topic": topic,
                "company_interested_in": company,
                "mobile": _safe_mobile(mobile),
                "cv_filename": cv_filename,
                "cv_storage_key": cv_storage_key,
                "student_username": student_username.strip() if student_username else None,
            }
        )
        row = await self._repo.get(rid)
        assert row is not None
        return self._to_out(row)

    async def list_admin(self) -> List[LeaderConnectRequestAdminItem]:
        rows = await self._repo.list_for_admin()
        return [self._to_admin_item(r) for r in rows]

    async def mark_reviewed(self, request_id: str) -> LeaderConnectRequestOut:
        ok = await self._repo.mark_reviewed(request_id)
        if not ok:
            raise ValueError("Request not found or already reviewed")
        row = await self._repo.get(request_id)
        assert row is not None
        return self._to_out(row)

    def cv_path_for_row(self, row: dict) -> Path:
        key = row.get("cv_storage_key")
        if not key:
            raise HTTPException(status_code=404, detail="No CV attached")
        path = _CV_DIR / str(key)
        if not path.is_file():
            raise HTTPException(status_code=404, detail="CV file missing")
        return path

    async def get_row(self, request_id: str) -> Optional[dict]:
        return await self._repo.get(request_id)

    @staticmethod
    def _to_out(row: dict) -> LeaderConnectRequestOut:
        return LeaderConnectRequestOut(
            id=oid_str(row["_id"]),
            company_clicked=str(row["company_clicked"]),
            main_topic=str(row["main_topic"]),
            company_interested_in=str(row["company_interested_in"]),
            mobile=str(row["mobile"]),
            cv_filename=row.get("cv_filename"),
            student_username=row.get("student_username"),
            status=str(row.get("status", "pending")),  # type: ignore[arg-type]
            created_at=row["created_at"],
        )

    @staticmethod
    def _to_admin_item(row: dict) -> LeaderConnectRequestAdminItem:
        rid = oid_str(row["_id"])
        has_cv = bool(row.get("cv_storage_key"))
        return LeaderConnectRequestAdminItem(
            id=rid,
            company_clicked=str(row["company_clicked"]),
            main_topic=str(row["main_topic"]),
            company_interested_in=str(row["company_interested_in"]),
            mobile=str(row["mobile"]),
            cv_filename=row.get("cv_filename"),
            cv_download_url=f"/api/admin/leader-connect/requests/{rid}/cv" if has_cv else None,
            student_username=row.get("student_username"),
            status=str(row.get("status", "pending")),  # type: ignore[arg-type]
            created_at=row["created_at"],
        )
