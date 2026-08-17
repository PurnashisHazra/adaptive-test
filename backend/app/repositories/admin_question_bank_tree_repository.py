"""Persistent per-admin question bank folder tree (Exam → Subject → Topic)."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from motor.motor_asyncio import AsyncIOMotorCollection

from app.db.mongodb import get_database
from app.utils.exam_tags import OTHERS_DISPLAY_NAME, OTHERS_EXAM_TAG, normalize_exam_tag, normalize_subject_name


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def normalize_topic_name(raw: str) -> str:
    return " ".join(str(raw or "").strip().split())[:400] or "General"


def unique_question_ids(ids: Optional[List[Any]]) -> List[str]:
    out: List[str] = []
    seen: set[str] = set()
    for raw in ids or []:
        qid = str(raw).strip()
        if not qid or qid in seen:
            continue
        seen.add(qid)
        out.append(qid)
    return out


class AdminQuestionBankTreeRepository:
    SCHEMA_VERSION = 2

    def __init__(self) -> None:
        self._col: AsyncIOMotorCollection = get_database()["admin_question_bank_trees"]

    async def ensure_indexes(self) -> None:
        await self._col.create_index([("_id", 1)])

    async def get_exams(self, admin_username: str) -> Optional[List[Dict[str, Any]]]:
        doc = await self._col.find_one({"_id": admin_username})
        if not doc:
            return None
        return list(doc.get("exams") or [])

    async def save_exams(self, admin_username: str, exams: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        now = _utc_now()
        await self._col.update_one(
            {"_id": admin_username},
            {
                "$set": {
                    "exams": exams,
                    "schema_version": self.SCHEMA_VERSION,
                    "updated_at": now,
                },
                "$setOnInsert": {"created_at": now},
            },
            upsert=True,
        )
        return exams

    async def replace_exams(self, admin_username: str, exams: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        return await self.save_exams(admin_username, deepcopy(exams))

    @staticmethod
    def add_question_id(node: Dict[str, Any], qid: str) -> None:
        qid = str(qid).strip()
        if not qid:
            return
        ids = node.setdefault("question_ids", [])
        if qid not in ids:
            ids.append(qid)

    @staticmethod
    def extend_question_ids(node: Dict[str, Any], qids: List[str]) -> None:
        ids = node.setdefault("question_ids", [])
        seen = set(ids)
        for qid in unique_question_ids(qids):
            if qid not in seen:
                ids.append(qid)
                seen.add(qid)

    @staticmethod
    def new_exam(exam_tag: str, display_name: Optional[str] = None) -> Dict[str, Any]:
        tag = normalize_exam_tag(exam_tag)
        if tag == OTHERS_EXAM_TAG:
            display = (display_name or OTHERS_DISPLAY_NAME).strip()
        else:
            display = (display_name or tag).strip()
        return {
            "exam_tag": tag,
            "display_name": display,
            "question_ids": [],
            "subjects": [],
        }

    @staticmethod
    def new_subject(subject: str, display_name: Optional[str] = None) -> Dict[str, Any]:
        subj = normalize_subject_name(subject)
        return {
            "subject": subj,
            "display_name": (display_name or subj).strip(),
            "question_ids": [],
            "topics": [],
        }

    @staticmethod
    def new_topic(topic: str) -> Dict[str, Any]:
        return {
            "topic": normalize_topic_name(topic),
            "question_ids": [],
        }

    @staticmethod
    def topic_name(raw: Any) -> str:
        if isinstance(raw, dict):
            return normalize_topic_name(str(raw.get("topic", "")))
        return normalize_topic_name(str(raw or ""))

    @classmethod
    def find_exam(cls, exams: List[Dict[str, Any]], exam_tag: str) -> Optional[Dict[str, Any]]:
        tag = normalize_exam_tag(exam_tag)
        for exam in exams:
            if str(exam.get("exam_tag", "")).upper() == tag:
                return exam
        return None

    @staticmethod
    def find_subject(exam: Dict[str, Any], subject: str) -> Optional[Dict[str, Any]]:
        subj = normalize_subject_name(subject)
        for row in exam.get("subjects") or []:
            if str(row.get("subject", "")) == subj:
                return row
        return None

    @classmethod
    def find_topic(cls, subject: Dict[str, Any], topic: str) -> Optional[Dict[str, Any]]:
        top = normalize_topic_name(topic)
        topics = subject.get("topics") or []
        for i, raw in enumerate(topics):
            if cls.topic_name(raw) != top:
                continue
            if isinstance(raw, dict):
                raw.setdefault("question_ids", [])
                return raw
            node = cls.new_topic(top)
            topics[i] = node
            return node
        return None

    @classmethod
    def ensure_topic(cls, subject: Dict[str, Any], topic: str) -> Dict[str, Any]:
        existing = cls.find_topic(subject, topic)
        if existing:
            return existing
        node = cls.new_topic(topic)
        subject.setdefault("topics", []).append(node)
        subject["topics"].sort(key=lambda t: cls.topic_name(t).lower())
        return node

    @classmethod
    def has_topic(cls, subject: Dict[str, Any], topic: str) -> bool:
        return cls.find_topic(subject, topic) is not None

    @staticmethod
    def exam_index(exams: List[Dict[str, Any]], exam_tag: str) -> int:
        tag = normalize_exam_tag(exam_tag)
        for i, exam in enumerate(exams):
            if str(exam.get("exam_tag", "")).upper() == tag:
                return i
        return -1

    @staticmethod
    def subject_index(exam: Dict[str, Any], subject: str) -> int:
        subj = normalize_subject_name(subject)
        for i, row in enumerate(exam.get("subjects") or []):
            if str(row.get("subject", "")) == subj:
                return i
        return -1

    @classmethod
    def topic_index(cls, subject: Dict[str, Any], topic: str) -> int:
        top = normalize_topic_name(topic)
        for i, raw in enumerate(subject.get("topics") or []):
            if cls.topic_name(raw) == top:
                return i
        return -1

    @classmethod
    def ids_for_path(
        cls,
        exams: List[Dict[str, Any]],
        exam_tag: str,
        subject: Optional[str] = None,
        topic: Optional[str] = None,
    ) -> List[str]:
        exam = cls.find_exam(exams, exam_tag)
        if not exam:
            return []
        if not subject:
            return unique_question_ids(exam.get("question_ids"))
        subj = cls.find_subject(exam, subject)
        if not subj:
            return []
        if not topic:
            return unique_question_ids(subj.get("question_ids"))
        top = cls.find_topic(subj, topic)
        if not top:
            return []
        return unique_question_ids(top.get("question_ids"))

    @classmethod
    def iter_paths(cls, exams: List[Dict[str, Any]]) -> List[Tuple[str, Optional[str], Optional[str]]]:
        out: List[Tuple[str, Optional[str], Optional[str]]] = []
        for exam in exams:
            tag = str(exam.get("exam_tag", "")).upper()
            subjects = exam.get("subjects") or []
            if not subjects:
                out.append((tag, None, None))
                continue
            for subj_row in subjects:
                subj = str(subj_row.get("subject", ""))
                topics = subj_row.get("topics") or []
                if not topics:
                    out.append((tag, subj, None))
                    continue
                for raw in topics:
                    out.append((tag, subj, cls.topic_name(raw)))
        return out
