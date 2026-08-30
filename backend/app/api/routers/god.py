from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.deps_auth import require_god
from app.services.god_db_service import GodDatabaseService

router = APIRouter(prefix="/god", tags=["god"], dependencies=[Depends(require_god)])


class GodCollectionInfo(BaseModel):
    name: str
    estimated_count: int


class GodDocumentPage(BaseModel):
    collection: str
    total: int
    page: int
    page_size: int
    documents: List[Dict[str, Any]]


class GodDocumentBody(BaseModel):
    document: Dict[str, Any] = Field(default_factory=dict)


def _svc() -> GodDatabaseService:
    return GodDatabaseService()


@router.get("/collections", response_model=List[GodCollectionInfo])
async def list_collections() -> List[GodCollectionInfo]:
    rows = await _svc().list_collections()
    return [GodCollectionInfo(**row) for row in rows]


@router.get("/collections/{collection}/documents", response_model=GodDocumentPage)
async def list_documents(
    collection: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
) -> GodDocumentPage:
    try:
        total, docs = await _svc().list_documents(collection, page=page, page_size=page_size)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return GodDocumentPage(
        collection=collection,
        total=total,
        page=page,
        page_size=page_size,
        documents=docs,
    )


@router.get("/collections/{collection}/documents/{doc_id}")
async def get_document(collection: str, doc_id: str) -> Dict[str, Any]:
    try:
        return await _svc().get_document(collection, doc_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.post("/collections/{collection}/documents")
async def create_document(collection: str, body: GodDocumentBody) -> Dict[str, Any]:
    try:
        return await _svc().create_document(collection, body.document)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.put("/collections/{collection}/documents/{doc_id}")
async def replace_document(collection: str, doc_id: str, body: GodDocumentBody) -> Dict[str, Any]:
    try:
        return await _svc().replace_document(collection, doc_id, body.document)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.delete("/collections/{collection}/documents/{doc_id}")
async def delete_document(collection: str, doc_id: str) -> Dict[str, str]:
    try:
        await _svc().delete_document(collection, doc_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"status": "deleted"}
