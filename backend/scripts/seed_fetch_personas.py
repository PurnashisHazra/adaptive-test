"""Fetch real student names from public batch rosters on each seed run."""

from __future__ import annotations

import re
import random
import ssl
import uuid
from typing import Dict, List, Optional, Sequence, Set, Tuple
from urllib.error import URLError
from urllib.request import Request, urlopen

from seed_dummy_cohort_data import Persona, validate_personas

# Public roster pages (MBA / analytics batches).
ROSTER_URLS: Tuple[str, ...] = (
    "https://application.iimcal.ac.in/programs/mbaex/class-of-2024",
    "https://www.mbadse.in/batchof26",
)

_HTML_H2_RE = re.compile(r"<h2[^>]*>\s*([^<]+?)\s*</h2>", re.IGNORECASE)
_MD_H2_RE = re.compile(r"^##\s+(.+?)\s*$", re.MULTILINE)

_SKIP_HEADERS = frozenset(
    s.lower()
    for s in (
        "class of 2024",
        "mbaex class of '24",
        "batch of 2024-26",
        "contact us",
        "programs",
        "our social media links",
    )
)

_COLLEGES: List[Tuple[str, str]] = [
    ("IIT Bombay", "iitb"),
    ("IIM Ahmedabad", "iima"),
    ("IIT Delhi", "iitd"),
    ("IIM Bangalore", "iimb"),
    ("IIT Madras", "iitm"),
    ("IIT Kanpur", "iitk"),
    ("IIM Lucknow", "iiml"),
    ("IIT Guwahati", "iitg"),
    ("IIM Calcutta", "iimc"),
    ("IIT Roorkee", "iitr"),
    ("IIT Kharagpur", "iitkgp"),
]

_BIO_TEMPLATES: Tuple[str, ...] = (
    "{short} · quant-first · mocks on weekends",
    "{short} · RC nerd · slow reader, accurate eliminator",
    "{short} · startup hours · LRDI is my happy place",
    "{short} · aiming 99+ · section 3 still scary",
    "{short} · ex-dev · long RCs getting easier",
    "{short} · math background · teaches friends quant",
    "{short} · here for the open challenge leaderboard",
    "{short} · ops job · DI tables oddly satisfying",
    "{short} · probability geek · coffee before every mock",
    "{short} · editorial reader · VARC > quant honestly",
    "{short} · second attempt · logs every silly mistake",
    "{short} · night-owl mocks only",
    "{short} · spreadsheet person · tracks percentiles weekly",
    "{short} · balanced sectionals · no favourite child",
    "{short} · post-mock analysis addict",
)


def _fetch_url(url: str, *, timeout: float = 25.0) -> str:
    req = Request(url, headers={"User-Agent": "adaptive-testing-platform-seed/1.0"})
    ctx = ssl.create_default_context()
    with urlopen(req, timeout=timeout, context=ctx) as resp:
        raw = resp.read()
    return raw.decode("utf-8", errors="replace")


def _title_case_name(raw: str) -> str:
    parts = re.sub(r"\s+", " ", raw.strip()).split()
    out: List[str] = []
    for p in parts:
        if not p:
            continue
        if p.isupper() and len(p) <= 4:
            out.append(p)
        elif "." in p and len(p) <= 4:
            out.append(p.upper())
        else:
            out.append(p[:1].upper() + p[1:].lower())
    return " ".join(out)


def _normalize_display_name(raw: str) -> Optional[str]:
    s = re.sub(r"\s+", " ", raw.strip())
    if not s or len(s) < 4:
        return None
    low = s.lower()
    if low in _SKIP_HEADERS:
        return None
    if any(x in low for x in ("class of", "batch of", "program", "contact", "skip to")):
        return None
    parts = s.split()
    if len(parts) < 2:
        return None
    if not all(re.search(r"[A-Za-z]", p) for p in parts):
        return None
    return _title_case_name(s)


def _extract_names_from_html(html: str) -> List[str]:
    found: List[str] = []
    for m in _HTML_H2_RE.finditer(html):
        name = _normalize_display_name(m.group(1))
        if name:
            found.append(name)
    for m in _MD_H2_RE.finditer(html):
        name = _normalize_display_name(m.group(1))
        if name:
            found.append(name)
    return found


def fetch_display_names_from_web() -> List[str]:
    """Download roster pages and return deduplicated full names (order preserved)."""
    seen: Set[str] = set()
    ordered: List[str] = []
    errors: List[str] = []
    for url in ROSTER_URLS:
        try:
            html = _fetch_url(url)
        except (URLError, TimeoutError, OSError) as e:
            errors.append(f"{url}: {e}")
            continue
        for name in _extract_names_from_html(html):
            key = name.lower()
            if key not in seen:
                seen.add(key)
                ordered.append(name)
    if not ordered and errors:
        raise RuntimeError("Could not fetch any roster names: " + "; ".join(errors))
    return ordered


def _username_from_display(display_name: str) -> str:
    parts = display_name.split()
    first = re.sub(r"[^a-z0-9]", "", parts[0].lower())
    last = re.sub(r"[^a-z0-9]", "", parts[-1].lower())
    if not first or not last:
        return f"seed.{uuid.uuid4().hex[:10]}"
    return f"{first}.{last}"


def _slug_from_parts(display_name: str, college_tag: str) -> str:
    parts = display_name.lower().split()
    base = "-".join(re.sub(r"[^a-z0-9]+", "", p) for p in parts[:2] if p)
    return f"{base}-{college_tag}" if base else f"student-{uuid.uuid4().hex[:8]}-{college_tag}"


def build_personas(
    display_names: Sequence[str],
    count: int,
    rng: random.Random,
    *,
    exclude_display_names: Optional[Set[str]] = None,
    exclude_usernames: Optional[Set[str]] = None,
) -> List[Persona]:
    """Turn fetched names into seed personas; skip names already in the DB."""
    exclude_display = {x.strip().lower() for x in (exclude_display_names or set())}
    exclude_users = {x.strip().lower() for x in (exclude_usernames or set())}

    pool = [n for n in display_names if n.strip().lower() not in exclude_display]
    rng.shuffle(pool)

    personas: List[Persona] = []
    used_names: Set[str] = set()
    used_users: Set[str] = set(exclude_users)
    used_slugs: Set[str] = set()

    colleges = list(_COLLEGES)
    rng.shuffle(colleges)
    bio_templates = list(_BIO_TEMPLATES)

    for display_name in pool:
        if len(personas) >= count:
            break
        name_key = display_name.lower()
        if name_key in used_names:
            continue

        college, tag = colleges[len(personas) % len(colleges)]
        username = _username_from_display(display_name)
        if username in used_users:
            username = f"{username}.{uuid.uuid4().hex[:4]}"
        slug = _slug_from_parts(display_name, tag)
        if slug in used_slugs:
            slug = f"{slug}-{uuid.uuid4().hex[:4]}"

        bio = rng.choice(bio_templates).format(short=tag.upper())

        personas.append(
            {
                "username": username,
                "display_name": display_name,
                "profile_slug": slug,
                "college": college,
                "bio": bio,
            }
        )
        used_names.add(name_key)
        used_users.add(username)
        used_slugs.add(slug)

    if len(personas) < count:
        raise RuntimeError(
            f"Only {len(personas)} fresh names available (need {count}). "
            f"Fetched {len(display_names)} total; {len(exclude_display)} excluded as already used. "
            "Purge old seed users or lower --students."
        )

    validate_personas(personas)
    return personas


def fetch_personas_for_run(
    count: int,
    rng: random.Random,
    *,
    exclude_display_names: Optional[Set[str]] = None,
    exclude_usernames: Optional[Set[str]] = None,
) -> Tuple[List[Persona], List[str]]:
    """
    Fetch roster names from the web, pick ``count`` unused personas.
    Returns (personas, source_urls).
    """
    names = fetch_display_names_from_web()
    rng.shuffle(names)
    personas = build_personas(
        names,
        count,
        rng,
        exclude_display_names=exclude_display_names,
        exclude_usernames=exclude_usernames,
    )
    return personas, list(ROSTER_URLS)
