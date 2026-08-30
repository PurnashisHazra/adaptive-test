from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from bson import ObjectId
from bson.errors import InvalidId

from app.db.mongodb import get_database

_COL_NAME = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,120}$")
_REDACT = "***redacted***"


def _jsonable(value: Any) -> Any:
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, bytes):
        return None
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_jsonable(v) for v in value]
    if isinstance(value, tuple):
        return [_jsonable(v) for v in value]
    return value


def _parse_oid(raw: str) -> ObjectId:
    try:
        return ObjectId(str(raw).strip())
    except (InvalidId, TypeError) as exc:
        raise ValueError("Invalid document id") from exc


def _restore_ids(value: Any) -> Any:
    if isinstance(value, dict):
        out: Dict[str, Any] = {}
        for k, v in value.items():
            if k == "_id" and isinstance(v, str) and ObjectId.is_valid(v):
                out[k] = ObjectId(v)
            else:
                out[k] = _restore_ids(v)
        return out
    if isinstance(value, list):
        return [_restore_ids(v) for v in value]
    return value


class GodDatabaseService:
    def _db(self):
        return get_database()

    def _collection(self, name: str):
        if not _COL_NAME.match(name):
            raise ValueError("Invalid collection name")
        return self._db()[name]

    async def list_collections(self) -> List[Dict[str, Any]]:
        names = await self._db().list_collection_names()
        out: List[Dict[str, Any]] = []
        for name in sorted(names):
            if name.startswith("system."):
                continue
            count = await self._db()[name].estimated_document_count()
            out.append({"name": name, "estimated_count": int(count)})
        return out

    def _public_doc(self, doc: Dict[str, Any]) -> Dict[str, Any]:
        data = _jsonable(doc)
        if isinstance(data, dict) and "password_hash" in data:
            data["password_hash"] = _REDACT
        return data

    async def list_documents(self, collection: str, *, page: int = 1, page_size: int = 25) -> Tuple[int, List[Dict[str, Any]]]:
        col = self._collection(collection)
        page = max(1, int(page))
        page_size = max(1, min(int(page_size), 100))
        total = await col.count_documents({})
        skip = (page - 1) * page_size
        cur = col.find({}).skip(skip).limit(page_size)
        rows = [self._public_doc(d) async for d in cur]
        return total, rows

    async def get_document(self, collection: str, doc_id: str) -> Dict[str, Any]:
        col = self._collection(collection)
        doc = await col.find_one({"_id": _parse_oid(doc_id)})
        if not doc:
            raise ValueError("Document not found")
        return self._public_doc(doc)

    async def create_document(self, collection: str, body: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(body, dict):
            raise ValueError("Document must be a JSON object")
        payload = _restore_ids(dict(body))
        payload.pop("_id", None)
        if collection == "users" and payload.get("password_hash") == _REDACT:
            raise ValueError("Provide a real password_hash or omit it")
        col = self._collection(collection)
        result = await col.insert_one(payload)
        created = await col.find_one({"_id": result.inserted_id})
        assert created is not None
        return self._public_doc(created)

    async def replace_document(self, collection: str, doc_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(body, dict):
            raise ValueError("Document must be a JSON object")
        oid = _parse_oid(doc_id)
        col = self._collection(collection)
        existing = await col.find_one({"_id": oid})
        if not existing:
            raise ValueError("Document not found")
        payload = _restore_ids(dict(body))
        payload["_id"] = oid
        if collection == "users" and payload.get("password_hash") == _REDACT:
            payload["password_hash"] = existing.get("password_hash")
        await col.replace_one({"_id": oid}, payload)
        updated = await col.find_one({"_id": oid})
        assert updated is not None
        return self._public_doc(updated)

    async def delete_document(self, collection: str, doc_id: str) -> None:
        oid = _parse_oid(doc_id)
        col = self._collection(collection)
        existing = await col.find_one({"_id": oid})
        if not existing:
            raise ValueError("Document not found")
        if collection == "users" and str(existing.get("role") or "") == "god":
            gods = await self._db()["users"].count_documents({"role": "god"})
            if gods <= 1:
                raise ValueError("Cannot delete the last god account")
        result = await col.delete_one({"_id": oid})
        if result.deleted_count == 0:
            raise ValueError("Document not found")
