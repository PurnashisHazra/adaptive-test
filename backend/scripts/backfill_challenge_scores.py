#!/usr/bin/env python3
"""
Assign random ranked scores to every student who has a challenge_attempt record.

Use this to populate the percentile cohort so new real finishers get a live percentile
immediately (vs all other scored attempts on that challenge).

Usage (from backend/):
  .venv/bin/python scripts/backfill_challenge_scores.py
  .venv/bin/python scripts/backfill_challenge_scores.py --dry-run
  .venv/bin/python scripts/backfill_challenge_scores.py --refresh-all  # overwrite existing scores
  .venv/bin/python scripts/backfill_challenge_scores.py --challenge-id CHALLENGE_OID

Does not create users or challenges — only updates challenge_attempts.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import random
import sys
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

_BACKEND = Path(__file__).resolve().parents[1]
_SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(_BACKEND))
sys.path.insert(0, str(_SCRIPTS))

try:
    from dotenv import load_dotenv

    load_dotenv(_BACKEND / ".env")
except ImportError:
    pass

from app.core.config import get_settings
from app.db.mongodb import close_client, get_database
from app.repositories.challenge_repository import ChallengeRepository
from app.utils.ids import oid_str
from challenge_ranked_scores import attempt_is_ranked, write_ranked_challenge_attempt


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


async def backfill_challenge_scores(
    *,
    dry_run: bool,
    only_missing: bool,
    challenge_id_filter: Optional[str],
    rng: random.Random,
    limit: int,
) -> None:
    challenges = ChallengeRepository()
    now = _utc_now()

    filt: Dict[str, Any] = {}
    if challenge_id_filter:
        filt["challenge_id"] = challenge_id_filter.strip()

    cursor = challenges._attempts.find(filt).limit(limit)
    attempt_docs = [doc async for doc in cursor]

    if not attempt_docs:
        print("No challenge attempts found.")
        return

    challenge_cache: Dict[str, Dict[str, Any]] = {}
    written = 0
    skipped_ranked = 0
    skipped_no_challenge = 0
    errors: List[str] = []

    print(f"Found {len(attempt_docs)} challenge attempt(s). only_missing={only_missing}, dry_run={dry_run}")

    for att in attempt_docs:
        cid = str(att.get("challenge_id", "")).strip()
        uname = str(att.get("student_username", "")).strip()
        if not cid or not uname:
            continue

        if only_missing and attempt_is_ranked(att):
            skipped_ranked += 1
            continue

        if cid not in challenge_cache:
            ch = await challenges.get_challenge(cid)
            if not ch:
                skipped_no_challenge += 1
                errors.append(f"missing challenge {cid} for {uname}")
                continue
            challenge_cache[cid] = ch

        ch = challenge_cache[cid]
        title = str(ch.get("title", cid))

        try:
            if dry_run:
                print(f"  ~ would score {uname} on {title!r}")
                written += 1
                continue

            marks = await write_ranked_challenge_attempt(
                challenges,
                challenge_id=cid,
                challenge=ch,
                student_username=uname,
                rng=rng,
                now=now,
                existing_attempt=att,
                extra_fields={"synthetic_ranked_score": True},
            )
            written += 1
            print(f"  + {uname} @ {title}: {marks:.2f} marks")
        except Exception as e:
            msg = f"{uname}@{cid}: {e}"
            errors.append(msg)
            print(f"  ! {msg}")
            traceback.print_exc()

    ranked_total = 0
    for cid in challenge_cache:
        ranked_total += len(await challenges.list_ranked_attempts_for_challenge(cid))

    print("--- Summary ---")
    print(f"Scored (or planned): {written}")
    print(f"Skipped (already ranked): {skipped_ranked}")
    print(f"Skipped (challenge missing): {skipped_no_challenge}")
    print(f"Ranked attempts across touched challenges: {ranked_total}")
    if errors:
        print(f"Errors: {len(errors)}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backfill random ranked scores for all students with challenge attempts."
    )
    parser.add_argument("--dry-run", action="store_true", help="Print plan only; no DB writes")
    parser.add_argument(
        "--refresh-all",
        action="store_true",
        help="Overwrite scores even when an attempt is already ranked (default: only fill missing)",
    )
    parser.add_argument("--challenge-id", default=None, help="Only process attempts for this challenge id")
    parser.add_argument("--limit", type=int, default=10000, help="Max attempt documents to scan")
    parser.add_argument("--seed", type=int, default=None, help="RNG seed (default: time-based)")
    args = parser.parse_args()

    if not os.environ.get("MONGODB_URI"):
        os.environ["MONGODB_URI"] = "mongodb://localhost:27017"

    settings = get_settings()
    print(f"Database: {settings.mongodb_db_name}")

    seed_val = args.seed if args.seed is not None else int(time.time() * 1000)
    rng = random.Random(seed_val)
    print(f"RNG seed: {seed_val}")

    async def run() -> None:
        try:
            await backfill_challenge_scores(
                dry_run=args.dry_run,
                only_missing=not args.refresh_all,
                challenge_id_filter=args.challenge_id,
                rng=rng,
                limit=args.limit,
            )
        finally:
            await close_client()

    asyncio.run(run())


if __name__ == "__main__":
    main()
