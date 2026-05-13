#!/usr/bin/env python3
"""
Find exact duplicate questions (same ``question_text_norm`` as the rest of the app) and optionally delete extras.

- Groups by normalized question text (lowercase, whitespace collapsed).
- Keeps the **oldest** document per group (by ``created_at``, then ``_id``).
- Prints a table: preview text, occurrence count, how many will be removed.
- Requires typing ``DELETE DUPLICATES`` to perform deletion (unless ``--dry-run``).

Usage (from repo root or backend/):

  python3 scripts/dedupe_questions.py              # report + confirm delete
  python3 scripts/dedupe_questions.py --dry-run      # report only

Requires ``MONGODB_URI`` (and optional ``MONGODB_DB_NAME``) in the environment or ``backend/.env``.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple

_BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_BACKEND))

try:
    from dotenv import load_dotenv

    load_dotenv(_BACKEND / ".env")
except ImportError:
    pass

from bson import ObjectId

from app.db.mongodb import close_client, get_database


def _utc_key(doc: Dict[str, Any]) -> Tuple[datetime, str]:
    """Sort key: oldest first."""
    ca = doc.get("ca")
    oid = doc["i"]
    if isinstance(ca, datetime):
        if ca.tzinfo is None:
            ca = ca.replace(tzinfo=timezone.utc)
        return (ca, str(oid))
    try:
        gen = ObjectId(str(oid)).generation_time.replace(tzinfo=timezone.utc)
        return (gen, str(oid))
    except Exception:
        return (datetime.min.replace(tzinfo=timezone.utc), str(oid))


def _preview(text: str, width: int = 64) -> str:
    t = " ".join(str(text).split())
    if len(t) <= width:
        return t
    return t[: width - 1] + "…"


async def load_duplicate_groups() -> List[Dict[str, Any]]:
    col = get_database()["questions"]
    pipeline: List[Dict[str, Any]] = [
        {
            "$match": {
                "question_text_norm": {"$exists": True, "$type": "string", "$nin": ["", None]},
            }
        },
        {
            "$group": {
                "_id": "$question_text_norm",
                "count": {"$sum": 1},
                "items": {"$push": {"i": "$_id", "ca": "$created_at", "tx": "$question_text"}},
            }
        },
        {"$match": {"count": {"$gt": 1}}},
        {"$sort": {"count": -1}},
    ]
    out: List[Dict[str, Any]] = []
    async for row in col.aggregate(pipeline, allowDiskUse=True):
        items: List[Dict[str, Any]] = list(row.get("items") or [])
        items.sort(key=_utc_key)
        norm = str(row["_id"])
        out.append(
            {
                "question_text_norm": norm,
                "count": int(row["count"]),
                "items": items,
                "keep_id": items[0]["i"],
                "delete_ids": [it["i"] for it in items[1:]],
                "preview": _preview(str(items[0].get("tx") or norm)),
            }
        )
    return out


def print_table(groups: List[Dict[str, Any]], max_rows: int = 150) -> Tuple[int, int]:
    """Return (total_extra_copies, total_groups)."""
    total_extra = sum(len(g["delete_ids"]) for g in groups)
    shown = groups[:max_rows]
    # Fixed-width table (ASCII)
    w_prev = 62
    hdr = f"{'#':>4}  {'Cnt':>4}  {'Del':>4}  {'Preview':<{w_prev}}"
    print(hdr)
    print("-" * len(hdr))
    for i, g in enumerate(shown, start=1):
        prev = g["preview"][:w_prev].ljust(w_prev)
        print(f"{i:4d}  {g['count']:4d}  {len(g['delete_ids']):4d}  {prev}")
    if len(groups) > max_rows:
        print(f"... {len(groups) - max_rows} more duplicate group(s) not shown.")
    print("-" * len(hdr))
    print(f"Duplicate groups: {len(groups)}  |  Extra documents to delete: {total_extra}")
    return total_extra, len(groups)


async def run_delete(groups: List[Dict[str, Any]]) -> int:
    col = get_database()["questions"]
    deleted = 0
    for g in groups:
        ids = g["delete_ids"]
        if not ids:
            continue
        res = await col.delete_many({"_id": {"$in": ids}})
        deleted += int(res.deleted_count)
    return deleted


async def main_async(dry_run: bool) -> int:
    uri = os.environ.get("MONGODB_URI", "mongodb://localhost:27017")
    os.environ["MONGODB_URI"] = uri

    groups = await load_duplicate_groups()
    if not groups:
        print("No duplicate groups found (by question_text_norm).")
        return 0

    total_extra, n_groups = print_table(groups)
    if total_extra == 0:
        return 0

    if dry_run:
        print("\n--dry-run: no documents were deleted.")
        return 0

    print(
        f"\nThis will DELETE {total_extra} question document(s), keeping the oldest in each of {n_groups} group(s).\n"
        "Type DELETE DUPLICATES exactly to proceed (empty line cancels):"
    )
    line = sys.stdin.readline()
    if (line or "").strip() != "DELETE DUPLICATES":
        print("Cancelled.")
        return 1

    n = await run_delete(groups)
    print(f"Deleted {n} duplicate document(s).")
    return 0


async def _async_main(dry_run: bool) -> int:
    try:
        return await main_async(dry_run=dry_run)
    finally:
        await close_client()


def main() -> None:
    ap = argparse.ArgumentParser(description="List and remove exact duplicate questions (question_text_norm).")
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="Only print the duplicate report; do not prompt or delete.",
    )
    args = ap.parse_args()
    code = asyncio.run(_async_main(dry_run=args.dry_run))
    raise SystemExit(code)


if __name__ == "__main__":
    main()
