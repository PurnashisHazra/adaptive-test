GUEST_PREFIX = "guest_"
GUEST_EMAIL_REQUIRED = "Guest email required"


def is_guest_username(username: str) -> bool:
    return str(username or "").strip().startswith(GUEST_PREFIX)
