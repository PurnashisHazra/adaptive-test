from typing import List, Optional

from app.models.domain import QuestionType
from app.repositories.question_repository import QuestionRepository
from app.repositories.reading_passage_repository import ReadingPassageRepository
from app.schemas.question import QuestionCreate, QuestionOption, QuestionUpdate
from app.schemas.reading_passage import (
    RcSetCreate,
    RcSetDetail,
    RcSetListItem,
    RcSetUpdate,
    RcSubQuestionIn,
    RcSubQuestionOut,
    ReadingPassageView,
)
from app.services.question_service import question_create_to_doc, merge_update_doc, _normalize_exam_tags
from app.utils.ids import oid_str


class RcSetService:
    def __init__(self) -> None:
        self._passages = ReadingPassageRepository()
        self._questions = QuestionRepository()

    async def ensure_indexes(self) -> None:
        await self._passages.ensure_indexes()

    async def list_sets(self) -> List[RcSetListItem]:
        rows = await self._passages.list_all()
        out: List[RcSetListItem] = []
        for row in rows:
            pid = oid_str(row["_id"])
            sub_qs = await self._questions.list_by_passage_id(pid)
            out.append(
                RcSetListItem(
                    id=pid,
                    title=str(row.get("title", "")),
                    subject=str(row.get("subject", "")),
                    topic=str(row.get("topic", "")),
                    tags=list(row.get("tags") or []),
                    sub_question_count=len(sub_qs),
                    question_ids=[oid_str(q["_id"]) for q in sub_qs],
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                )
            )
        return out

    async def get_set(self, passage_id: str) -> RcSetDetail:
        row = await self._passages.get(passage_id)
        if not row:
            raise ValueError("RC set not found")
        sub_docs = await self._questions.list_by_passage_id(passage_id)
        return self._to_detail(row, sub_docs)

    async def create_set(self, body: RcSetCreate) -> RcSetDetail:
        tags = _normalize_exam_tags(list(body.tags))
        img = (body.image_url or "").strip() if body.image_url else None
        pid = await self._passages.insert(
            {
                "title": body.title.strip(),
                "passage_text": body.passage_text.strip(),
                "image_url": img or None,
                "subject": body.subject.strip(),
                "topic": body.topic.strip(),
                "tags": tags,
                "sub_question_count": len(body.sub_questions),
            }
        )
        sub_docs = await self._insert_sub_questions(pid, body.sub_questions, body)
        row = await self._passages.get(pid)
        assert row is not None
        return self._to_detail(row, sub_docs)

    async def update_set(self, passage_id: str, body: RcSetUpdate) -> RcSetDetail:
        row = await self._passages.get(passage_id)
        if not row:
            raise ValueError("RC set not found")

        patch: dict = {}
        if body.title is not None:
            patch["title"] = body.title.strip()
        if body.passage_text is not None:
            patch["passage_text"] = body.passage_text.strip()
        if body.image_url is not None:
            s = body.image_url.strip()
            patch["image_url"] = s if s else None
        if body.subject is not None:
            patch["subject"] = body.subject.strip()
        if body.topic is not None:
            patch["topic"] = body.topic.strip()
        if body.tags is not None:
            patch["tags"] = _normalize_exam_tags(list(body.tags))
        if patch:
            await self._passages.update(passage_id, patch)

        if body.sub_questions is not None:
            await self._sync_sub_questions(passage_id, body.sub_questions, row)
            await self._passages.update(passage_id, {"sub_question_count": len(body.sub_questions)})

        row = await self._passages.get(passage_id)
        assert row is not None
        sub_docs = await self._questions.list_by_passage_id(passage_id)
        return self._to_detail(row, sub_docs)

    async def delete_set(self, passage_id: str) -> None:
        row = await self._passages.get(passage_id)
        if not row:
            raise ValueError("RC set not found")
        await self._questions.delete_by_passage_id(passage_id)
        await self._passages.delete(passage_id)

    async def passage_view_for_question(self, qdoc: dict) -> Optional[ReadingPassageView]:
        passage_id = qdoc.get("passage_id")
        if not passage_id:
            return None
        row = await self._passages.get(str(passage_id))
        if not row:
            return None
        return ReadingPassageView(
            id=oid_str(row["_id"]),
            title=str(row.get("title", "")),
            passage_text=str(row.get("passage_text", "")),
            image_url=(str(row["image_url"]).strip() or None) if row.get("image_url") else None,
        )

    async def _insert_sub_questions(
        self,
        passage_id: str,
        subs: List[RcSubQuestionIn],
        meta: RcSetCreate,
    ) -> List[dict]:
        docs: List[dict] = []
        for idx, sub in enumerate(subs, start=1):
            qid = await self._create_sub_question(passage_id, idx, sub, meta)
            doc = await self._questions.get_by_id(qid)
            assert doc is not None
            docs.append(doc)
        return docs

    async def _create_sub_question(
        self,
        passage_id: str,
        index: int,
        sub: RcSubQuestionIn,
        meta: RcSetCreate,
    ) -> str:
        qc = QuestionCreate(
            question_text=sub.question_text,
            question_type=sub.question_type,
            options=sub.options,
            correct_answer=sub.correct_answer,
            explanation=sub.explanation,
            difficulty=sub.difficulty,
            subject=meta.subject.strip(),
            topic=meta.topic.strip(),
            tags=list(meta.tags),
            image_url=None,
        )
        doc = question_create_to_doc(qc)
        doc["passage_id"] = passage_id
        doc["sub_question_index"] = index
        return await self._questions.insert_one(doc)

    async def _sync_sub_questions(
        self,
        passage_id: str,
        subs: List[RcSubQuestionIn],
        passage_row: dict,
    ) -> None:
        existing = await self._questions.list_by_passage_id(passage_id)
        existing_by_id = {oid_str(d["_id"]): d for d in existing}
        keep_ids: set[str] = set()

        subject = str(passage_row.get("subject", "Verbal Ability"))
        topic = str(passage_row.get("topic", "Reading Comprehension"))
        tags = list(passage_row.get("tags") or ["CAT"])

        for idx, sub in enumerate(subs, start=1):
            if sub.id and sub.id in existing_by_id:
                keep_ids.add(sub.id)
                ex = existing_by_id[sub.id]
                upd = QuestionUpdate(
                    question_text=sub.question_text,
                    question_type=sub.question_type,
                    options=sub.options,
                    correct_answer=sub.correct_answer,
                    explanation=sub.explanation,
                    difficulty=sub.difficulty,
                    subject=subject,
                    topic=topic,
                    tags=tags,
                )
                patch = merge_update_doc(ex, upd)
                patch["sub_question_index"] = idx
                patch["passage_id"] = passage_id
                await self._questions.update_one(sub.id, patch)
            else:
                meta = RcSetCreate(
                    title=str(passage_row.get("title", "")),
                    passage_text=str(passage_row.get("passage_text", "")),
                    subject=subject,
                    topic=topic,
                    tags=tags,
                    sub_questions=[sub],
                )
                new_id = await self._create_sub_question(passage_id, idx, sub, meta)
                keep_ids.add(new_id)

        for qid in existing_by_id:
            if qid not in keep_ids:
                await self._questions.delete_one(qid)

    @staticmethod
    def _to_detail(row: dict, sub_docs: List[dict]) -> RcSetDetail:
        pid = oid_str(row["_id"])
        subs: List[RcSubQuestionOut] = []
        for doc in sub_docs:
            opts = [
                QuestionOption(key=str(o.get("key", "")), label=str(o.get("label", "")))
                for o in doc.get("options", [])
            ]
            subs.append(
                RcSubQuestionOut(
                    id=oid_str(doc["_id"]),
                    sub_question_index=int(doc.get("sub_question_index") or 0),
                    question_text=str(doc.get("question_text", "")),
                    question_type=doc.get("question_type", QuestionType.MCQ_SINGLE),
                    options=opts,
                    correct_answer=str(doc.get("correct_answer", "")),
                    explanation=doc.get("explanation"),
                    difficulty=doc.get("difficulty", "MEDIUM"),
                )
            )
        return RcSetDetail(
            id=pid,
            title=str(row.get("title", "")),
            passage_text=str(row.get("passage_text", "")),
            image_url=(str(row["image_url"]).strip() or None) if row.get("image_url") else None,
            subject=str(row.get("subject", "")),
            topic=str(row.get("topic", "")),
            tags=list(row.get("tags") or []),
            sub_questions=subs,
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )
