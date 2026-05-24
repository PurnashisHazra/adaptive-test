import hmac
from typing import Any, Dict, List, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import APIKeyHeader, OAuth2PasswordBearer

from app.core.config import get_settings
from app.services.auth_service import AuthService
from app.schemas.auth import Role
from app.utils.roles import parse_role

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="auth/login", auto_error=False)
public_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)
super_admin_api_key_header = APIKeyHeader(name="X-Super-Admin-Key", auto_error=False)


def get_current_claims(token: str = Depends(oauth2_scheme)) -> Dict[str, Any]:
    try:
        claims = AuthService.decode_token(token)
        return claims
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token") from exc


async def get_optional_claims(token: Optional[str] = Depends(oauth2_scheme_optional)) -> Optional[Dict[str, Any]]:
    if not token:
        return None
    try:
        return AuthService.decode_token(token)
    except Exception:
        return None


def require_role(allowed_roles: List[Role]):
    def _dep(claims: Dict[str, Any] = Depends(get_current_claims)) -> Dict[str, Any]:
        role = parse_role(str(claims.get("role", "student")))
        if role not in allowed_roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return claims

    return _dep


require_admin = require_role([Role.admin])
require_student = require_role([Role.student])


def require_public_api_key(api_key: Optional[str] = Depends(public_api_key_header)) -> None:
    settings = get_settings()
    valid_keys = settings.public_assign_api_keys_list
    if not valid_keys:
        # Explicitly fail closed if no key is configured.
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
        # Fail closed: hidden endpoints are disabled unless explicitly configured.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Super-admin API is disabled",
        )
    if not api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing super-admin API key")
    if not any(hmac.compare_digest(api_key, k) for k in valid_keys):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid super-admin API key")

