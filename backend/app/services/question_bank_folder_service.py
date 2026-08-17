from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, List, Optional, Tuple

from app.repositories.admin_question_bank_tree_repository import (
    AdminQuestionBankTreeRepository,
    normalize_topic_name,
)
from app.repositories.question_bank_folder_repository import QuestionBankFolderRepository
from app.repositories.question_repository import QuestionRepository
from app.schemas.question import (
    DifficultyMix,
    EXAM_TAGS,
    QuestionBankFolderExam,
    QuestionBankFolderSubject,
    QuestionBankFolderTopic,
    QuestionBankFolderTree,
)
from app.schemas.question_bank_folder import (
    BulkCopyFoldersRequest,
    BulkCopyFoldersResult,
    BulkMoveFoldersRequest,
    CopyQuestionsRequest,
    CreateCategoryRequest,
    CreateSubjectFolderRequest,
    FolderPath,
    MoveFolderRequest,
    MoveQuestionsRequest,
    RenameCategoryRequest,
    RenameSubjectFolderRequest,
)
from app.models.domain import Difficulty
from app.utils.exam_tags import (
    OTHERS_DISPLAY_NAME,
    OTHERS_EXAM_TAG,
    exam_folders_for_tags,
    is_others_exam,
    normalize_exam_tag,
    normalize_subject_name,
)
from app.repositories.admin_question_bank_tree_repository import unique_question_ids
from app.utils.ids import oid_str


class QuestionBankFolderError(ValueError):
    pass


class QuestionBankFolderService:
    def __init__(self) -> None:
        self._tree = AdminQuestionBankTreeRepository()
        self._legacy = QuestionBankFolderRepository()
        self._questions = QuestionRepository()

    async def ensure_indexes(self) -> None:
        await self._tree.ensure_indexes()
        await self._legacy.ensure_indexes()

    async def _admin_filter(self, admin_username: str) -> Optional[Dict[str, Any]]:
        from app.services.admin_limits_service import AdminLimitsService

        extra = await AdminLimitsService().build_mongo_filter_for_admin(admin_username)
        return extra if extra else None

    async def _load_exams(self, admin_username: str) -> List[Dict[str, Any]]:
        rebuilt = await self._rebuild_from_questions(admin_username)
        persisted = await self._tree.get_exams(admin_username)
        if persisted:
            rebuilt = self._merge_empty_folders(rebuilt, persisted)
        await self._persist_exams(admin_username, rebuilt)
        return rebuilt

    async def _persist_exams(self, admin_username: str, exams: List[Dict[str, Any]]) -> None:
        await self._tree.save_exams(admin_username, exams)

    def _bump_mix(self, node: Dict[str, Any], difficulty: str) -> None:
        mix = node.setdefault("mix", {"EASY": 0, "MEDIUM": 0, "HARD": 0, "EXPERT": 0})
        key = difficulty if difficulty in mix else "MEDIUM"
        mix[key] = int(mix.get(key, 0)) + 1

    async def _rebuild_from_questions(self, admin_username: str) -> List[Dict[str, Any]]:
        extra = await self._admin_filter(admin_username)
        exams_by_tag: Dict[str, Dict[str, Any]] = {}

        async for doc in self._questions.iter_folder_docs(extra if extra else None):
            qid = oid_str(doc["_id"])
            subject = normalize_subject_name(str(doc.get("subject", "") or "General"))
            topic = normalize_topic_name(str(doc.get("topic", "") or "General"))
            diff = str(doc.get("difficulty", "")).strip().upper()
            if diff not in {d.value for d in Difficulty}:
                diff = "MEDIUM"

            for exam_tag in exam_folders_for_tags(list(doc.get("tags") or [])):
                exam = exams_by_tag.get(exam_tag)
                if not exam:
                    display = OTHERS_DISPLAY_NAME if exam_tag == OTHERS_EXAM_TAG else exam_tag
                    exam = self._tree.new_exam(exam_tag, display)
                    exams_by_tag[exam_tag] = exam
                already = qid in (exam.get("question_ids") or [])
                self._tree.add_question_id(exam, qid)
                if not already:
                    self._bump_mix(exam, diff)

                subj = self._tree.find_subject(exam, subject)
                if not subj:
                    subj = self._tree.new_subject(subject)
                    exam.setdefault("subjects", []).append(subj)
                already_s = qid in (subj.get("question_ids") or [])
                self._tree.add_question_id(subj, qid)
                if not already_s:
                    self._bump_mix(subj, diff)

                top = self._tree.ensure_topic(subj, topic)
                already_t = qid in (top.get("question_ids") or [])
                self._tree.add_question_id(top, qid)
                if not already_t:
                    self._bump_mix(top, diff)

        for exam in exams_by_tag.values():
            exam["subjects"] = sorted(exam.get("subjects") or [], key=lambda s: str(s.get("subject", "")).lower())
            for subj in exam["subjects"]:
                subj["question_ids"] = unique_question_ids(subj.get("question_ids"))
                subj["topics"] = sorted(subj.get("topics") or [], key=lambda t: self._tree.topic_name(t).lower())
                for top in subj["topics"]:
                    if isinstance(top, dict):
                        top["question_ids"] = unique_question_ids(top.get("question_ids"))
            exam["question_ids"] = unique_question_ids(exam.get("question_ids"))

        def exam_sort_key(tag: str) -> tuple:
            if tag == OTHERS_EXAM_TAG:
                return (2, tag)
            try:
                return (0, EXAM_TAGS.index(tag))
            except ValueError:
                return (1, tag)

        return sorted(exams_by_tag.values(), key=lambda e: exam_sort_key(str(e.get("exam_tag", "")).upper()))

    def _merge_empty_folders(self, rebuilt: List[Dict[str, Any]], persisted: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        for old_exam in persisted:
            tag = str(old_exam.get("exam_tag", "")).upper()
            if tag in {"OTHER", "OTHERS"}:
                tag = OTHERS_EXAM_TAG
            if not tag:
                continue
            exam = self._tree.find_exam(rebuilt, tag)
            if not exam:
                empty = self._tree.new_exam(tag, str(old_exam.get("display_name") or tag))
                if not empty.get("question_ids"):
                    rebuilt.append(empty)
                    exam = empty
                else:
                    continue
            elif old_exam.get("display_name"):
                exam["display_name"] = str(old_exam.get("display_name"))
            for old_subj in old_exam.get("subjects") or []:
                name = str(old_subj.get("subject", ""))
                if not name:
                    continue
                subj = self._tree.find_subject(exam, name)
                if not subj:
                    subj = self._tree.new_subject(name, str(old_subj.get("display_name") or name))
                    exam.setdefault("subjects", []).append(subj)
                elif old_subj.get("display_name"):
                    subj["display_name"] = str(old_subj.get("display_name"))
                for raw in old_subj.get("topics") or []:
                    tname = self._tree.topic_name(raw)
                    if tname and not self._tree.find_topic(subj, tname):
                        self._tree.ensure_topic(subj, tname)
        return rebuilt

    async def folder_tree_for_admin(self, admin_username: str) -> QuestionBankFolderTree:
        exams_raw = await self._load_exams(admin_username)

        def exam_sort_key(tag: str) -> tuple:
            if tag == OTHERS_EXAM_TAG:
                return (2, tag)
            try:
                return (0, EXAM_TAGS.index(tag))
            except ValueError:
                return (1, tag)

        exams_out: List[QuestionBankFolderExam] = []
        for exam in sorted(exams_raw, key=lambda e: exam_sort_key(str(e.get("exam_tag", "")).upper())):
            exam_tag = normalize_exam_tag(str(exam.get("exam_tag", "")))
            exam_ids = unique_question_ids(exam.get("question_ids"))
            subjects_out: List[QuestionBankFolderSubject] = []
            for subj_row in sorted(exam.get("subjects") or [], key=lambda s: str(s.get("subject", "")).lower()):
                subject = normalize_subject_name(str(subj_row.get("subject", "")))
                subj_ids = unique_question_ids(subj_row.get("question_ids"))
                topics_out: List[QuestionBankFolderTopic] = []
                for raw in sorted(subj_row.get("topics") or [], key=lambda t: self._tree.topic_name(t).lower()):
                    topic = self._tree.topic_name(raw)
                    top_ids = unique_question_ids(raw.get("question_ids") if isinstance(raw, dict) else [])
                    top_mix = (raw.get("mix") if isinstance(raw, dict) else None) or {}
                    mix = DifficultyMix.from_counts(top_mix)
                    mix.total = len(top_ids)
                    topics_out.append(QuestionBankFolderTopic(topic=topic, mix=mix, question_ids=top_ids))
                subj_mix = DifficultyMix.from_counts(subj_row.get("mix") or {})
                subj_mix.total = len(subj_ids)
                subjects_out.append(
                    QuestionBankFolderSubject(
                        subject=subject,
                        display_name=str(subj_row.get("display_name") or subject),
                        mix=subj_mix,
                        question_ids=subj_ids,
                        topics=topics_out,
                    )
                )
            exam_mix = DifficultyMix.from_counts(exam.get("mix") or {})
            exam_mix.total = len(exam_ids)
            exams_out.append(
                QuestionBankFolderExam(
                    exam_tag=exam_tag,
                    display_name=str(exam.get("display_name") or (OTHERS_DISPLAY_NAME if exam_tag == OTHERS_EXAM_TAG else exam_tag)),
                    mix=exam_mix,
                    question_ids=exam_ids,
                    subjects=subjects_out,
                )
            )

        grand_total = sum(len(e.question_ids) for e in exams_out)
        return QuestionBankFolderTree(exams=exams_out, grand_total=grand_total)

    async def question_ids_for_path(
        self,
        admin_username: str,
        exam_tag: str,
        subject: Optional[str] = None,
        topic: Optional[str] = None,
    ) -> List[str]:
        exams = await self._load_exams(admin_username)
        return self._tree.ids_for_path(exams, exam_tag, subject, topic)

    async def ensure_path(
        self,
        admin_username: str,
        exam_tag: str,
        subject: str,
        topic: str,
        question_id: Optional[str] = None,
    ) -> None:
        exams = await self._load_exams(admin_username)
        tag = normalize_exam_tag(exam_tag) if str(exam_tag or "").strip() else OTHERS_EXAM_TAG
        if not str(exam_tag or "").strip():
            tag = OTHERS_EXAM_TAG
        subj = normalize_subject_name(subject)
        top = normalize_topic_name(topic)
        exam = self._tree.find_exam(exams, tag)
        if not exam:
            exam = self._tree.new_exam(tag)
            exams.append(exam)
        subj_row = self._tree.find_subject(exam, subj)
        if not subj_row:
            subj_row = self._tree.new_subject(subj)
            exam.setdefault("subjects", []).append(subj_row)
        topic_row = self._tree.ensure_topic(subj_row, top)
        if question_id:
            self._tree.add_question_id(exam, question_id)
            self._tree.add_question_id(subj_row, question_id)
            self._tree.add_question_id(topic_row, question_id)
        await self._persist_exams(admin_username, exams)

    async def create_category(self, admin_username: str, body: CreateCategoryRequest) -> Dict[str, Any]:
        exams = await self._load_exams(admin_username)
        key = body.category_key
        if self._tree.find_exam(exams, key):
            raise QuestionBankFolderError(f"Category '{body.name.strip()}' already exists")
        display = " ".join(body.name.strip().split())
        exams.append(self._tree.new_exam(key, display))
        await self._persist_exams(admin_username, exams)
        return self._tree.find_exam(exams, key) or {}

    async def create_subject_folder(
        self, admin_username: str, category_key: str, body: CreateSubjectFolderRequest
    ) -> Dict[str, Any]:
        exams = await self._load_exams(admin_username)
        cat = normalize_exam_tag(category_key)
        subject = body.subject_key
        exam = self._tree.find_exam(exams, cat)
        if not exam:
            exam = self._tree.new_exam(cat)
            exams.append(exam)
        if self._tree.find_subject(exam, subject):
            raise QuestionBankFolderError(f"Subject folder '{subject}' already exists in this category")
        exam.setdefault("subjects", []).append(self._tree.new_subject(subject))
        await self._persist_exams(admin_username, exams)
        return self._tree.find_subject(exam, subject) or {}

    async def create_topic_folder(
        self, admin_username: str, category_key: str, subject_key: str, topic_name: str
    ) -> str:
        exams = await self._load_exams(admin_username)
        cat = normalize_exam_tag(category_key)
        subject = normalize_subject_name(subject_key)
        topic = normalize_topic_name(topic_name)
        exam = self._tree.find_exam(exams, cat)
        if not exam:
            raise QuestionBankFolderError("Exam category not found")
        subj_row = self._tree.find_subject(exam, subject)
        if not subj_row:
            raise QuestionBankFolderError("Subject folder not found")
        if self._tree.has_topic(subj_row, topic):
            raise QuestionBankFolderError(f"Topic folder '{topic}' already exists")
        self._tree.ensure_topic(subj_row, topic)
        await self._persist_exams(admin_username, exams)
        return topic

    async def rename_category(
        self, category_key: str, body: RenameCategoryRequest, admin_username: str
    ) -> int:
        exams = await self._load_exams(admin_username)
        old_key = normalize_exam_tag(category_key)
        idx = self._tree.exam_index(exams, old_key)
        if idx < 0:
            raise QuestionBankFolderError("Category not found")
        exam = exams[idx]
        extra = await self._admin_filter(admin_username)
        affected = 0

        if body.new_name:
            new_key = normalize_exam_tag(body.new_name)
            if new_key != old_key:
                if self._tree.find_exam(exams, new_key):
                    raise QuestionBankFolderError(f"Category '{body.new_name.strip()}' already exists")
                affected += await self._questions.replace_exam_tag(old_key, new_key, extra)
                exam["exam_tag"] = new_key
                old_key = new_key

        display = body.display_name or (body.new_name.strip() if body.new_name else None)
        if display:
            exam["display_name"] = display

        await self._persist_exams(admin_username, exams)
        return affected

    async def rename_subject_folder(
        self, category_key: str, subject_key: str, body: RenameSubjectFolderRequest, admin_username: str
    ) -> int:
        exams = await self._load_exams(admin_username)
        cat = normalize_exam_tag(category_key)
        old_subject = normalize_subject_name(subject_key)
        new_subject = body.subject_key
        exam = self._tree.find_exam(exams, cat)
        if not exam:
            raise QuestionBankFolderError("Category not found")
        subj_row = self._tree.find_subject(exam, old_subject)
        if not subj_row:
            raise QuestionBankFolderError("Subject folder not found")
        if old_subject != new_subject and self._tree.find_subject(exam, new_subject):
            raise QuestionBankFolderError(f"Subject folder '{new_subject}' already exists")
        extra = await self._admin_filter(admin_username)
        affected = await self._questions.rename_subject_in_category(cat, old_subject, new_subject, extra)
        subj_row["subject"] = new_subject
        subj_row["display_name"] = new_subject
        await self._persist_exams(admin_username, exams)
        return affected

    async def delete_category(self, category_key: str, admin_username: str) -> int:
        exams = await self._load_exams(admin_username)
        cat = normalize_exam_tag(category_key)
        idx = self._tree.exam_index(exams, cat)
        if idx < 0:
            raise QuestionBankFolderError("Category not found")
        exam = exams[idx]
        ids = unique_question_ids(exam.get("question_ids"))
        deleted = await self._questions.delete_by_ids(ids)
        exams.pop(idx)
        await self._persist_exams(admin_username, exams)
        await self._legacy.delete_category_tree(cat)
        return deleted

    async def delete_subject_folder(self, category_key: str, subject_key: str, admin_username: str) -> int:
        exams = await self._load_exams(admin_username)
        cat = normalize_exam_tag(category_key)
        subject = normalize_subject_name(subject_key)
        exam = self._tree.find_exam(exams, cat)
        if not exam:
            raise QuestionBankFolderError("Category not found")
        sidx = self._tree.subject_index(exam, subject)
        if sidx < 0:
            raise QuestionBankFolderError("Subject folder not found")
        subj_row = exam.get("subjects", [])[sidx]
        ids = unique_question_ids(subj_row.get("question_ids"))
        deleted = await self._questions.delete_by_ids(ids)
        exam.get("subjects", []).pop(sidx)
        await self._persist_exams(admin_username, exams)
        await self._legacy.delete_subject(cat, subject)
        return deleted

    async def delete_topic_folder(
        self, category_key: str, subject_key: str, topic_key: str, admin_username: str
    ) -> int:
        exams = await self._load_exams(admin_username)
        cat = normalize_exam_tag(category_key)
        subject = normalize_subject_name(subject_key)
        topic = normalize_topic_name(topic_key)
        exam = self._tree.find_exam(exams, cat)
        if not exam:
            raise QuestionBankFolderError("Category not found")
        subj_row = self._tree.find_subject(exam, subject)
        if not subj_row:
            raise QuestionBankFolderError("Subject folder not found")
        tidx = self._tree.topic_index(subj_row, topic)
        if tidx < 0:
            raise QuestionBankFolderError("Topic folder not found")
        top_row = (subj_row.get("topics") or [])[tidx]
        ids = unique_question_ids(top_row.get("question_ids") if isinstance(top_row, dict) else [])
        deleted = await self._questions.delete_by_ids(ids)
        subj_row["topics"].pop(tidx)
        await self._persist_exams(admin_username, exams)
        return deleted

    def _merge_subject_nodes(self, dest: Dict[str, Any], src: Dict[str, Any]) -> None:
        self._tree.extend_question_ids(dest, unique_question_ids(src.get("question_ids")))
        for raw in src.get("topics") or []:
            tname = self._tree.topic_name(raw)
            dest_top = self._tree.ensure_topic(dest, tname)
            if isinstance(raw, dict):
                self._tree.extend_question_ids(dest_top, unique_question_ids(raw.get("question_ids")))

    def _prune_empty_tree_nodes(self, exams: List[Dict[str, Any]]) -> None:
        for exam in exams:
            exam["question_ids"] = unique_question_ids(exam.get("question_ids"))
            kept_subjects: List[Dict[str, Any]] = []
            for subj in exam.get("subjects") or []:
                subj["question_ids"] = unique_question_ids(subj.get("question_ids"))
                topics_out: List[Dict[str, Any]] = []
                for raw in subj.get("topics") or []:
                    node = raw if isinstance(raw, dict) else self._tree.new_topic(self._tree.topic_name(raw))
                    node["question_ids"] = unique_question_ids(node.get("question_ids"))
                    topics_out.append(node)
                subj["topics"] = sorted(topics_out, key=lambda t: self._tree.topic_name(t).lower())
                kept_subjects.append(subj)
            exam["subjects"] = kept_subjects

    async def _sync_legacy_after_move(
        self,
        src: FolderPath,
        to_exam: str,
        to_subject: Optional[str],
    ) -> None:
        if src.depth == 2 and src.subject:
            await self._legacy.delete_subject(src.exam_tag, src.subject)
        if to_subject:
            existing = await self._legacy.get_subject(to_exam, to_subject)
            if not existing:
                await self._legacy.insert_subject(to_exam, to_subject)

    async def _sync_legacy_after_copy(self, to_exam: str, to_subject: Optional[str]) -> None:
        if to_subject:
            existing = await self._legacy.get_subject(to_exam, to_subject)
            if not existing:
                await self._legacy.insert_subject(to_exam, to_subject)

    async def _sync_tree_topics_for_subject(
        self,
        exams: List[Dict[str, Any]],
        exam_tag: str,
        subject: str,
        admin_username: str,
    ) -> None:
        if not subject:
            return
        extra = await self._admin_filter(admin_username)
        db_topics = await self._questions.list_topics_in_folder(exam_tag, subject, extra)
        exam = self._tree.find_exam(exams, exam_tag)
        if not exam:
            return
        subj = self._tree.find_subject(exam, subject)
        if not subj:
            return
        merged = {normalize_topic_name(t) for t in (subj.get("topics") or []) if str(t).strip()}
        for top in db_topics:
            merged.add(normalize_topic_name(top))
        if merged:
            subj["topics"] = sorted(merged, key=lambda t: t.lower())
        elif not subj.get("topics"):
            subj["topics"] = ["General"]

    def _merge_exam_nodes(self, dest: Dict[str, Any], src: Dict[str, Any]) -> None:
        for subj in src.get("subjects") or []:
            name = str(subj.get("subject", ""))
            existing = self._tree.find_subject(dest, name)
            if existing:
                self._merge_subject_nodes(existing, subj)
            else:
                dest.setdefault("subjects", []).append(deepcopy(subj))

    def _resolve_move_dest(
        self, src: FolderPath, dst: FolderPath
    ) -> Tuple[str, Optional[str], Optional[str]]:
        """Destination is the exam category. Nested subject/topic names stay on the source folder."""
        to_exam = normalize_exam_tag(dst.exam_tag)
        if src.depth == 1:
            return to_exam, None, None
        if src.depth == 2:
            if not src.subject:
                raise QuestionBankFolderError("Source subject is required")
            return to_exam, src.subject, None
        if not src.subject or not src.topic:
            raise QuestionBankFolderError("Source subject and topic are required")
        return to_exam, src.subject, src.topic

    def _validate_move(
        self,
        exams: List[Dict[str, Any]],
        src: FolderPath,
        to_exam: str,
        to_subject: Optional[str],
        to_topic: Optional[str],
        *,
        allow_same_dest: bool = False,
    ) -> None:
        if src.depth == 1:
            if src.exam_tag == to_exam:
                raise QuestionBankFolderError("Cannot move a category into itself")
            if self._tree.exam_index(exams, src.exam_tag) < 0:
                raise QuestionBankFolderError("Source category not found")
            return

        if src.depth == 2:
            if not src.subject:
                raise QuestionBankFolderError("Source subject is required")
            if src.exam_tag == to_exam and src.subject == to_subject and not allow_same_dest:
                raise QuestionBankFolderError("Source and destination are the same")
            src_exam = self._tree.find_exam(exams, src.exam_tag)
            if not src_exam:
                raise QuestionBankFolderError("Source category not found")
            if self._tree.subject_index(src_exam, src.subject) < 0:
                raise QuestionBankFolderError("Source subject not found")
            return

        if src.depth == 3:
            if not src.subject or not src.topic:
                raise QuestionBankFolderError("Source subject and topic are required")
            if (
                src.exam_tag == to_exam
                and src.subject == to_subject
                and normalize_topic_name(src.topic) == normalize_topic_name(to_topic or "")
                and not allow_same_dest
            ):
                raise QuestionBankFolderError("Source and destination are the same")
            src_exam = self._tree.find_exam(exams, src.exam_tag)
            if not src_exam:
                raise QuestionBankFolderError("Source category not found")
            src_subj = self._tree.find_subject(src_exam, src.subject)
            if not src_subj:
                raise QuestionBankFolderError("Source subject not found")
            src_top = normalize_topic_name(src.topic or "")
            if not self._tree.has_topic(src_subj, src_top) and not (
                not (src_subj.get("topics") or []) and src_top == "General"
            ):
                raise QuestionBankFolderError("Source topic not found")
            return

        raise QuestionBankFolderError("Invalid folder depth")

    def _mirror_source_structure_into_dest(
        self,
        exams: List[Dict[str, Any]],
        src: FolderPath,
        to_exam: str,
    ) -> None:
        dest = self._tree.find_exam(exams, to_exam)
        if not dest:
            dest = self._tree.new_exam(to_exam)
            exams.append(dest)
        src_exam = self._tree.find_exam(exams, src.exam_tag)

        if src.depth == 1:
            if not src_exam:
                return
            for subj in src_exam.get("subjects") or []:
                name = str(subj.get("subject", ""))
                if not name:
                    continue
                dest_subj = self._tree.find_subject(dest, name)
                if not dest_subj:
                    dest_subj = self._tree.new_subject(name, str(subj.get("display_name") or name))
                    dest.setdefault("subjects", []).append(dest_subj)
                for raw in subj.get("topics") or []:
                    tname = self._tree.topic_name(raw)
                    if tname:
                        self._tree.ensure_topic(dest_subj, tname)
            return

        if src.depth == 2 and src.subject:
            src_subj = self._tree.find_subject(src_exam, src.subject) if src_exam else None
            dest_subj = self._tree.find_subject(dest, src.subject)
            if not dest_subj:
                dest_subj = self._tree.new_subject(
                    src.subject, str((src_subj or {}).get("display_name") or src.subject)
                )
                dest.setdefault("subjects", []).append(dest_subj)
            if src_subj:
                for raw in src_subj.get("topics") or []:
                    tname = self._tree.topic_name(raw)
                    if tname:
                        self._tree.ensure_topic(dest_subj, tname)
            return

        if src.depth == 3 and src.subject and src.topic:
            dest_subj = self._tree.find_subject(dest, src.subject)
            if not dest_subj:
                dest_subj = self._tree.new_subject(src.subject)
                dest.setdefault("subjects", []).append(dest_subj)
            self._tree.ensure_topic(dest_subj, src.topic)

    def _drop_moved_source_node(self, exams: List[Dict[str, Any]], src: FolderPath) -> None:
        if src.depth == 1:
            idx = self._tree.exam_index(exams, src.exam_tag)
            if idx >= 0 and not unique_question_ids(exams[idx].get("question_ids")):
                exams.pop(idx)
            return
        exam = self._tree.find_exam(exams, src.exam_tag)
        if not exam:
            return
        if src.depth == 2 and src.subject:
            sidx = self._tree.subject_index(exam, src.subject)
            if sidx >= 0 and not unique_question_ids(exam["subjects"][sidx].get("question_ids")):
                exam["subjects"].pop(sidx)
            return
        if src.depth == 3 and src.subject and src.topic:
            subj = self._tree.find_subject(exam, src.subject)
            if not subj:
                return
            tidx = self._tree.topic_index(subj, src.topic)
            if tidx < 0:
                return
            top = (subj.get("topics") or [])[tidx]
            ids = unique_question_ids(top.get("question_ids") if isinstance(top, dict) else [])
            if not ids:
                subj["topics"].pop(tidx)

    async def _transfer_folder(
        self,
        src: FolderPath,
        to_exam: str,
        admin_username: str,
        *,
        copy: bool,
    ) -> List[str]:
        exams = await self._load_exams(admin_username)
        to_subject = src.subject if src.depth >= 2 else None
        to_topic = src.topic if src.depth >= 3 else None
        self._validate_move(exams, src, to_exam, to_subject, to_topic, allow_same_dest=copy)
        if copy and is_others_exam(to_exam):
            raise QuestionBankFolderError(
                "Copy into Others is not supported. Others is only for questions with no exam category."
            )
        ids = unique_question_ids(self._tree.ids_for_path(exams, src.exam_tag, src.subject, src.topic))
        await self._questions.apply_exam_tag_transfer(
            ids, to_exam, remove_source_exam=None if copy else src.exam_tag
        )
        if copy:
            await self._sync_legacy_after_copy(to_exam, to_subject)
        else:
            await self._sync_legacy_after_move(src, to_exam, to_subject)
        exams = await self._load_exams(admin_username)
        self._mirror_source_structure_into_dest(exams, src, to_exam)
        if not copy:
            self._drop_moved_source_node(exams, src)
        await self._persist_exams(admin_username, exams)
        return ids

    def _apply_move_tree(
        self,
        exams: List[Dict[str, Any]],
        src: FolderPath,
        to_exam: str,
        to_subject: Optional[str],
        to_topic: Optional[str],
    ) -> None:
        if src.depth == 1:
            sidx = self._tree.exam_index(exams, src.exam_tag)
            node = exams.pop(sidx)
            node["exam_tag"] = to_exam
            existing = self._tree.find_exam(exams, to_exam)
            if existing:
                self._merge_exam_nodes(existing, node)
            else:
                exams.append(node)
            return

        if src.depth == 2:
            assert src.subject and to_subject
            src_exam = self._tree.find_exam(exams, src.exam_tag)
            assert src_exam is not None
            sidx = self._tree.subject_index(src_exam, src.subject)
            node = src_exam["subjects"].pop(sidx)
            src_display = str(node.get("display_name") or src.subject)
            node["subject"] = to_subject
            node["display_name"] = src_display if normalize_subject_name(to_subject) == normalize_subject_name(src.subject) else to_subject
            dest_exam = self._tree.find_exam(exams, to_exam)
            if not dest_exam:
                dest_exam = self._tree.new_exam(to_exam)
                exams.append(dest_exam)
            dest_subj = self._tree.find_subject(dest_exam, to_subject)
            if dest_subj:
                self._merge_subject_nodes(dest_subj, node)
            else:
                dest_exam.setdefault("subjects", []).append(node)
            return

        assert src.subject and src.topic and to_subject and to_topic
        src_exam = self._tree.find_exam(exams, src.exam_tag)
        assert src_exam is not None
        src_subj = self._tree.find_subject(src_exam, src.subject)
        assert src_subj is not None
        src_subj["topics"] = [
            t for t in src_subj.get("topics") or [] if normalize_topic_name(t) != normalize_topic_name(src.topic)
        ]
        dest_exam = self._tree.find_exam(exams, to_exam)
        if not dest_exam:
            dest_exam = self._tree.new_exam(to_exam)
            exams.append(dest_exam)
        dest_subj = self._tree.find_subject(dest_exam, to_subject)
        if not dest_subj:
            dest_subj = self._tree.new_subject(to_subject)
            dest_exam.setdefault("subjects", []).append(dest_subj)
        top = normalize_topic_name(to_topic)
        if not self._tree.has_topic(dest_subj, top):
            dest_subj.setdefault("topics", []).append(top)
            dest_subj["topics"].sort(key=lambda t: str(t).lower())

    def _apply_copy_tree(
        self,
        exams: List[Dict[str, Any]],
        src: FolderPath,
        to_exam: str,
        to_subject: Optional[str],
        to_topic: Optional[str],
    ) -> None:
        if src.depth == 1:
            src_exam = self._tree.find_exam(exams, src.exam_tag)
            if not src_exam:
                raise QuestionBankFolderError("Source category not found")
            node = deepcopy(src_exam)
            node["exam_tag"] = to_exam
            existing = self._tree.find_exam(exams, to_exam)
            if existing:
                self._merge_exam_nodes(existing, node)
            else:
                exams.append(node)
            return

        if src.depth == 2:
            assert src.subject and to_subject
            src_exam = self._tree.find_exam(exams, src.exam_tag)
            if not src_exam:
                raise QuestionBankFolderError("Source category not found")
            src_subj = self._tree.find_subject(src_exam, src.subject)
            if not src_subj:
                raise QuestionBankFolderError("Source subject not found")
            node = deepcopy(src_subj)
            src_display = str(node.get("display_name") or src.subject)
            node["subject"] = to_subject
            node["display_name"] = src_display if normalize_subject_name(to_subject) == normalize_subject_name(src.subject) else to_subject
            dest_exam = self._tree.find_exam(exams, to_exam)
            if not dest_exam:
                dest_exam = self._tree.new_exam(to_exam)
                exams.append(dest_exam)
            dest_subj = self._tree.find_subject(dest_exam, to_subject)
            if dest_subj:
                self._merge_subject_nodes(dest_subj, node)
            else:
                dest_exam.setdefault("subjects", []).append(node)
            return

        assert src.subject and src.topic and to_subject and to_topic
        src_exam = self._tree.find_exam(exams, src.exam_tag)
        if not src_exam:
            raise QuestionBankFolderError("Source category not found")
        src_subj = self._tree.find_subject(src_exam, src.subject)
        if not src_subj:
            raise QuestionBankFolderError("Source subject not found")
        src_top = normalize_topic_name(src.topic or "")
        topics = [normalize_topic_name(t) for t in (src_subj.get("topics") or [])]
        if not self._tree.has_topic(src_subj, src.topic) and not (not topics and src_top == "General"):
            raise QuestionBankFolderError("Source topic not found")
        dest_exam = self._tree.find_exam(exams, to_exam)
        if not dest_exam:
            dest_exam = self._tree.new_exam(to_exam)
            exams.append(dest_exam)
        dest_subj = self._tree.find_subject(dest_exam, to_subject)
        if not dest_subj:
            dest_subj = self._tree.new_subject(to_subject)
            dest_exam.setdefault("subjects", []).append(dest_subj)
        top = normalize_topic_name(to_topic)
        if not self._tree.has_topic(dest_subj, top):
            dest_subj.setdefault("topics", []).append(top)
            dest_subj["topics"].sort(key=lambda t: str(t).lower())

    async def move_folder(self, body: MoveFolderRequest, admin_username: str) -> int:
        src = body.from_path
        to_exam, _, _ = self._resolve_move_dest(src, body.to_path)
        ids = await self._transfer_folder(src, to_exam, admin_username, copy=False)
        return len(ids)

    async def copy_folder(self, body: MoveFolderRequest, admin_username: str) -> List[str]:
        src = body.from_path
        to_exam, _, _ = self._resolve_move_dest(src, body.to_path)
        return await self._transfer_folder(src, to_exam, admin_username, copy=True)

    async def bulk_move_folders(self, body: BulkMoveFoldersRequest, admin_username: str) -> int:
        if not body.from_paths:
            raise QuestionBankFolderError("Select at least one folder")
        depth = body.from_paths[0].depth
        if any(p.depth != depth for p in body.from_paths):
            raise QuestionBankFolderError("All selected folders must be at the same level")

        total = 0
        to_exam = normalize_exam_tag(body.to_exam_tag)
        for src in body.from_paths:
            ids = await self._transfer_folder(src, to_exam, admin_username, copy=False)
            total += len(ids)
        return total

    async def bulk_copy_folders(self, body: BulkCopyFoldersRequest, admin_username: str) -> Tuple[int, List[str]]:
        if not body.from_paths:
            raise QuestionBankFolderError("Select at least one folder")
        depth = body.from_paths[0].depth
        if any(p.depth != depth for p in body.from_paths):
            raise QuestionBankFolderError("All selected folders must be at the same level")

        all_ids: List[str] = []
        to_exam = normalize_exam_tag(body.to_exam_tag)
        for src in body.from_paths:
            ids = await self._transfer_folder(src, to_exam, admin_username, copy=True)
            all_ids.extend(ids)
        return len(all_ids), all_ids

    async def move_questions(self, body: MoveQuestionsRequest, admin_username: str) -> int:
        from app.services.admin_limits_service import AdminLimitsService

        limits = AdminLimitsService()
        for qid in body.question_ids:
            if not await limits.question_allowed_for_admin(admin_username, qid):
                raise QuestionBankFolderError(f"Question {qid} not found or not allowed")
        await self.ensure_path(admin_username, body.to_exam_tag, body.to_subject, "General")
        moved = await self._questions.rehome_questions(
            body.question_ids, body.to_exam_tag, body.to_subject, None
        )
        await self._load_exams(admin_username)
        return moved

    async def copy_questions(self, body: CopyQuestionsRequest, admin_username: str) -> List[str]:
        from app.services.admin_limits_service import AdminLimitsService

        limits = AdminLimitsService()
        for qid in body.question_ids:
            if not await limits.question_allowed_for_admin(admin_username, qid):
                raise QuestionBankFolderError(f"Question {qid} not found or not allowed")
        await self.ensure_path(admin_username, body.to_exam_tag, body.to_subject, "General")
        new_ids = await self._questions.copy_questions_to_folder(
            body.question_ids, body.to_exam_tag, body.to_subject
        )
        await self._load_exams(admin_username)
        return new_ids
