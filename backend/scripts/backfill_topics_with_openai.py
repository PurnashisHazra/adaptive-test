#!/usr/bin/env python3
"""Backfill CAT topic for existing questions using OpenAI."""

import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, Optional
from urllib import request

# Allow running from repo root or backend/
_BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_BACKEND))

try:
    from dotenv import load_dotenv

    load_dotenv(_BACKEND / ".env")
except ImportError:
    pass

from app.core.config import get_settings
from app.db.mongodb import close_client, get_database


def _strip_markdown_fence(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        lines = t.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        return "\n".join(lines).strip()
    return t


def _build_prompt(doc: Dict[str, Any]) -> str:
    qtext = str(doc.get("question_text", "")).strip()
    subject = str(doc.get("subject", "")).strip() or "Mathematics"
    options = doc.get("options", []) or []
    option_lines = []
    for opt in options:
        k = str(opt.get("key", "")).strip()
        label = str(opt.get("label", "")).strip()
        option_lines.append(f"{k}. {label}")
    options_block = "\n".join(option_lines) if option_lines else "(no options)"
    return (
        "Given a CAT exam question, assign the best CAT topic label.\n"
        "Return ONLY valid JSON with this exact shape: {\"topic\":\"<topic>\"}\n"
        "Rules:\n"
        "- Topic must be concise (1-5 words)\n"
        "- Use common CAT naming (e.g. Algebra, Number System, Arithmetic, Geometry, TSD, P&C, Probability, LRDI)\n"
        "- Do not include explanation\n"
        f"Subject: {subject}\n"
        f"Question: {qtext}\n"
        f"Options:\n{options_block}\n"
    )


def _generate_topic_sync(doc: Dict[str, Any]) -> Optional[str]:
    settings = get_settings()
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY / OPEN_API_KEY is not configured.")

    body = {
        "model": settings.openai_model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a CAT convener with 50+ years of experience in CAT exams. "
                    "Classify each question into the most accurate CAT topic."
                ),
            },
            {"role": "user", "content": _build_prompt(doc)},
        ],
        "temperature": 0.1,
    }
    req = request.Request(
        settings.openai_api_url,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {settings.openai_api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    with request.urlopen(req, timeout=30) as resp:
        raw = resp.read().decode("utf-8")
    data = json.loads(raw)
    content = data["choices"][0]["message"]["content"]
    parsed = json.loads(_strip_markdown_fence(content))
    topic = str(parsed.get("topic", "")).strip()
    return topic or None


async def main() -> None:
    db = get_database()
    col = db["questions"]

    docs = [d async for d in col.find({}, {"_id": 1, "question_text": 1, "subject": 1, "options": 1, "topic": 1})]
    total = len(docs)
    if total == 0:
        print("No questions found.")
        return

    updated = 0
    failed = 0
    for idx, doc in enumerate(docs, start=1):
        try:
            topic = await asyncio.to_thread(_generate_topic_sync, doc)
            if not topic:
                failed += 1
                print(f"[{idx}/{total}] skip: empty topic")
                continue
            await col.update_one({"_id": doc["_id"]}, {"$set": {"topic": topic}})
            updated += 1
            print(f"[{idx}/{total}] updated topic -> {topic}")
        except Exception as exc:
            failed += 1
            print(f"[{idx}/{total}] failed: {exc}")

    print(f"Done. total={total}, updated={updated}, failed={failed}")
    await close_client()


if __name__ == "__main__":
    asyncio.run(main())

