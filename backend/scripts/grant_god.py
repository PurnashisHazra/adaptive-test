#!/usr/bin/env python3
"""Promote an existing user to the god role."""

import argparse
import asyncio
import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_BACKEND))

try:
    from dotenv import load_dotenv

    load_dotenv(_BACKEND / ".env")
except ImportError:
    pass

from app.repositories.user_repository import UserRepository
from app.schemas.auth import Role
from app.db.mongodb import close_client


async def main() -> None:
    parser = argparse.ArgumentParser(description="Grant the god role to an existing username")
    parser.add_argument("username", help="Existing account username")
    args = parser.parse_args()
    users = UserRepository()
    user = await users.get_by_username(args.username)
    if not user:
        raise SystemExit(f"User {args.username!r} not found")
    await users.update_user(
        args.username,
        {"role": Role.god.value, "admin_code": None, "assigned_admin_code": None},
    )
    print(f"Granted god role to {args.username}")
    await close_client()


if __name__ == "__main__":
    asyncio.run(main())
