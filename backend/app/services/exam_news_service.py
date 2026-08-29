"""Fetch and cache the NEXT IAS blog RSS feed for the homepage."""

from __future__ import annotations

import gzip
import html
import logging
import re
import socket
import ssl
import time
from email.utils import parsedate_to_datetime
from http.client import HTTPSConnection
from typing import List, Optional, Tuple
from urllib.error import HTTPError, URLError
from urllib.request import HTTPSHandler, Request, build_opener, urlopen
from xml.etree import ElementTree as ET

from app.schemas.exam_news import ExamNewsItem, ExamNewsResponse

logger = logging.getLogger(__name__)

FEED_URLS = (
    "https://www.nextias.com/blog/feed/",
    "https://nextias.com/blog/feed/",
)
CACHE_TTL_SECONDS = 30 * 60
MAX_ITEMS = 10
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")
_BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)

_cache: Tuple[float, ExamNewsResponse] | None = None


class _IPv4HTTPSConnection(HTTPSConnection):
    """Prefer IPv4 — many VPS hosts have broken IPv6 routes to WordPress CDNs."""

    def connect(self) -> None:
        timeout = self.timeout if self.timeout is not None else 20
        infos = socket.getaddrinfo(self.host, self.port, socket.AF_INET, socket.SOCK_STREAM)
        last_err: OSError | None = None
        for family, socktype, proto, _, sockaddr in infos:
            sock = socket.socket(family, socktype, proto)
            try:
                sock.settimeout(timeout)
                sock.connect(sockaddr)
                context = self._context or ssl.create_default_context()
                self.sock = context.wrap_socket(sock, server_hostname=self.host)
                return
            except OSError as exc:
                last_err = exc
                try:
                    sock.close()
                except OSError:
                    pass
        if last_err:
            raise last_err
        raise OSError(f"Could not connect to {self.host}")


class _IPv4HTTPSHandler(HTTPSHandler):
    def https_open(self, req):  # type: ignore[no-untyped-def]
        return self.do_open(_IPv4HTTPSConnection, req, context=self._context)


def _local(tag: str) -> str:
    if "}" in tag:
        return tag.rsplit("}", 1)[-1]
    return tag


def _child_text(el: ET.Element, name: str) -> str:
    for child in el:
        if _local(child.tag) != name:
            continue
        if child.text:
            return str(child.text)
        joined = "".join(child.itertext()).strip()
        if joined:
            return joined
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
    except (TypeError, ValueError, IndexError, OverflowError):
        return raw.strip()


def _coerce_xml(raw: bytes) -> bytes:
    data = raw.lstrip()
    if data.startswith(b"\xef\xbb\xbf"):
        data = data[3:]
    xml_at = data.find(b"<?xml")
    rss_at = data.find(b"<rss")
    start = min(n for n in (xml_at, rss_at) if n >= 0) if xml_at >= 0 or rss_at >= 0 else 0
    return data[start:]


def _parse_feed(xml_bytes: bytes) -> List[ExamNewsItem]:
    root = ET.fromstring(_coerce_xml(xml_bytes))
    items: List[ExamNewsItem] = []
    for el in root.iter():
        if _local(el.tag) != "item":
            continue
        title = _strip_html(_child_text(el, "title"))
        url = _child_text(el, "link").strip() or _child_text(el, "guid").strip()
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


def _headers() -> dict[str, str]:
    return {
        "User-Agent": _BROWSER_UA,
        "Accept": "application/rss+xml, application/xml, text/xml, */*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, identity",
        "Referer": "https://www.nextias.com/blog/",
        "Connection": "close",
    }


def _decode_body(resp) -> bytes:  # type: ignore[no-untyped-def]
    body = resp.read()
    encoding = (resp.headers.get("Content-Encoding") or "").lower()
    if encoding == "gzip" or body[:2] == b"\x1f\x8b":
        try:
            body = gzip.decompress(body)
        except OSError:
            pass
    return body


def _ssl_context() -> ssl.SSLContext:
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


def _open(url: str, *, ipv4_only: bool) -> bytes:
    req = Request(url, headers=_headers(), method="GET")
    context = _ssl_context()
    if ipv4_only:
        opener = build_opener(_IPv4HTTPSHandler(context=context))
        with opener.open(req, timeout=20) as resp:
            return _decode_body(resp)
    with urlopen(req, timeout=20, context=context) as resp:
        return _decode_body(resp)


def _fetch_xml() -> bytes:
    errors: List[str] = []
    for url in FEED_URLS:
        for ipv4_only in (False, True):
            try:
                return _open(url, ipv4_only=ipv4_only)
            except HTTPError as exc:
                errors.append(f"{url} HTTP {exc.code} ipv4={ipv4_only}")
            except (URLError, TimeoutError, OSError, ssl.SSLError) as exc:
                errors.append(f"{url} ipv4={ipv4_only}: {exc}")
    raise URLError(" | ".join(errors) or "RSS fetch failed")


def get_exam_news(*, force: bool = False) -> ExamNewsResponse:
    global _cache
    now = time.monotonic()
    if not force and _cache and now - _cache[0] < CACHE_TTL_SECONDS and _cache[1].items:
        return _cache[1]
    try:
        items = _parse_feed(_fetch_xml())
        if not items:
            logger.warning("Exam news feed parsed with 0 items")
            return _cache[1] if _cache else ExamNewsResponse(items=[])
        payload = ExamNewsResponse(items=items)
        _cache = (now, payload)
        return payload
    except Exception as exc:
        logger.warning("Could not load exam news feed: %s", exc)
        if _cache:
            return _cache[1]
        return ExamNewsResponse(items=[])
