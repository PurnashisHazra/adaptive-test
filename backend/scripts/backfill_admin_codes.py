#!/usr/bin/env python3
"""Assign unique admin_code to every admin user that does not have one."""

import asyncio
import secrets
import sys
from pathlib import Path
from typing import Optional

_BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_BACKEND))

try:
    from dotenv import load_dotenv

    load_dotenv(_BACKEND / ".env")
except ImportError:
    pass

from app.db.mongodb import close_client, get_database
from app.repositories.user_repository import UserRepository
from app.utils.roles import normalize_admin_code


async def _new_unique_code(users: UserRepository, *, except_username: Optional[str] = None) -> str:
    for _ in range(30):
        code = normalize_admin_code(secrets.token_hex(3))
        if not await users.admin_code_taken(code, except_username=except_username):
            return code
    raise RuntimeError("Could not generate a unique admin code")


async def main() -> None:
    users = UserRepository()
    await users.ensure_indexes()
    admins = await users.list_by_role("admin", limit=5000)
    updated = 0
    for doc in admins:
        username = doc["username"]
        if doc.get("admin_code"):
            continue
        code = await _new_unique_code(users, except_username=username)
        await users.update_user(username, {"admin_code": code})
        print(f"{username}: {code}")
        updated += 1
    print(f"Done. Assigned admin codes to {updated} admin(s).")
    close_client()


if __name__ == "__main__":
    asyncio.run(main())
