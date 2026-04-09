import csv
import io
import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.api.deps import get_student_history_service
from app.repositories.attempt_repository import AttemptRepository
from app.schemas.attempt import AttemptListItem, StudentHistoryStats
from app.services.student_history_service import StudentHistoryService
from app.utils.ids import oid_str, try_object_id
from app.api.deps_auth import get_current_claims, require_admin

router = APIRouter(prefix="/attempts", tags=["attempts"])


def _attempt_repo() -> AttemptRepository:
    return AttemptRepository()


@router.get("", response_model=List[AttemptListItem])
async def list_attempts(
    student_name: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    repo: AttemptRepository = Depends(_attempt_repo),
    _: Any = Depends(require_admin),
) -> List[AttemptListItem]:
    rows = await repo.list_recent(limit=limit, student_name=student_name)
    out: List[AttemptListItem] = []
    for a in rows:
        tq = int(a.get("total_questions", 1))
        sc = int(a.get("score", 0))
        pct = (sc / tq * 100.0) if tq else 0.0
        out.append(
            AttemptListItem(
                id=oid_str(a["_id"]),
                student_name=a.get("student_name", ""),
                status=a.get("status", ""),
                score=sc,
                total_questions=tq,
                percentage=round(pct, 2),
                subject=a.get("subject_filter"),
                topic=a.get("topic_filter"),
                started_at=a["started_at"],
                completed_at=a.get("completed_at"),
            )
        )
    return out


@router.get("/export")
async def export_attempts(
    export_format: str = Query("csv", alias="format", pattern="^(csv|json)$"),
    repo: AttemptRepository = Depends(_attempt_repo),
    _: Any = Depends(require_admin),
):
    rows = await repo.find_all(limit=10000)
    if export_format == "json":
        payload = []
        for a in rows:
            a = dict(a)
            a["id"] = str(a.pop("_id"))
            payload.append(a)
        data = json.dumps(payload, default=str).encode("utf-8")
        return StreamingResponse(
            iter([data]),
            media_type="application/json",
            headers={"Content-Disposition": 'attachment; filename="attempts.json"'},
        )

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(
        [
            "id",
            "student_name",
            "status",
            "score",
            "total_questions",
            "percentage",
            "started_at",
            "completed_at",
        ]
    )
    for a in rows:
        tq = int(a.get("total_questions", 1))
        sc = int(a.get("score", 0))
        pct = (sc / tq * 100.0) if tq else 0.0
        w.writerow(
            [
                str(a["_id"]),
                a.get("student_name", ""),
                a.get("status", ""),
                sc,
                tq,
                round(pct, 2),
                a.get("started_at"),
                a.get("completed_at"),
            ]
        )
    data = buf.getvalue().encode("utf-8")
    return StreamingResponse(
        iter([data]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="attempts.csv"'},
    )


@router.get("/me/history", response_model=StudentHistoryStats)
async def my_student_history(
    claims: dict = Depends(get_current_claims),
    svc: StudentHistoryService = Depends(get_student_history_service),
) -> StudentHistoryStats:
    """History for the authenticated user only (JWT sub = username)."""
    me = str(claims.get("sub", "")).strip()
    if not me:
        raise HTTPException(status_code=401, detail="Invalid token")
    return await svc.get_history(me)


@router.get("/students/{student_name}", response_model=StudentHistoryStats)
async def student_history(
    student_name: str,
    _claims: dict = Depends(require_admin),
    svc: StudentHistoryService = Depends(get_student_history_service),
) -> StudentHistoryStats:
    return await svc.get_history(student_name)


@router.get("/{attempt_id}")
async def get_attempt(
    attempt_id: str,
    repo: AttemptRepository = Depends(_attempt_repo),
    _: Any = Depends(require_admin),
) -> Dict[str, Any]:
    oid = try_object_id(attempt_id)
    if oid is None:
        raise HTTPException(status_code=400, detail="Invalid attempt id")
    doc = await repo.get(attempt_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Attempt not found")
    out = dict(doc)
    out["id"] = str(out.pop("_id"))
    return out
