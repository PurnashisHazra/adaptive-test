from app.schemas.auth import Role


def normalize_admin_code(raw: str) -> str:
    return str(raw or "").strip().upper()


def parse_role(role_raw: str) -> Role:
    r = str(role_raw or "student").strip().lower()
    if r == "super_admin":
        return Role.super_admin
    if r == "admin":
        return Role.admin
    return Role.student
