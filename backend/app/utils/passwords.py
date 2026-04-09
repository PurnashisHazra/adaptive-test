from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _bcrypt_safe_password(password: str) -> str:
    """Trim password to bcrypt's 72-byte input limit without raising errors."""
    raw = (password or "").encode("utf-8")
    return raw[:72].decode("utf-8", errors="ignore")


def hash_password(password: str) -> str:
    return pwd_context.hash(_bcrypt_safe_password(password))


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bool(pwd_context.verify(_bcrypt_safe_password(password), password_hash))
    except Exception:
        return False

