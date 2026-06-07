"""Resolve student JWT or guest header for challenge flows."""

from typing import Optional, Tuple

from fastapi import Depends, Header, HTTPException, Query, status

from app.api.deps_auth import get_optional_claims

from app.utils.guest import GUEST_PREFIX, is_guest_username


def normalize_guest_id(raw: str) -> str:
    gid = str(raw or "").strip()
    if not gid.startswith(GUEST_PREFIX):
        gid = f"{GUEST_PREFIX}{gid}"
    if len(gid) < 10 or len(gid) > 80:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid guest session id")
    safe = gid[len(GUEST_PREFIX) :]
    if not safe or not all(c.isalnum() or c in "-_" for c in safe):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid guest session id")
    return gid


async def get_challenge_actor(
    claims: Optional[dict] = Depends(get_optional_claims),
    x_guest_id: Optional[str] = Header(None, alias="X-Guest-Id"),
) -> Tuple[str, bool]:
    """Returns (username, is_guest)."""
    if claims and str(claims.get("role", "")).strip().lower() == "student":
        return str(claims.get("sub", "")).strip(), False
    if x_guest_id:
        return normalize_guest_id(x_guest_id), True
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Sign in or start as guest with a valid session",
    )


async def get_optional_challenge_actor(
    claims: Optional[dict] = Depends(get_optional_claims),
    x_guest_id: Optional[str] = Header(None, alias="X-Guest-Id"),
    guest_id: Optional[str] = Query(None),
) -> Tuple[Optional[str], bool]:
    """Catalog: optional student or guest query param."""
    if claims and str(claims.get("role", "")).strip().lower() == "student":
        return str(claims.get("sub", "")).strip(), False
    raw = (x_guest_id or guest_id or "").strip()
    if raw:
        return normalize_guest_id(raw), True
    return None, False
