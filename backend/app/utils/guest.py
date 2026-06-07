GUEST_PREFIX = "guest_"


def is_guest_username(username: str) -> bool:
    return str(username or "").strip().startswith(GUEST_PREFIX)
