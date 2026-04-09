from typing import Any, Dict, List, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from app.core.config import get_settings
from app.services.auth_service import AuthService
from app.schemas.auth import Role

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")


def get_current_claims(token: str = Depends(oauth2_scheme)) -> Dict[str, Any]:
    try:
        claims = AuthService.decode_token(token)
        return claims
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token") from exc


def require_role(allowed_roles: List[Role]):
    def _dep(claims: Dict[str, Any] = Depends(get_current_claims)) -> Dict[str, Any]:
        role_raw = str(claims.get("role", "student")).strip().lower()
        role = Role.admin if role_raw == "admin" else Role.student
        if role not in allowed_roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return claims

    return _dep


require_admin = require_role([Role.admin])

