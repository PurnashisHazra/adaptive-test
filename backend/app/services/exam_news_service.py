"""Fetch and cache the NEXT IAS blog RSS feed for the homepage."""

from __future__ import annotations

import html
import logging
import re
import time
from email.utils import parsedate_to_datetime
from typing import List, Optional, Tuple
from urllib.error import URLError
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET

from app.schemas.exam_news import ExamNewsItem, ExamNewsResponse

logger = logging.getLogger(__name__)

FEED_URL = "https://www.nextias.com/blog/feed/"
CACHE_TTL_SECONDS = 30 * 60
MAX_ITEMS = 10
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")

_cache: Tuple[float, ExamNewsResponse] | None = None


def _local(tag: str) -> str:
    if "}" in tag:
        return tag.rsplit("}", 1)[-1]
    return tag


def _child_text(el: ET.Element, name: str) -> str:
    for child in el:
        if _local(child.tag) == name and child.text:
            return str(child.text)
    return ""


def _strip_html(raw: str) -> str:
    text = html.unescape(raw or "")
    text = _TAG_RE.sub(" ", text)
    return _WS_RE.sub(" ", text).strip()


def _excerpt(raw: str, limit: int = 140) -> str:
    text = _strip_html(raw)
    if len(text) <= limit:
        return text
    cut = text[: limit - 1].rsplit(" ", 1)[0]
    return (cut or text[: limit - 1]).rstrip(".,;:") + "…"


def _iso_pub(raw: str) -> Optional[str]:
    if not raw.strip():
        return None
    try:
        return parsedate_to_datetime(raw.strip()).isoformat()
    except (TypeError, ValueError, IndexError):
        return raw.strip()


def _parse_feed(xml_bytes: bytes) -> List[ExamNewsItem]:
    root = ET.fromstring(xml_bytes)
    items: List[ExamNewsItem] = []
    for el in root.iter():
        if _local(el.tag) != "item":
            continue
        title = _strip_html(_child_text(el, "title"))
        url = _child_text(el, "link").strip()
        if not title or not url:
            continue
        category = _strip_html(_child_text(el, "category")) or None
        items.append(
            ExamNewsItem(
                title=title,
                url=url,
                excerpt=_excerpt(_child_text(el, "description")),
                category=category,
                published_at=_iso_pub(_child_text(el, "pubDate")),
            )
        )
        if len(items) >= MAX_ITEMS:
            break
    return items


def _fetch_xml() -> bytes:
    req = Request(
        FEED_URL,
        headers={
            "User-Agent": "AdapTest/1.0 (+https://adaptest.in)",
            "Accept": "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        },
        method="GET",
    )
    with urlopen(req, timeout=12) as resp:
        return resp.read()


def get_exam_news(*, force: bool = False) -> ExamNewsResponse:
    global _cache
    now = time.monotonic()
    if not force and _cache and now - _cache[0] < CACHE_TTL_SECONDS:
        return _cache[1]
    try:
        items = _parse_feed(_fetch_xml())
        payload = ExamNewsResponse(items=items)
        _cache = (now, payload)
        return payload
    except (URLError, TimeoutError, ET.ParseError, OSError) as exc:
        logger.warning("Could not load exam news feed: %s", exc)
        if _cache:
            return _cache[1]
        return ExamNewsResponse(items=[])
