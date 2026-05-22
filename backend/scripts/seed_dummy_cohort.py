#!/usr/bin/env python3
"""
Seed dummy student accounts, public profiles, and optional challenge attempts.

Usage (must run from backend/ with .venv):
  cd backend
  # Students only — assigns to live challenges and writes ranked scores for percentiles:
  .venv/bin/python scripts/seed_dummy_cohort.py --students 25

  # Also create new seed challenges from templates (pass --challenges explicitly):
  .venv/bin/python scripts/seed_dummy_cohort.py --students 25 --challenges 5

NOT a dry run unless you pass --dry-run (that prints a plan but writes nothing).

Requires MONGODB_URI in backend/.env (same DB as the running API).
"""

from __future__ import annotations

import argparse
import asyncio
import os
import random
import sys
import time
import traceback
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

_BACKEND = Path(__file__).resolve().parents[1]
_SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(_BACKEND))
sys.path.insert(0, str(_SCRIPTS))

try:
    from dotenv import load_dotenv

    loaded = load_dotenv(_BACKEND / ".env")
except ImportError:
    loaded = False

from app.core.config import get_settings
from app.db.mongodb import close_client, get_database
from app.repositories.challenge_repository import ChallengeRepository
from app.repositories.question_repository import QuestionRepository
from app.repositories.student_public_profile_repository import (
    StudentPublicProfileRepository,
    normalize_profile_slug,
)
from app.repositories.user_repository import UserRepository
from app.services.challenge_service import _max_marks, _sorted_sections, _window_status
from app.utils.ids import oid_str
from app.utils.passwords import hash_password
from seed_dummy_cohort_data import CHALLENGE_TEMPLATES, LEVEL_DIFFICULTIES  # noqa: E402
from seed_fetch_personas import fetch_personas_for_run  # noqa: E402

DEFAULT_PASSWORD = "SeedDummy1!"


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _mask_uri(uri: str) -> str:
    if "@" in uri:
        pre, rest = uri.split("@", 1)
        if "://" in pre:
            scheme, _ = pre.split("://", 1)
            return f"{scheme}://***@{rest}"
    return uri[:24] + "..." if len(uri) > 24 else uri


def _default_sections(*, questions_per_section: int, time_limit_seconds: int) -> List[Dict[str, Any]]:
    """Fallback when a template has no section specs (should not happen for seed templates)."""
    return [
        {
            "id": f"sec_{uuid.uuid4().hex[:12]}",
            "title": "Quantitative Ability",
            "order": 0,
            "subject": "Quantitative Aptitude",
            "topic": None,
            "exam_tag": "CAT",
            "total_questions": questions_per_section,
            "time_limit_seconds": time_limit_seconds,
            "question_pool_ids": None,
        },
        {
            "id": f"sec_{uuid.uuid4().hex[:12]}",
            "title": "Verbal Ability & RC",
            "order": 1,
            "subject": "Verbal Ability",
            "topic": None,
            "exam_tag": "CAT",
            "total_questions": questions_per_section,
            "time_limit_seconds": time_limit_seconds,
            "question_pool_ids": None,
        },
    ]


async def _query_question_ids(
    repo: QuestionRepository,
    filt: Dict[str, Any],
    *,
    limit: int = 2000,
) -> List[str]:
    if not filt:
        return []
    cur = repo._col.find(filt, {"_id": 1}).limit(limit)
    return [oid_str(d["_id"]) async for d in cur]


async def _expand_pool_for_spec(
    repo: QuestionRepository,
    spec: Dict[str, Any],
    level: str,
) -> Tuple[List[str], int]:
    """Match questions in MongoDB to a section spec; return (pool_ids, total_questions)."""
    want = int(spec["total_questions"])
    diffs = list(spec.get("difficulties") or LEVEL_DIFFICULTIES.get(level, []))

    subjects: List[str] = list(spec.get("subjects") or [])
    exam_tags: List[str] = list(spec.get("exam_tags") or [])
    exam_tag = spec.get("exam_tag")
    if exam_tag and str(exam_tag).strip().upper() not in [t.upper() for t in exam_tags]:
        exam_tags.append(str(exam_tag).strip().upper())

    strategies: List[Dict[str, Any]] = []
    if subjects and exam_tags:
        strategies.append({"subject": {"$in": subjects}, "tags": {"$in": exam_tags}})
    if subjects:
        strategies.append({"subject": {"$in": subjects}})

    or_parts: List[Dict[str, Any]] = []
    for pat in spec.get("subject_patterns") or []:
        or_parts.append({"subject": {"$regex": pat, "$options": "i"}})
    for pat in spec.get("topic_patterns") or []:
        or_parts.append({"topic": {"$regex": pat, "$options": "i"}})
    if or_parts:
        strategies.append({"$or": or_parts})

    if exam_tags:
        strategies.append({"tags": {"$in": exam_tags}})

    def _with_difficulty(base: Dict[str, Any], use_diffs: List[str]) -> Dict[str, Any]:
        if not use_diffs:
            return base
        clause = {"difficulty": {"$in": use_diffs}}
        if not base:
            return clause
        return {"$and": [base, clause]}

    collected: List[str] = []
    seen: set[str] = set()

    async def _merge_from_strategies(use_diffs: List[str]) -> None:
        nonlocal collected, seen
        for strat in strategies:
            filt = _with_difficulty(strat, use_diffs)
            for qid in await _query_question_ids(repo, filt):
                if qid not in seen:
                    seen.add(qid)
                    collected.append(qid)
            if len(collected) >= want:
                return

    await _merge_from_strategies(diffs)
    if len(collected) < want and diffs:
        await _merge_from_strategies([])

    if not collected:
        return [], 0

    actual = min(want, len(collected))
    pool = collected[:2000]
    return pool, actual


async def build_sections_from_template(
    repo: QuestionRepository,
    tmpl: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Build challenge sections with question_pool_ids aligned to the challenge title/theme."""
    level = str(tmpl.get("level") or "INTERMEDIATE")
    specs = tmpl.get("sections")
    if not specs:
        return _default_sections(questions_per_section=10, time_limit_seconds=600)

    sections: List[Dict[str, Any]] = []
    for spec in specs:
        pool, tq = await _expand_pool_for_spec(repo, spec, level)
        if tq == 0:
            raise ValueError(
                f"No matching questions for section {spec.get('title')!r} "
                f"in challenge {tmpl.get('title')!r}. Upload questions with matching subject/tags."
            )
        primary_subject = (spec.get("subjects") or [None])[0]
        sections.append(
            {
                "id": f"sec_{uuid.uuid4().hex[:12]}",
                "title": spec["title"],
                "order": int(spec.get("order", 0)),
                "subject": primary_subject,
                "topic": None,
                "exam_tag": spec.get("exam_tag"),
                "total_questions": tq,
                "time_limit_seconds": int(spec.get("time_limit_seconds", 600)),
                "question_pool_ids": pool,
            }
        )
    return sections


def _synthetic_section_results(
    challenge: Dict[str, Any],
    total_marks: float,
    rng: random.Random,
) -> List[Dict[str, Any]]:
    secs = _sorted_sections(challenge)
    mpc = float(challenge.get("marks_per_correct", 1))
    if not secs:
        return []
    weights = [rng.uniform(0.35, 0.65) for _ in secs]
    wsum = sum(weights) or 1.0
    out: List[Dict[str, Any]] = []
    allocated = 0.0
    for i, sec in enumerate(secs):
        tq = int(sec["total_questions"])
        if i == len(secs) - 1:
            marks = round(max(0.0, total_marks - allocated), 4)
        else:
            marks = round(total_marks * (weights[i] / wsum), 4)
            allocated += marks
        correct = min(tq, int(round(marks / mpc))) if mpc > 0 else 0
        wrong = max(0, tq - correct)
        out.append(
            {
                "section_index": int(sec.get("order", i)),
                "section_title": str(sec["title"]),
                "attempt_id": f"seed_{uuid.uuid4().hex[:12]}",
                "marks": marks,
                "correct": correct,
                "wrong": wrong,
                "total_questions": tq,
            }
        )
    return out


def _attempt_is_ranked(doc: Optional[Dict[str, Any]]) -> bool:
    """True if attempt counts toward challenge percentiles (see list_ranked_attempts_for_challenge)."""
    if not doc:
        return False
    return doc.get("status") in ("completed", "ended_early") and doc.get("total_marks") is not None


async def _write_ranked_challenge_attempt(
    challenges: ChallengeRepository,
    *,
    challenge_id: str,
    challenge: Dict[str, Any],
    student_username: str,
    rng: random.Random,
    now: datetime,
) -> None:
    """Insert or update a completed challenge_attempt with total_marks for percentile ranking."""
    max_m = _max_marks(challenge, float(challenge.get("marks_per_correct", 1)))
    if max_m <= 0:
        return
    score_pct = rng.uniform(0.42, 0.96)
    total_marks = round(max_m * score_pct, 4)
    if total_marks <= 0:
        total_marks = round(max_m * 0.5, 4)
    started = now - timedelta(days=rng.randint(1, 2), hours=rng.randint(0, 12))
    completed = started + timedelta(minutes=rng.randint(35, 110))
    section_results = _synthetic_section_results(challenge, total_marks, rng)
    secs = _sorted_sections(challenge)
    payload = {
        "status": "completed",
        "total_marks": float(total_marks),
        "section_results": section_results,
        "completed_at": completed,
        "current_section_index": max(0, len(secs) - 1),
        "active_attempt_id": "",
        "seed_cohort": True,
    }
    existing = await challenges.find_challenge_attempt(challenge_id, student_username)
    if existing:
        await challenges.update_challenge_attempt(str(existing["_id"]), payload)
    else:
        await challenges.insert_challenge_attempt(
            {
                "challenge_id": challenge_id,
                "student_username": student_username,
                "started_at": started,
                "section_attempt_ids": [],
                **payload,
            }
        )


async def _all_seed_usernames(users: UserRepository) -> List[str]:
    cursor = users._col.find(
        {"$or": [{"is_seed_dummy": True}, {"seed_cohort": True}, {"username": {"$regex": r"^seed\."}}]},
        {"username": 1},
    )
    names: List[str] = []
    seen: set[str] = set()
    async for doc in cursor:
        u = str(doc.get("username", "")).strip()
        if u and u.lower() not in seen:
            seen.add(u.lower())
            names.append(u)
    return names


async def _seed_assignments_and_ranked_attempts(
    challenges: ChallengeRepository,
    challenge_docs: List[Tuple[str, Dict[str, Any]]],
    student_names: List[str],
    *,
    participation: float,
    rng: random.Random,
    now: datetime,
    dry_run: bool,
    only_where_assigned: bool = False,
) -> Tuple[int, int, int]:
    """
    Assign students to challenges (when not open_to_all), then ensure ranked scores.

    Returns (assignments_upserted, attempts_written, attempts_already_ranked).
    """
    assignments = 0
    written = 0
    already = 0

    for cid, ch in challenge_docs:
        max_m = _max_marks(ch, float(ch.get("marks_per_correct", 1)))
        if max_m <= 0:
            continue
        open_to_all = bool(ch.get("open_to_all", False))

        for uname in student_names:
            if only_where_assigned:
                # Restricted: only students already assigned; open: full seed cohort for percentiles.
                if not open_to_all and not await challenges.has_assignment(cid, uname):
                    continue
            elif rng.random() > participation:
                continue

            if dry_run:
                if not open_to_all:
                    assignments += 1
                written += 1
                continue

            if not open_to_all:
                await challenges.upsert_assignment(cid, uname)
                assignments += 1

            existing = await challenges.find_challenge_attempt(cid, uname)
            if _attempt_is_ranked(existing):
                already += 1
                continue

            await _write_ranked_challenge_attempt(
                challenges,
                challenge_id=cid,
                challenge=ch,
                student_username=uname,
                rng=rng,
                now=now,
            )
            written += 1

    return assignments, written, already


async def _resolve_created_by(users: UserRepository, explicit: Optional[str]) -> str:
    if explicit and explicit.strip():
        row = await users.get_by_username(explicit.strip())
        if not row:
            raise SystemExit(f"--created-by user not found: {explicit}")
        return str(row["username"])
    for role in ("admin", "super_admin"):
        rows = await users.list_by_role(role, limit=5)
        if rows:
            return str(rows[0]["username"])
    # Any user (e.g. student) so seed still works without an admin account
    any_user = await users._col.find_one({}, sort=[("username", 1)])
    if any_user:
        uname = str(any_user["username"])
        print(f"WARNING: No admin found; using created_by={uname!r}")
        return uname
    raise SystemExit(
        "No users in database. Create at least one account first, or pass --created-by YOUR_USERNAME"
    )


async def _unique_profile_slug(
    profiles: StudentPublicProfileRepository, persona: Dict[str, str]
) -> str:
    uname = persona["username"]
    for candidate in (persona["profile_slug"], normalize_profile_slug(uname), f"{normalize_profile_slug(uname)}-{uuid.uuid4().hex[:6]}"):
        if not await profiles.slug_taken(candidate, except_username=uname):
            return candidate
    return normalize_profile_slug(f"{uname}-{uuid.uuid4().hex[:6]}")


async def purge_seed_data(*, dry_run: bool) -> None:
    db = get_database()
    users = UserRepository()
    profiles = StudentPublicProfileRepository()
    challenges = ChallengeRepository()

    seed_users = await users._col.find(
        {"$or": [{"is_seed_dummy": True}, {"username": {"$regex": r"^seed\."}}]}
    ).to_list(length=5000)
    seed_usernames = [str(u["username"]) for u in seed_users]

    seed_challenges = await challenges._challenges.find({"created_by_seed": True}).to_list(length=500)
    seed_cids = [str(c["_id"]) for c in seed_challenges]

    print(f"Purge: {len(seed_usernames)} seed users, {len(seed_cids)} seed challenges.")
    if dry_run:
        print("[dry-run] Purge skipped.")
        return

    if seed_cids:
        await challenges._attempts.delete_many({"challenge_id": {"$in": seed_cids}})
        await challenges._assign.delete_many({"challenge_id": {"$in": seed_cids}})
        await challenges._challenges.delete_many({"_id": {"$in": [c["_id"] for c in seed_challenges]}})

    if seed_usernames:
        await profiles._col.delete_many({"student_username": {"$in": seed_usernames}})
        await db["student_profiles"].delete_many({"student_username": {"$in": seed_usernames}})
        await users._col.delete_many({"username": {"$in": seed_usernames}})

    print("Purge complete.")


async def _verify_counts() -> None:
    users = UserRepository()
    challenges = ChallengeRepository()
    n_users = await users._col.count_documents({"is_seed_dummy": True})
    n_ch = await challenges._challenges.count_documents({"created_by_seed": True})
    n_att = await challenges._attempts.count_documents({"seed_cohort": True})
    print("--- DB verification ---")
    print(f"  dummy cohort users (is_seed_dummy): {n_users}")
    print(f"  seed challenges: {n_ch}")
    print(f"  seed challenge attempts: {n_att}")
    if n_users == 0 and n_ch == 0:
        print("  ERROR: Nothing was written. Check you did NOT use --dry-run and .env points to the right database.")


async def _load_existing_challenges(
    challenges: ChallengeRepository,
    *,
    live_only: bool = True,
) -> List[Tuple[str, Dict[str, Any]]]:
    """Return (id, doc) for challenges already in the database."""
    now = _utc_now()
    out: List[Tuple[str, Dict[str, Any]]] = []
    for doc in await challenges.list_challenges(limit=500):
        cid = oid_str(doc["_id"])
        if live_only:
            status, _, _ = _window_status(doc["launch_at"], doc["end_at"], now)
            if status != "live":
                continue
        out.append((cid, doc))
    return out


async def _existing_seed_identifiers(users: UserRepository) -> Tuple[set[str], set[str]]:
    """Display names and usernames already used by seed dummy accounts in the DB."""
    display_names: set[str] = set()
    usernames: set[str] = set()
    cursor = users._col.find(
        {"$or": [{"is_seed_dummy": True}, {"seed_cohort": True}, {"username": {"$regex": r"^seed\."}}]},
        {"username": 1, "display_name": 1},
    )
    async for doc in cursor:
        usernames.add(str(doc["username"]).strip().lower())
        dn = doc.get("display_name")
        if dn:
            display_names.add(str(dn).strip().lower())
    profiles = StudentPublicProfileRepository()
    async for doc in profiles._col.find({}, {"display_name": 1, "student_username": 1}):
        usernames.add(str(doc.get("student_username", "")).strip().lower())
        dn = doc.get("display_name")
        if dn:
            display_names.add(str(dn).strip().lower())
    return display_names, usernames


async def seed_cohort(
    *,
    num_students: int,
    num_challenges: int,
    password: str,
    created_by: Optional[str],
    participation: float,
    dry_run: bool,
    rng: random.Random,
) -> None:
    create_challenges = num_challenges > 0
    if create_challenges and num_challenges > len(CHALLENGE_TEMPLATES):
        raise SystemExit(f"--challenges max is {len(CHALLENGE_TEMPLATES)} (template pool size).")

    users = UserRepository()
    profiles = StudentPublicProfileRepository()
    challenges = ChallengeRepository()
    questions = QuestionRepository() if create_challenges else None

    exclude_display, exclude_users = await _existing_seed_identifiers(users)
    print("Fetching fresh student names from public batch rosters…")
    try:
        personas, sources = fetch_personas_for_run(
            num_students,
            rng,
            exclude_display_names=exclude_display,
            exclude_usernames=exclude_users,
        )
    except RuntimeError as e:
        raise SystemExit(str(e)) from e
    for url in sources:
        print(f"  roster: {url}")
    print(f"  selected {len(personas)} new name(s), e.g. {personas[0]['display_name']}")

    creator: Optional[str] = None
    if create_challenges:
        creator = await _resolve_created_by(users, created_by)
    templates = CHALLENGE_TEMPLATES[:num_challenges] if create_challenges else []

    now = _utc_now()
    launch_at = now - timedelta(days=3)
    end_at = now + timedelta(days=60)

    if create_challenges:
        print(f"created_by on new challenges: {creator}")
    else:
        print("Challenges: none created (use --challenges N to add seed challenges)")
    print(f"Students: {num_students}, new challenges: {num_challenges}, participation: {participation:.0%}")
    if dry_run:
        print("[dry-run] NO WRITES — remove --dry-run to create data.")

    created_users = 0
    updated_profiles = 0
    created_challenges = 0
    created_assignments = 0
    created_attempts = 0
    errors: List[str] = []

    student_names: List[str] = []
    for p in personas:
        uname = p["username"]
        student_names.append(uname)
        try:
            existing = await users.get_by_username(uname)
            if not existing:
                if not dry_run:
                    await users.insert_user(
                        {
                            "username": uname,
                            "role": "student",
                            "password_hash": hash_password(password),
                            "is_seed_dummy": True,
                            "seed_cohort": True,
                        }
                    )
                created_users += 1
                print(f"  + user {uname}")
            else:
                print(f"  = user exists {uname}")

            if not dry_run:
                slug = await _unique_profile_slug(profiles, p)
                await profiles.upsert(
                    uname,
                    profile_slug=slug,
                    display_name=p["display_name"],
                    bio=p["bio"],
                )
            updated_profiles += 1
        except Exception as e:
            msg = f"student {uname}: {e}"
            errors.append(msg)
            print(f"  ! {msg}")
            traceback.print_exc()

    challenge_docs: List[Tuple[str, Dict[str, Any]]] = []
    if not create_challenges:
        challenge_docs = await _load_existing_challenges(challenges, live_only=True)
        if challenge_docs:
            titles = ", ".join(ch["title"] for _, ch in challenge_docs[:5])
            extra = f" (+{len(challenge_docs) - 5} more)" if len(challenge_docs) > 5 else ""
            print(f"  Using {len(challenge_docs)} live challenge(s): {titles}{extra}")
        else:
            print("  WARNING: No live challenges in DB — students only; no assignments or attempts.")
    for tmpl in templates:
        try:
            assert questions is not None
            sections = await build_sections_from_template(questions, tmpl)
            pool_summary = ", ".join(
                f"{s['title']}: pool={len(s.get('question_pool_ids') or [])}, q={s['total_questions']}"
                for s in sections
            )
            print(f"  pools [{tmpl['title']}] {pool_summary}")
            doc = {
                "title": tmpl["title"],
                "description": str(tmpl.get("description") or ""),
                "level": str(tmpl.get("level") or "INTERMEDIATE"),
                "is_adaptive": True,
                "launch_at": launch_at,
                "end_at": end_at,
                "open_to_all": True,
                "sections": sections,
                "marks_per_correct": 3.0,
                "marks_per_incorrect": 1.0,
                "created_by": creator,
                "created_by_seed": True,
                "seed_cohort": True,
            }
            if dry_run:
                cid = f"dry_{uuid.uuid4().hex[:8]}"
                print(f"  ~ challenge [dry] {tmpl['title']}")
            else:
                cid = await challenges.insert_challenge(doc)
                got = await challenges.get_challenge(cid)
                if not got:
                    raise RuntimeError("insert_challenge returned id but document missing")
                doc = got
                print(f"  + challenge {tmpl['title']} id={cid}")
            challenge_docs.append((cid, doc))
            created_challenges += 1
        except Exception as e:
            msg = f"challenge {tmpl.get('title')}: {e}"
            errors.append(msg)
            print(f"  ! {msg}")
            traceback.print_exc()

    if challenge_docs and student_names:
        try:
            print("Scoring new seed students on challenges (assign → completed attempt with total_marks)…")
            a, w, skip = await _seed_assignments_and_ranked_attempts(
                challenges,
                challenge_docs,
                student_names,
                participation=participation,
                rng=rng,
                now=now,
                dry_run=dry_run,
                only_where_assigned=False,
            )
            created_assignments += a
            created_attempts += w
            if skip:
                print(f"  new cohort: {w} ranked attempt(s) written, {skip} already had scores")
            else:
                print(f"  new cohort: {w} ranked attempt(s) written")
        except Exception as e:
            errors.append(f"score new cohort: {e}")
            print(f"  ! score new cohort: {e}")
            traceback.print_exc()

        all_seed = await _all_seed_usernames(users)
        if all_seed and not dry_run:
            try:
                print(f"Backfill: ensure assigned seed users have ranked scores ({len(all_seed)} user(s))…")
                ba, bw, bskip = await _seed_assignments_and_ranked_attempts(
                    challenges,
                    challenge_docs,
                    all_seed,
                    participation=1.0,
                    rng=rng,
                    now=now,
                    dry_run=False,
                    only_where_assigned=True,
                )
                created_assignments += ba
                created_attempts += bw
                print(f"  backfill: {bw} ranked attempt(s) added, {bskip} already scored, {ba} assignment(s) touched")
            except Exception as e:
                errors.append(f"backfill scores: {e}")
                print(f"  ! backfill scores: {e}")
                traceback.print_exc()
    elif challenge_docs:
        print("  No new students this run — skipping challenge scoring.")

    print("--- Summary ---")
    print(f"Users created (new): {created_users}")
    print(f"Public profiles upserted: {updated_profiles}")
    print(f"Challenges created: {created_challenges}")
    print(f"Challenge assignments (non-open): {created_assignments}")
    print(f"Ranked challenge attempts (for percentiles): {created_attempts}")
    if errors:
        print(f"Errors: {len(errors)} (see above)")
    if not dry_run:
        print(f"Login password (new users): {password}")
        print("Example username:", personas[0]["username"])
        await _verify_counts()
    else:
        print("Re-run without --dry-run to write to MongoDB.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed dummy IIT/IIM-style students and challenge attempts.")
    parser.add_argument("--students", "-m", type=int, default=20)
    parser.add_argument(
        "--challenges",
        "-n",
        type=int,
        default=0,
        help="Create N seed challenges from templates (default 0: only add students to existing live challenges)",
    )
    parser.add_argument("--password", default=os.environ.get("SEED_PASSWORD", DEFAULT_PASSWORD))
    parser.add_argument(
        "--created-by",
        "--admin-username",
        dest="created_by",
        default=os.environ.get("SEED_CREATED_BY") or os.environ.get("SEED_ADMIN_USERNAME"),
        help="Username for challenge.created_by (admin preferred; any user ok)",
    )
    parser.add_argument(
        "--participation",
        type=float,
        default=1.0,
        help="Fraction of (student, challenge) pairs to include; every included pair gets a ranked score (default 1.0)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=None,
        help="RNG seed (default: random each run so roster picks differ)",
    )
    parser.add_argument("--dry-run", action="store_true", help="Plan only — does NOT write to DB")
    parser.add_argument("--purge", action="store_true", help="Purge seed cohort before seeding")
    parser.add_argument("--purge-only", action="store_true")
    args = parser.parse_args()

    if not os.environ.get("MONGODB_URI"):
        print("WARNING: MONGODB_URI not set; defaulting to mongodb://localhost:27017")
        os.environ["MONGODB_URI"] = "mongodb://localhost:27017"

    settings = get_settings()
    print(f".env loaded from {_BACKEND / '.env'}: {loaded}")
    print(f"Database: {settings.mongodb_db_name}")
    print(f"MongoDB: {_mask_uri(settings.mongodb_uri)}")

    if args.participation < 0 or args.participation > 1:
        raise SystemExit("--participation must be between 0 and 1")

    seed_val = args.seed if args.seed is not None else int(time.time() * 1000)
    rng = random.Random(seed_val)
    print(f"RNG seed: {seed_val}" + ("" if args.seed is not None else " (auto — new names each run)"))

    async def run() -> None:
        try:
            if args.purge or args.purge_only:
                await purge_seed_data(dry_run=args.dry_run)
            if args.purge_only:
                return
            await seed_cohort(
                num_students=args.students,
                num_challenges=args.challenges,
                password=args.password,
                created_by=args.created_by,
                participation=args.participation,
                dry_run=args.dry_run,
                rng=rng,
            )
        finally:
            await close_client()

    asyncio.run(run())


if __name__ == "__main__":
    main()
