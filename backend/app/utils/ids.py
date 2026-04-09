from typing import Optional, Union

from bson import ObjectId


def oid_str(oid: Union[ObjectId, str]) -> str:
    return str(oid)


def try_object_id(value: str) -> Optional[ObjectId]:
    try:
        return ObjectId(value)
    except Exception:
        return None
