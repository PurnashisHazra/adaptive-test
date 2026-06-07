#!/usr/bin/env python3
"""Update only the password for an existing user account (role and profile unchanged)."""

from __future__ import annotations

import argparse
import asyncio
import getpass
import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_BACKEND))

try:
    from dotenv import load_dotenv

    load_dotenv(_BACKEND / ".env")
except ImportError:
    pass

from app.db.mongodb import close_client
from app.repositories.user_repository import UserRepository
from app.utils.passwords import hash_password, verify_password

MIN_PASSWORD_LEN = 8


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Change the login password for one user. All other account fields stay the same.",
    )
    p.add_argument("username", help="Account username (exact match, case-sensitive in DB)")
    p.add_argument(
        "--password",
        "-p",
        help=f"New password (min {MIN_PASSWORD_LEN} chars). If omitted, prompts securely.",
    )
    p.add_argument(
        "--yes",
        "-y",
        action="store_true",
        help="Skip confirmation prompt",
    )
    return p.parse_args()


def _read_new_password(args: argparse.Namespace) -> str:
    if args.password:
        password = args.password
    else:
        password = getpass.getpass("New password: ")
        confirm = getpass.getpass("Confirm new password: ")
        if password != confirm:
            print("Passwords do not match.", file=sys.stderr)
            sys.exit(1)
    if len(password) < MIN_PASSWORD_LEN:
        print(f"Password must be at least {MIN_PASSWORD_LEN} characters.", file=sys.stderr)
        sys.exit(1)
    return password


async def main() -> None:
    args = _parse_args()
    username = args.username.strip()
    if not username:
        print("Username is required.", file=sys.stderr)
        sys.exit(1)

    password = _read_new_password(args)

    users = UserRepository()
    user = await users.get_by_username(username)
    if not user:
        print(f"No user found with username {username!r}.", file=sys.stderr)
        close_client()
        sys.exit(1)

    role = user.get("role", "student")
    if not args.yes:
        prompt = f"Change password for {username!r} (role={role})? [y/N] "
        if input(prompt).strip().lower() not in ("y", "yes"):
            print("Aborted.")
            close_client()
            sys.exit(0)

    new_hash = hash_password(password)
    await users.update_user(username, {"password_hash": new_hash})

    # Verify write
    updated = await users.get_by_username(username)
    if not updated or not verify_password(password, updated.get("password_hash", "")):
        print("Password update failed verification.", file=sys.stderr)
        close_client()
        sys.exit(1)

    print(f"Password updated for {username!r} (role={role}). Other account fields unchanged.")
    close_client()


if __name__ == "__main__":
    asyncio.run(main())
