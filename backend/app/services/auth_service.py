import jwt
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from app.core.config import get_settings
from app.repositories.user_repository import UserRepository
from app.schemas.auth import AuthResponse, AuthUser, ClaimAdminCodeRequest, LoginRequest, Role, SignupRequest
from app.utils.passwords import hash_password, verify_password
from app.services.admin_limits_service import AdminLimitsService
from app.utils.roles import normalize_admin_code, parse_role


def normalize_mobile(raw: Optional[str]) -> Optional[str]:
    if raw is None:
        return None
    digits = "".join(ch for ch in str(raw) if ch.isdigit())
    return digits or None


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


def _user_to_auth_user(user: Dict[str, Any]) -> AuthUser:
    role = parse_role(user.get("role", "student"))
    assigned = user.get("assigned_admin_code")
    needs = role == Role.student and not assigned
    mobile = user.get("mobile")
    return AuthUser(
        username=user["username"],
        role=role,
        needs_admin_code=needs,
        assigned_admin_code=str(assigned) if assigned else None,
        admin_code=str(user.get("admin_code")) if user.get("admin_code") else None,
        mobile=str(mobile) if mobile else None,
    )


class AuthService:
    def __init__(self) -> None:
        self._users = UserRepository()

    async def signup(self, req: SignupRequest) -> AuthResponse:
        role_key = (req.role_key or "").strip().lower()
        if role_key in ("admin", "super_admin"):
            raise ValueError("Cannot self-register as admin. Ask a super admin to assign your role.")

        existing = await self._users.get_by_username(req.username.strip())
        if existing:
            raise ValueError("Username already exists")

        mobile = normalize_mobile(req.mobile)
        user_doc = {
            "username": req.username.strip(),
            "role": Role.student.value,
            "password_hash": hash_password(req.password),
        }
        if mobile:
            user_doc["mobile"] = mobile
        await self._users.insert_user(user_doc)
        from app.services.public_profile_service import PublicProfileService

        await PublicProfileService().ensure_for_student(user_doc["username"])
        role = Role.student
        token = _make_token(username=user_doc["username"], role=role)
        return AuthResponse(token=token, user=_user_to_auth_user(user_doc))

    async def login(self, req: LoginRequest) -> AuthResponse:
        user = await self._users.get_by_username(req.username.strip())
        if not user:
            raise ValueError("Invalid username or password")
        if not verify_password(req.password, user.get("password_hash", "")):
            raise ValueError("Invalid username or password")

        role = parse_role(user.get("role", "student"))
        token = _make_token(username=user["username"], role=role)
        return AuthResponse(token=token, user=_user_to_auth_user(user))

    async def get_me(self, username: str) -> AuthUser:
        user = await self._users.get_by_username(username)
        if not user:
            raise ValueError("User not found")
        return _user_to_auth_user(user)

    async def claim_admin_code(self, username: str, req: ClaimAdminCodeRequest) -> AuthUser:
        user = await self._users.get_by_username(username)
        if not user:
            raise ValueError("User not found")
        if parse_role(user.get("role", "student")) != Role.student:
            raise ValueError("Only students need an admin code")

        if user.get("assigned_admin_code"):
            raise ValueError("Admin code already set for this account")

        code = normalize_admin_code(req.admin_code)
        admin = await self._users.get_admin_by_code(code)
        if not admin:
            raise ValueError("Invalid admin code. Check with your instructor.")

        await AdminLimitsService().assert_can_add_student(code)

        updated = await self._users.update_user(
            username,
            {"assigned_admin_code": admin["admin_code"]},
        )
        assert updated is not None
        return _user_to_auth_user(updated)

    async def ensure_indexes(self) -> None:
        await self._users.ensure_indexes()

    @staticmethod
    def decode_token(token: str) -> Dict[str, Any]:
        settings = get_settings()
        return jwt.decode(token, settings.auth_jwt_secret, algorithms=["HS256"])
