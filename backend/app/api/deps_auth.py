import hmac
from typing import Any, Dict, List, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import APIKeyHeader, OAuth2PasswordBearer

from app.core.config import get_settings
from app.repositories.user_repository import UserRepository
from app.services.auth_service import AuthService
from app.schemas.auth import Role
from app.utils.roles import parse_role

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")
public_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)
super_admin_api_key_header = APIKeyHeader(name="X-Super-Admin-Key", auto_error=False)


def get_current_claims(token: str = Depends(oauth2_scheme)) -> Dict[str, Any]:
    try:
        claims = AuthService.decode_token(token)
        return claims
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token") from exc


def require_role(allowed_roles: List[Role]):
    def _dep(claims: Dict[str, Any] = Depends(get_current_claims)) -> Dict[str, Any]:
        role = parse_role(str(claims.get("role", "student")))
        if role not in allowed_roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return claims

    return _dep


require_admin = require_role([Role.admin])
require_super_admin = require_role([Role.super_admin])
require_student = require_role([Role.student])


async def require_student_with_admin_code(claims: Dict[str, Any] = Depends(require_student)) -> Dict[str, Any]:
    username = str(claims.get("sub", "")).strip()
    user = await UserRepository().get_by_username(username)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if not user.get("assigned_admin_code"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin code required. Link your account to an instructor before continuing.",
        )
    return claims


def require_public_api_key(api_key: Optional[str] = Depends(public_api_key_header)) -> None:
    settings = get_settings()
    valid_keys = settings.public_assign_api_keys_list
    if not valid_keys:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Public assignment API is disabled",
        )
    if not api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing API key")
    if not any(hmac.compare_digest(api_key, k) for k in valid_keys):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")


def require_super_admin_api_key(api_key: Optional[str] = Depends(super_admin_api_key_header)) -> None:
    settings = get_settings()
    valid_keys = settings.super_admin_api_keys_list
    if not valid_keys:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Super-admin API is disabled",
        )
    if not api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing super-admin API key")
    if not any(hmac.compare_digest(api_key, k) for k in valid_keys):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid super-admin API key")
