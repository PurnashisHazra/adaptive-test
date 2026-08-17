import random
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorCollection

from app.db.mongodb import get_database
from app.models.domain import Difficulty, QuestionType
from app.utils.ids import oid_str
from app.utils.text_search import build_search_filter
from app.utils.exam_tags import normalize_subject_name


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class QuestionRepository:
    def __init__(self) -> None:
        self._col: AsyncIOMotorCollection = get_database()["questions"]

    async def ensure_indexes(self) -> None:
        await self._col.create_index([("subject", 1), ("topic", 1), ("difficulty", 1)])
        await self._col.create_index([("question_text", "text")])
        await self._col.create_index([("question_text_norm", 1)])
        await self._col.create_index([("passage_id", 1), ("sub_question_index", 1)])

    def _doc_to_admin(self, doc: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "id": oid_str(doc["_id"]),
            "question_text": doc["question_text"],
            "question_type": doc["question_type"],
            "options": doc.get("options", []),
            "correct_answer": doc["correct_answer"],
            "explanation": doc.get("explanation"),
            "image_url": doc.get("image_url"),
            "difficulty": doc["difficulty"],
            "subject": doc.get("subject", "General"),
            "topic": doc.get("topic", "General"),
            "tags": doc.get("tags", []),
            "is_ai_generated": bool(doc.get("is_ai_generated", False)),
            "passage_id": doc.get("passage_id"),
            "sub_question_index": doc.get("sub_question_index"),
            "created_at": doc["created_at"],
            "updated_at": doc["updated_at"],
        }

    async def insert_one(self, data: Dict[str, Any]) -> str:
        now = _utc_now()
        data.setdefault("created_at", now)
        data.setdefault("updated_at", now)
        res = await self._col.insert_one(data)
        return oid_str(res.inserted_id)

    async def update_one(self, qid: str, patch: Dict[str, Any]) -> bool:
        oid = ObjectId(qid)
        patch["updated_at"] = _utc_now()
        res = await self._col.update_one({"_id": oid}, {"$set": patch})
        return res.matched_count > 0

    async def delete_one(self, qid: str) -> bool:
        res = await self._col.delete_one({"_id": ObjectId(qid)})
        return res.deleted_count > 0

    async def delete_by_ids(self, question_ids: List[str]) -> int:
        oids: List[ObjectId] = []
        seen: set[str] = set()
        for raw in question_ids:
            s = str(raw).strip()
            if not s or s in seen or not ObjectId.is_valid(s):
                continue
            seen.add(s)
            oids.append(ObjectId(s))
        if not oids:
            return 0
        res = await self._col.delete_many({"_id": {"$in": oids}})
        return int(res.deleted_count)

    async def iter_all_docs(self):
        cursor = self._col.find({}).sort("updated_at", -1)
        async for doc in cursor:
            yield doc

    async def iter_folder_docs(self, extra_filter: Optional[Dict[str, Any]] = None):
        filt = extra_filter or {}
        projection = {"_id": 1, "tags": 1, "subject": 1, "topic": 1, "difficulty": 1}
        async for doc in self._col.find(filt, projection):
            yield doc

    async def get_by_id(self, qid: str) -> Optional[Dict[str, Any]]:
        doc = await self._col.find_one({"_id": ObjectId(qid)})
        return doc

    async def list_by_passage_id(self, passage_id: str) -> List[Dict[str, Any]]:
        cur = self._col.find({"passage_id": passage_id}).sort("sub_question_index", 1)
        return [d async for d in cur]

    async def delete_by_passage_id(self, passage_id: str) -> int:
        res = await self._col.delete_many({"passage_id": passage_id})
        return int(res.deleted_count)

    async def list_by_ids(self, question_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        oids: List[ObjectId] = []
        for qid in question_ids:
            qid = str(qid).strip()
            if not qid:
                continue
            try:
                oids.append(ObjectId(qid))
            except Exception:
                continue
        if not oids:
            return {}
        out: Dict[str, Dict[str, Any]] = {}
        async for doc in self._col.find({"_id": {"$in": oids}}):
            out[oid_str(doc["_id"])] = doc
        return out

    async def count(self, query: Optional[Dict[str, Any]] = None) -> int:
        return await self._col.count_documents(query or {})

    def _build_filter(
        self,
        subject: Optional[str] = None,
        topic: Optional[str] = None,
        difficulty: Optional[Difficulty] = None,
        search: Optional[str] = None,
        question_type: Optional[str] = None,
        exam_tag: Optional[str] = None,
    ) -> Dict[str, Any]:
        parts: List[Dict[str, Any]] = []
        if subject:
            parts.append({"subject": subject})
        if topic:
            parts.append({"topic": topic})
        if difficulty:
            parts.append({"difficulty": difficulty.value})
        if question_type and str(question_type).strip():
            parts.append({"question_type": str(question_type).strip().lower()})
        if exam_tag:
            t = str(exam_tag).strip().upper()
            if t:
                parts.append({"tags": {"$in": [t]}})
        search_frag = build_search_filter(search)
        if search_frag is not None:
            parts.append(search_frag)
        if not parts:
            return {}
        if len(parts) == 1:
            return parts[0]
        return {"$and": parts}

    async def list_paginated(
        self,
        subject: Optional[str] = None,
        topic: Optional[str] = None,
        difficulty: Optional[Difficulty] = None,
        search: Optional[str] = None,
        question_type: Optional[str] = None,
        exam_tag: Optional[str] = None,
        question_ids: Optional[List[str]] = None,
        page: int = 1,
        page_size: int = 20,
        extra_filter: Optional[Dict[str, Any]] = None,
    ) -> tuple[List[Dict[str, Any]], int]:
        if question_ids is not None:
            oids: List[ObjectId] = []
            seen: set[str] = set()
            for raw in question_ids:
                s = str(raw).strip()
                if not s or s in seen or not ObjectId.is_valid(s):
                    continue
                seen.add(s)
                oids.append(ObjectId(s))
            if not oids:
                return [], 0
            filt = self._build_filter(None, None, difficulty, search, question_type, None)
            id_filt: Dict[str, Any] = {"_id": {"$in": oids}}
            filt = {"$and": [filt, id_filt]} if filt else id_filt
        else:
            filt = self._build_filter(subject, topic, difficulty, search, question_type, exam_tag)
        if extra_filter:
            filt = {"$and": [filt, extra_filter]} if filt else extra_filter
        total = await self._col.count_documents(filt)
        cursor = (
            self._col.find(filt)
            .sort("updated_at", -1)
            .skip((page - 1) * page_size)
            .limit(page_size)
        )
        items = [self._doc_to_admin(d) async for d in cursor]
        return items, total

    async def find_ids_by_text_hash(self, question_text: str) -> List[str]:
        """Simple duplicate detection by normalized text."""
        norm = " ".join(question_text.lower().split())
        cursor = self._col.find({"question_text_norm": norm}, {"_id": 1})
        return [oid_str(d["_id"]) async for d in cursor]

    async def list_ids_by_difficulty_excluding(
        self,
        difficulty: Difficulty,
        exclude_ids: Sequence[str],
        subject: Optional[str] = None,
        topic: Optional[str] = None,
        exam_tag: Optional[str] = None,
        pool_ids: Optional[Sequence[str]] = None,
    ) -> List[ObjectId]:
        filt: Dict[str, Any] = {"difficulty": difficulty.value}
        pool_oids: List[ObjectId] = []
        if pool_ids:
            pool_oids = [ObjectId(str(x).strip()) for x in pool_ids if x and ObjectId.is_valid(str(x).strip())]
            if not pool_oids:
                return []
        id_clause: Dict[str, Any] = {}
        if pool_oids:
            id_clause["$in"] = pool_oids
        if exclude_ids:
            ex = [ObjectId(x) for x in exclude_ids if ObjectId.is_valid(str(x).strip())]
            if ex:
                id_clause["$nin"] = ex
        if id_clause:
            filt["_id"] = id_clause
        if not pool_oids:
            if subject:
                filt["subject"] = subject
            if topic:
                filt["topic"] = topic
            if exam_tag:
                filt["tags"] = {"$in": [str(exam_tag).strip().upper()]}
        cursor = self._col.find(filt, {"_id": 1})
        return [d["_id"] async for d in cursor]

    async def pick_random_id(
        self,
        difficulty: Difficulty,
        exclude_ids: Sequence[str],
        subject: Optional[str] = None,
        topic: Optional[str] = None,
        exam_tag: Optional[str] = None,
        pool_ids: Optional[Sequence[str]] = None,
    ) -> Optional[str]:
        ids = await self.list_ids_by_difficulty_excluding(
            difficulty, exclude_ids, subject, topic, exam_tag, pool_ids
        )
        if not ids:
            return None
        return oid_str(random.choice(ids))

    async def list_topics(self, subject: Optional[str] = None) -> List[str]:
        filt: Dict[str, Any] = {}
        if subject:
            filt["subject"] = subject
        vals = await self._col.distinct("topic", filt)
        cleaned = [str(v).strip() for v in vals if str(v).strip()]
        return sorted(set(cleaned), key=lambda x: x.lower())

    async def list_subjects(self) -> List[str]:
        vals = await self._col.distinct("subject", {})
        cleaned = [str(v).strip() for v in vals if str(v).strip()]
        return sorted(set(cleaned), key=lambda x: x.lower())

    async def list_exam_tags(self) -> List[str]:
        vals = await self._col.distinct("tags", {})
        cleaned = [str(v).strip().upper() for v in vals if str(v).strip()]
        return sorted(set(cleaned))

    async def aggregate_folder_tree(self, extra_filter: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """Group questions by exam tag (unwound from tags[]) and subject with difficulty counts."""
        pipeline: List[Dict[str, Any]] = []
        if extra_filter:
            pipeline.append({"$match": extra_filter})
        pipeline.extend(
            [
                {"$unwind": "$tags"},
                {
                    "$group": {
                        "_id": {
                            "exam_tag": "$tags",
                            "subject": "$subject",
                            "topic": "$topic",
                            "difficulty": "$difficulty",
                        },
                        "count": {"$sum": 1},
                    }
                },
            ]
        )
        rows: List[Dict[str, Any]] = []
        async for doc in self._col.aggregate(pipeline):
            rows.append(doc)
        return rows

    def _merge_filters(self, base: Dict[str, Any], extra: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        if not extra:
            return base
        if not base:
            return extra
        return {"$and": [base, extra]}

    @staticmethod
    def _doc_matches_folder(
        doc: Dict[str, Any],
        from_exam_n: str,
        from_subject_n: Optional[str],
        from_topic_n: Optional[str],
    ) -> bool:
        from app.repositories.admin_question_bank_tree_repository import normalize_topic_name
        from app.utils.exam_tags import normalize_exam_tag, normalize_subject_name

        doc_tags = list(doc.get("tags") or [])
        if not any(normalize_exam_tag(str(t)) == from_exam_n for t in doc_tags):
            return False
        if from_subject_n and normalize_subject_name(str(doc.get("subject", ""))) != from_subject_n:
            return False
        if from_topic_n and normalize_topic_name(str(doc.get("topic", ""))) != from_topic_n:
            return False
        return True

    async def _iter_folder_docs(
        self,
        from_exam: str,
        from_subject: Optional[str],
        from_topic: Optional[str],
        extra_filter: Optional[Dict[str, Any]] = None,
    ):
        from app.repositories.admin_question_bank_tree_repository import normalize_topic_name
        from app.utils.exam_tags import normalize_exam_tag, normalize_subject_name

        from_exam_n = normalize_exam_tag(from_exam)
        from_subject_n = normalize_subject_name(from_subject) if from_subject else None
        from_topic_n = normalize_topic_name(from_topic) if from_topic else None

        filt: Dict[str, Any] = {
            "tags": {"$elemMatch": {"$regex": f"^{re.escape(from_exam_n)}$", "$options": "i"}}
        }
        filt = self._merge_filters(filt, extra_filter)
        async for doc in self._col.find(filt):
            if self._doc_matches_folder(doc, from_exam_n, from_subject_n, from_topic_n):
                yield doc

    async def list_topics_in_folder(
        self,
        exam_tag: str,
        subject: str,
        extra_filter: Optional[Dict[str, Any]] = None,
    ) -> List[str]:
        from app.repositories.admin_question_bank_tree_repository import normalize_topic_name
        from app.utils.exam_tags import normalize_exam_tag, normalize_subject_name

        exam_n = normalize_exam_tag(exam_tag)
        subject_n = normalize_subject_name(subject)
        topics: set[str] = set()
        async for doc in self._iter_folder_docs(exam_n, subject_n, None, extra_filter):
            top = normalize_topic_name(str(doc.get("topic", "")))
            if top:
                topics.add(top)
        return sorted(topics, key=lambda t: t.lower())

    async def count_in_folder(
        self,
        exam_tag: str,
        subject: Optional[str] = None,
        topic: Optional[str] = None,
        extra_filter: Optional[Dict[str, Any]] = None,
    ) -> int:
        filt: Dict[str, Any] = {"tags": {"$in": [exam_tag]}}
        if subject:
            filt["subject"] = subject
        if topic:
            filt["topic"] = topic
        filt = self._merge_filters(filt, extra_filter)
        return await self._col.count_documents(filt)

    async def replace_exam_tag(
        self,
        old_tag: str,
        new_tag: str,
        extra_filter: Optional[Dict[str, Any]] = None,
    ) -> int:
        filt: Dict[str, Any] = {"tags": old_tag}
        filt = self._merge_filters(filt, extra_filter)
        updated = 0
        async for doc in self._col.find(filt):
            tags = [str(t).strip().upper() for t in (doc.get("tags") or []) if str(t).strip()]
            new_tags: List[str] = []
            for t in tags:
                if t == old_tag:
                    if new_tag not in new_tags:
                        new_tags.append(new_tag)
                elif t not in new_tags:
                    new_tags.append(t)
            if new_tag not in new_tags:
                new_tags.append(new_tag)
            if not new_tags:
                new_tags = [new_tag]
            res = await self._col.update_one(
                {"_id": doc["_id"]},
                {"$set": {"tags": new_tags, "updated_at": _utc_now()}},
            )
            if res.modified_count:
                updated += 1
        return updated

    async def rename_subject_in_category(
        self,
        exam_tag: str,
        old_subject: str,
        new_subject: str,
        extra_filter: Optional[Dict[str, Any]] = None,
    ) -> int:
        filt: Dict[str, Any] = {"tags": {"$in": [exam_tag]}, "subject": old_subject}
        filt = self._merge_filters(filt, extra_filter)
        res = await self._col.update_many(
            filt,
            {"$set": {"subject": new_subject, "updated_at": _utc_now()}},
        )
        return int(res.modified_count)

    async def delete_in_folder(
        self,
        exam_tag: str,
        subject: Optional[str] = None,
        topic: Optional[str] = None,
        extra_filter: Optional[Dict[str, Any]] = None,
    ) -> int:
        filt: Dict[str, Any] = {"tags": {"$in": [exam_tag]}}
        if subject:
            filt["subject"] = subject
        if topic:
            filt["topic"] = topic
        filt = self._merge_filters(filt, extra_filter)
        res = await self._col.delete_many(filt)
        return int(res.deleted_count)

    async def move_folder_contents(
        self,
        from_exam: str,
        from_subject: Optional[str],
        from_topic: Optional[str],
        to_exam: str,
        to_subject: Optional[str],
        to_topic: Optional[str],
        extra_filter: Optional[Dict[str, Any]] = None,
    ) -> int:
        from app.repositories.admin_question_bank_tree_repository import normalize_topic_name
        from app.utils.exam_tags import normalize_exam_tag, normalize_subject_name

        to_exam_n = normalize_exam_tag(to_exam)
        from_exam_n = normalize_exam_tag(from_exam)
        to_subject_n = normalize_subject_name(to_subject) if to_subject is not None else None
        to_topic_n = normalize_topic_name(to_topic) if to_topic is not None else None

        updated = 0
        async for doc in self._iter_folder_docs(from_exam, from_subject, from_topic, extra_filter):
            doc_tags = list(doc.get("tags") or [])
            tags = self._tags_after_move(doc_tags, from_exam_n, to_exam_n)
            patch: Dict[str, Any] = {"tags": tags, "updated_at": _utc_now()}
            if to_subject_n is not None:
                patch["subject"] = to_subject_n
            if to_topic_n is not None:
                patch["topic"] = to_topic_n
            res = await self._col.update_one({"_id": doc["_id"]}, {"$set": patch})
            if res.matched_count:
                updated += 1
        return updated

    async def copy_folder_contents(
        self,
        from_exam: str,
        from_subject: Optional[str],
        from_topic: Optional[str],
        to_exam: str,
        to_subject: Optional[str],
        to_topic: Optional[str],
        extra_filter: Optional[Dict[str, Any]] = None,
    ) -> List[str]:
        from app.repositories.admin_question_bank_tree_repository import normalize_topic_name
        from app.utils.exam_tags import normalize_exam_tag, normalize_subject_name

        to_exam_n = normalize_exam_tag(to_exam)
        to_subject_n = normalize_subject_name(to_subject) if to_subject is not None else None
        to_topic_n = normalize_topic_name(to_topic) if to_topic is not None else None

        new_ids: List[str] = []
        seen_passages: set[str] = set()
        async for doc in self._iter_folder_docs(from_exam, from_subject, from_topic, extra_filter):
            qid = oid_str(doc["_id"])
            passage_id = doc.get("passage_id")
            if passage_id and str(passage_id) not in seen_passages:
                from app.repositories.reading_passage_repository import ReadingPassageRepository

                passage_doc = await ReadingPassageRepository().get(str(passage_id))
                if passage_doc:
                    copied = await self.copy_passage_group_to_folder(
                        str(passage_id),
                        passage_doc,
                        to_exam_n,
                        to_subject_n or normalize_subject_name(doc.get("subject", "General")),
                    )
                    new_ids.extend(copied)
                seen_passages.add(str(passage_id))
                continue
            if passage_id:
                continue
            subj = to_subject_n if to_subject_n is not None else normalize_subject_name(str(doc.get("subject", "General")))
            top = to_topic_n if to_topic_n is not None else normalize_topic_name(str(doc.get("topic", "General")))
            new_ids.append(await self._duplicate_question_doc(doc, to_exam_n, subj, passage_id=None, to_topic=top))
        return new_ids

    @staticmethod
    def _tags_after_move(tags: List[str], from_tag: str, to_tag: str) -> List[str]:
        from app.utils.exam_tags import normalize_exam_tag

        from_n = normalize_exam_tag(from_tag)
        to_n = normalize_exam_tag(to_tag)
        out: List[str] = []
        for raw in tags:
            t = normalize_exam_tag(str(raw))
            if not str(raw or "").strip() and t == "OTHER":
                continue
            if t == from_n:
                if to_n not in out:
                    out.append(to_n)
            elif t not in out:
                out.append(t)
        if to_n not in out:
            out.append(to_n)
        return out or [to_n]

    async def move_questions_to_folder(
        self,
        question_ids: List[str],
        from_exam_tag: str,
        to_exam_tag: str,
        to_subject: str,
    ) -> int:
        docs = await self.list_by_ids(question_ids)
        expanded_ids: List[str] = []
        seen_passages: set[str] = set()
        for qid in question_ids:
            doc = docs.get(str(qid).strip())
            if not doc:
                continue
            passage_id = doc.get("passage_id")
            if passage_id and str(passage_id) not in seen_passages:
                group = await self.list_by_passage_id(str(passage_id))
                expanded_ids.extend(oid_str(d["_id"]) for d in group)
                seen_passages.add(str(passage_id))
            elif not passage_id:
                expanded_ids.append(str(qid).strip())

        docs = await self.list_by_ids(expanded_ids)
        updated = 0
        for qid, doc in docs.items():
            tags = self._tags_after_move(list(doc.get("tags") or []), from_exam_tag, to_exam_tag)
            res = await self._col.update_one(
                {"_id": doc["_id"]},
                {"$set": {"tags": tags, "subject": to_subject, "updated_at": _utc_now()}},
            )
            if res.modified_count:
                updated += 1
        return updated

    async def apply_exam_tag_transfer(
        self,
        question_ids: List[str],
        dest_exam: str,
        *,
        remove_source_exam: Optional[str] = None,
    ) -> int:
        """Add dest exam tag; optionally remove source exam tag. Subject and topic stay unchanged."""
        from app.utils.exam_tags import append_exam_tag, is_others_exam, remove_exam_tag

        docs = await self.list_by_ids(question_ids)
        expanded: List[str] = []
        seen: set[str] = set()
        seen_passages: set[str] = set()
        for raw in question_ids:
            qid = str(raw).strip()
            if not qid or qid in seen:
                continue
            doc = docs.get(qid)
            if not doc:
                continue
            passage_id = doc.get("passage_id")
            if passage_id and str(passage_id) not in seen_passages:
                group = await self.list_by_passage_id(str(passage_id))
                for gdoc in group:
                    gid = oid_str(gdoc["_id"])
                    if gid not in seen:
                        seen.add(gid)
                        expanded.append(gid)
                        docs[gid] = gdoc
                seen_passages.add(str(passage_id))
            elif not passage_id:
                seen.add(qid)
                expanded.append(qid)

        updated = 0
        for qid in expanded:
            doc = docs.get(qid)
            if not doc:
                continue
            tags = list(doc.get("tags") or [])
            if remove_source_exam:
                tags = remove_exam_tag(tags, remove_source_exam)
            if not is_others_exam(dest_exam):
                tags = append_exam_tag(tags, dest_exam)
            res = await self._col.update_one(
                {"_id": doc["_id"]},
                {"$set": {"tags": tags, "updated_at": _utc_now()}},
            )
            if res.matched_count:
                updated += 1
        return updated

    async def rehome_questions(
        self,
        question_ids: List[str],
        to_exam: str,
        to_subject: Optional[str] = None,
        to_topic: Optional[str] = None,
    ) -> int:
        from app.repositories.admin_question_bank_tree_repository import normalize_topic_name
        from app.utils.exam_tags import OTHERS_EXAM_TAG, normalize_exam_tag, normalize_subject_name

        docs = await self.list_by_ids(question_ids)
        exam_n = normalize_exam_tag(to_exam)
        tags: List[str] = [] if exam_n == OTHERS_EXAM_TAG else [exam_n]
        updated = 0
        seen: set[str] = set()
        for raw in question_ids:
            qid = str(raw).strip()
            if not qid or qid in seen:
                continue
            seen.add(qid)
            doc = docs.get(qid)
            if not doc:
                continue
            patch: Dict[str, Any] = {"tags": tags, "updated_at": _utc_now()}
            if to_subject is not None:
                patch["subject"] = normalize_subject_name(to_subject)
            if to_topic is not None:
                patch["topic"] = normalize_topic_name(to_topic)
            res = await self._col.update_one({"_id": doc["_id"]}, {"$set": patch})
            if res.matched_count:
                updated += 1
        return updated

    async def copy_questions_to_folder(
        self,
        question_ids: List[str],
        to_exam_tag: str,
        to_subject: Optional[str] = None,
        to_topic: Optional[str] = None,
    ) -> List[str]:
        from app.repositories.reading_passage_repository import ReadingPassageRepository
        from app.utils.exam_tags import normalize_subject_name

        docs = await self.list_by_ids(question_ids)
        new_ids: List[str] = []
        seen_passages: set[str] = set()
        passage_repo = ReadingPassageRepository()
        for qid in question_ids:
            doc = docs.get(str(qid).strip())
            if not doc:
                continue
            dest_subject = (
                normalize_subject_name(to_subject)
                if to_subject
                else normalize_subject_name(str(doc.get("subject", "General")))
            )
            passage_id = doc.get("passage_id")
            if passage_id and str(passage_id) not in seen_passages:
                passage_doc = await passage_repo.get(str(passage_id))
                if passage_doc:
                    new_ids.extend(
                        await self.copy_passage_group_to_folder(
                            str(passage_id), passage_doc, to_exam_tag, dest_subject
                        )
                    )
                else:
                    nid = await self._duplicate_question_doc(
                        doc, to_exam_tag, dest_subject, passage_id=None, to_topic=to_topic
                    )
                    new_ids.append(nid)
                seen_passages.add(str(passage_id))
                continue
            if passage_id:
                continue
            nid = await self._duplicate_question_doc(
                doc, to_exam_tag, dest_subject, passage_id=None, to_topic=to_topic
            )
            new_ids.append(nid)
        return new_ids

    async def copy_passage_group_to_folder(
        self,
        passage_id: str,
        passage_doc: Dict[str, Any],
        to_exam_tag: str,
        to_subject: str,
    ) -> List[str]:
        from app.repositories.reading_passage_repository import ReadingPassageRepository

        group = await self.list_by_passage_id(passage_id)
        new_passage_id = await ReadingPassageRepository().insert(
            {
                "title": passage_doc.get("title", ""),
                "passage_text": passage_doc.get("passage_text", ""),
                "image_url": passage_doc.get("image_url"),
                "subject": to_subject,
                "topic": passage_doc.get("topic", "Reading Comprehension"),
                "tags": [] if str(to_exam_tag).strip().upper() in {"OTHERS", "OTHER", ""} else [to_exam_tag],
                "sub_question_count": len(group),
            }
        )
        new_ids: List[str] = []
        for sub in group:
            nid = await self._duplicate_question_doc(sub, to_exam_tag, to_subject, passage_id=new_passage_id)
            new_ids.append(nid)
        return new_ids

    async def _duplicate_question_doc(
        self,
        doc: Dict[str, Any],
        to_exam_tag: str,
        to_subject: str,
        passage_id: Optional[str],
        to_topic: Optional[str] = None,
    ) -> str:
        now = _utc_now()
        data = {k: v for k, v in doc.items() if k not in ("_id", "created_at", "updated_at")}
        data["subject"] = to_subject
        if to_topic is not None:
            data["topic"] = to_topic
        from app.utils.exam_tags import OTHERS_EXAM_TAG, normalize_exam_tag

        exam_n = normalize_exam_tag(to_exam_tag)
        data["tags"] = [] if exam_n == OTHERS_EXAM_TAG else [exam_n]
        if passage_id is not None:
            data["passage_id"] = passage_id
        elif "passage_id" in data:
            del data["passage_id"]
            data.pop("sub_question_index", None)
        data["created_at"] = now
        data["updated_at"] = now
        res = await self._col.insert_one(data)
        return oid_str(res.inserted_id)
