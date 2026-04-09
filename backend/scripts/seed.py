#!/usr/bin/env python3
"""Load seed questions from JSON into MongoDB. Requires MONGODB_URI in environment."""

import asyncio
import json
import os
import sys
from pathlib import Path

# Allow running from repo root or backend/
_BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_BACKEND))

try:
    from dotenv import load_dotenv

    load_dotenv(_BACKEND / ".env")
except ImportError:
    pass

from app.db.mongodb import close_client
from app.repositories.question_repository import QuestionRepository
from app.schemas.question import QuestionCreate
from app.services.question_service import question_create_to_doc


async def main() -> None:
    uri = os.environ.get("MONGODB_URI", "mongodb://localhost:27017")
    os.environ["MONGODB_URI"] = uri

    seed_path = Path(__file__).with_name("seed_questions.json")
    payload = json.loads(seed_path.read_text(encoding="utf-8"))
    items = payload.get("questions", [])

    repo = QuestionRepository()
    inserted = 0
    for obj in items:
        qc = QuestionCreate.model_validate(obj)
        doc = question_create_to_doc(qc)
        dup = await repo.find_ids_by_text_hash(doc["question_text"])
        if dup:
            continue
        await repo.insert_one(doc)
        inserted += 1
    print(f"Inserted {inserted} questions (skipped duplicates).")
    await close_client()


if __name__ == "__main__":
    asyncio.run(main())
