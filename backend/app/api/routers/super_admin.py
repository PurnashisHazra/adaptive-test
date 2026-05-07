import re
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.deps_auth import require_super_admin_api_key
from app.core.config import get_settings
from app.db.mongodb import get_database

router = APIRouter(
    prefix="/super-admin",
    tags=["super-admin"],
    dependencies=[Depends(require_super_admin_api_key)],
)

_COLLECTION_RE = re.compile(r"^[A-Za-z0-9_.-]{1,128}$")


def _validate_collection_name(name: str) -> str:
    col = (name or "").strip()
    if not _COLLECTION_RE.match(col):
        raise HTTPException(status_code=400, detail="Invalid collection name")
    return col


class DropDatabaseRequest(BaseModel):
    confirm_database_name: str = Field(..., min_length=1, description="Must exactly match configured database name.")


class DropCollectionRequest(BaseModel):
    collection: str = Field(..., min_length=1)
    confirm_collection_name: str = Field(..., min_length=1, description="Must exactly match `collection`.")


class DeleteManyRequest(BaseModel):
    collection: str = Field(..., min_length=1)
    filter: Dict[str, Any] = Field(default_factory=dict)


class UpdateManyRequest(BaseModel):
    collection: str = Field(..., min_length=1)
    filter: Dict[str, Any] = Field(default_factory=dict)
    update: Dict[str, Any] = Field(..., description="MongoDB update document (e.g. {'$set': {...}}).")
    upsert: bool = False


@router.get("/collections", include_in_schema=False)
async def list_collections() -> List[str]:
    db = get_database()
    return sorted(await db.list_collection_names())


@router.post("/database/drop", include_in_schema=False)
async def drop_database(body: DropDatabaseRequest) -> Dict[str, Any]:
    settings = get_settings()
    expected = settings.mongodb_db_name
    if body.confirm_database_name.strip() != expected:
        raise HTTPException(status_code=400, detail="Confirmation mismatch")
    db = get_database()
    await db.client.drop_database(expected)
    return {"ok": True, "dropped_database": expected}


@router.post("/collections/drop", include_in_schema=False)
async def drop_collection(body: DropCollectionRequest) -> Dict[str, Any]:
    col = _validate_collection_name(body.collection)
    if body.confirm_collection_name.strip() != col:
        raise HTTPException(status_code=400, detail="Confirmation mismatch")
    db = get_database()
    await db.drop_collection(col)
    return {"ok": True, "dropped_collection": col}


@router.post("/collections/delete-many", include_in_schema=False)
async def delete_many(body: DeleteManyRequest) -> Dict[str, Any]:
    col = _validate_collection_name(body.collection)
    db = get_database()
    result = await db[col].delete_many(body.filter or {})
    return {"ok": True, "collection": col, "deleted_count": result.deleted_count}


@router.post("/collections/update-many", include_in_schema=False)
async def update_many(body: UpdateManyRequest) -> Dict[str, Any]:
    col = _validate_collection_name(body.collection)
    if not body.update:
        raise HTTPException(status_code=400, detail="update payload required")
    if not any(str(k).startswith("$") for k in body.update.keys()):
        raise HTTPException(status_code=400, detail="update must contain at least one MongoDB operator key")
    db = get_database()
    result = await db[col].update_many(body.filter or {}, body.update, upsert=body.upsert)
    return {
        "ok": True,
        "collection": col,
        "matched_count": result.matched_count,
        "modified_count": result.modified_count,
        "upserted_id": str(result.upserted_id) if result.upserted_id else None,
    }
