#!/usr/bin/env python3
"""Create landing-page showcase question papers in MongoDB (idempotent)."""

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

from app.db.mongodb import close_client
from app.services.landing_showcase_service import LandingShowcaseService


async def main() -> None:
    svc = LandingShowcaseService()
    await svc.ensure_showcase_papers()
    print("Landing showcase papers ensured.")
    await close_client()


if __name__ == "__main__":
    asyncio.run(main())
