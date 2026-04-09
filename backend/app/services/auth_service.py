import jwt
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from app.core.config import get_settings
from app.repositories.user_repository import UserRepository
from app.schemas.auth import AuthResponse, AuthUser, LoginRequest, Role, SignupRequest
from app.utils.passwords import hash_password, verify_password


def _make_token(*, username: str, role: Role) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=settings.auth_jwt_expires_minutes)
    payload = {
        "sub": username,
        "role": role.value,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    return jwt.encode(payload, settings.auth_jwt_secret, algorithm="HS256")


class AuthService:
    def __init__(self) -> None:
        self._users = UserRepository()

    async def signup(self, req: SignupRequest) -> AuthResponse:
        role = Role.admin if (req.role_key or "").strip().lower() == "admin" else Role.student
        existing = await self._users.get_by_username(req.username.strip())
        if existing:
            raise ValueError("Username already exists")

        user_doc = {
            "username": req.username.strip(),
            "role": role.value,
            "password_hash": hash_password(req.password),
        }
        await self._users.insert_user(user_doc)
        token = _make_token(username=user_doc["username"], role=role)
        return AuthResponse(token=token, user=AuthUser(username=user_doc["username"], role=role))

    async def login(self, req: LoginRequest) -> AuthResponse:
        user = await self._users.get_by_username(req.username.strip())
        if not user:
            raise ValueError("Invalid username or password")
        if not verify_password(req.password, user.get("password_hash", "")):
            raise ValueError("Invalid username or password")

        role_raw = str(user.get("role", "student")).strip().lower()
        role = Role.admin if role_raw == "admin" else Role.student
        token = _make_token(username=user["username"], role=role)
        return AuthResponse(token=token, user=AuthUser(username=user["username"], role=role))

    async def ensure_indexes(self) -> None:
        await self._users.ensure_indexes()

    @staticmethod
    def decode_token(token: str) -> Dict[str, Any]:
        settings = get_settings()
        return jwt.decode(token, settings.auth_jwt_secret, algorithms=["HS256"])

