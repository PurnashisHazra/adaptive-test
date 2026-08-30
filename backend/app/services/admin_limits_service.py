from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from app.models.domain import Difficulty
from app.utils.ist_time import month_bounds_ist, utc_now
from app.repositories.attempt_repository import AttemptRepository
from app.repositories.paper_repository import PaperRepository
from app.repositories.question_repository import QuestionRepository
from app.repositories.user_repository import UserRepository
from app.schemas.admin_limits import AdminLimits, AdminLimitsUsage, QuestionBankFilter
from app.schemas.auth import Role
from app.utils.roles import parse_role


def _month_bounds_utc(now: Optional[datetime] = None) -> Tuple[datetime, datetime]:
    return month_bounds_ist(now)


def _norm_tags(tags: List[str]) -> List[str]:
    return sorted({str(t).strip().upper() for t in tags if str(t).strip()})


def _norm_strs(values: List[str]) -> List[str]:
    return sorted({str(v).strip() for v in values if str(v).strip()})


def _norm_diffs(values: List[str]) -> List[str]:
    out: List[str] = []
    for v in values:
        s = str(v).strip().upper()
        if s in {d.value for d in Difficulty}:
            out.append(s)
    return sorted(set(out))


def parse_admin_limits(raw: Any) -> AdminLimits:
    if not raw or not isinstance(raw, dict):
        return AdminLimits()
    filt_raw = raw.get("question_bank_filter") or {}
    if not isinstance(filt_raw, dict):
        filt_raw = {}
    filt = QuestionBankFilter(
        exam_tags=_norm_tags(list(filt_raw.get("exam_tags") or [])),
        subjects=_norm_strs(list(filt_raw.get("subjects") or [])),
        topics=_norm_strs(list(filt_raw.get("topics") or [])),
        difficulties=_norm_diffs(list(filt_raw.get("difficulties") or [])),
    )
    return AdminLimits(
        max_papers=raw.get("max_papers"),
        max_students=raw.get("max_students"),
        max_monthly_student_attempts=raw.get("max_monthly_student_attempts"),
        question_bank_filter=filt,
    )


def admin_limits_to_doc(limits: AdminLimits) -> Dict[str, Any]:
    f = limits.question_bank_filter
    return {
        "max_papers": limits.max_papers,
        "max_students": limits.max_students,
        "max_monthly_student_attempts": limits.max_monthly_student_attempts,
        "question_bank_filter": {
            "exam_tags": f.exam_tags,
            "subjects": f.subjects,
            "topics": f.topics,
            "difficulties": f.difficulties,
        },
    }


def merge_question_bank_filter(
    base: Dict[str, Any],
    bank_filter: QuestionBankFilter,
) -> Dict[str, Any]:
    """Intersect admin bank restrictions into a Mongo query fragment."""
    parts: List[Dict[str, Any]] = []
    if base:
        parts.append(base)
    if bank_filter.exam_tags:
        parts.append({"tags": {"$in": bank_filter.exam_tags}})
    if bank_filter.subjects:
        parts.append({"subject": {"$in": bank_filter.subjects}})
    if bank_filter.topics:
        parts.append({"topic": {"$in": bank_filter.topics}})
    if bank_filter.difficulties:
        parts.append({"difficulty": {"$in": bank_filter.difficulties}})
    if not parts:
        return {}
    if len(parts) == 1:
        return parts[0]
    return {"$and": parts}


class AdminLimitsService:
    def __init__(self) -> None:
        self._users = UserRepository()
        self._papers = PaperRepository()
        self._attempts = AttemptRepository()
        self._questions = QuestionRepository()

    async def get_admin_user(self, admin_username: str) -> Optional[Dict[str, Any]]:
        user = await self._users.get_by_username(admin_username.strip())
        if not user:
            return None
        role = parse_role(user.get("role", ""))
        if role not in (Role.admin, Role.god):
            return None
        return user

    async def get_limits(self, admin_username: str) -> AdminLimits:
        user = await self._users.get_by_username(admin_username.strip())
        if user and parse_role(user.get("role", "")) == Role.god:
            return AdminLimits()
        user = await self.get_admin_user(admin_username)
        if not user:
            raise ValueError("Admin user not found")
        return parse_admin_limits(user.get("admin_limits"))

    async def set_limits(self, admin_username: str, limits: AdminLimits) -> AdminLimits:
        user = await self.get_admin_user(admin_username)
        if not user:
            raise ValueError("Admin user not found")
        doc = admin_limits_to_doc(limits)
        updated = await self._users.update_user(admin_username, {"admin_limits": doc})
        assert updated is not None
        return parse_admin_limits(updated.get("admin_limits"))

    async def get_usage(self, admin_username: str) -> AdminLimitsUsage:
        user = await self.get_admin_user(admin_username)
        if not user:
            raise ValueError("Admin user not found")
        code = user.get("admin_code")
        students: List[str] = []
        if code:
            rows = await self._users.list_students_by_admin_code(str(code))
            students = [r["username"] for r in rows]
        start, end = _month_bounds_utc()
        monthly = await self._attempts.count_attempts_in_month_for_students(students, start, end)
        monthly += await self._papers.count_paper_attempts_in_month_for_students(students, start, end)
        return AdminLimitsUsage(
            papers_count=await self._papers.count_papers_by_creator(admin_username),
            students_count=len(students),
            monthly_attempts_count=monthly,
        )

    async def assert_can_create_paper(self, admin_username: str) -> None:
        limits = await self.get_limits(admin_username)
        if limits.max_papers is None:
            return
        used = await self._papers.count_papers_by_creator(admin_username)
        if used >= limits.max_papers:
            raise ValueError(
                f"Paper limit reached ({used}/{limits.max_papers}). Contact a super admin to increase your quota."
            )

    async def assert_can_add_student(self, admin_code: str) -> None:
        admin = await self._users.get_admin_by_code(admin_code)
        if not admin:
            return
        limits = parse_admin_limits(admin.get("admin_limits"))
        if limits.max_students is None:
            return
        code = admin.get("admin_code")
        if not code:
            return
        used = await self._users.count_students_by_admin_code(str(code))
        if used >= limits.max_students:
            raise ValueError(
                f"This instructor has reached their student signup limit ({limits.max_students}). "
                "Contact them or a super admin."
            )

    async def assert_student_can_start_attempt(self, student_username: str) -> None:
        user = await self._users.get_by_username(student_username.strip())
        if not user:
            return
        assigned = user.get("assigned_admin_code")
        if not assigned:
            return
        admin = await self._users.get_admin_by_code(str(assigned))
        if not admin:
            return
        limits = parse_admin_limits(admin.get("admin_limits"))
        if limits.max_monthly_student_attempts is None:
            return
        rows = await self._users.list_students_by_admin_code(str(admin["admin_code"]))
        students = [r["username"] for r in rows]
        start, end = _month_bounds_utc()
        used = await self._attempts.count_attempts_in_month_for_students(students, start, end)
        used += await self._papers.count_paper_attempts_in_month_for_students(students, start, end)
        if used >= limits.max_monthly_student_attempts:
            raise ValueError(
                "Your instructor has reached the monthly student attempt limit for this period. "
                "Try again next month or contact them."
            )

    def _doc_matches_bank_filter(self, doc: Dict[str, Any], filt: QuestionBankFilter) -> bool:
        if filt.exam_tags:
            tags = {str(t).strip().upper() for t in doc.get("tags") or [] if str(t).strip()}
            if not tags.intersection(set(filt.exam_tags)):
                return False
        if filt.subjects and str(doc.get("subject", "")).strip() not in filt.subjects:
            return False
        if filt.topics and str(doc.get("topic", "")).strip() not in filt.topics:
            return False
        if filt.difficulties and str(doc.get("difficulty", "")).strip().upper() not in filt.difficulties:
            return False
        return True

    async def question_allowed_for_admin(self, admin_username: str, question_id: str) -> bool:
        limits = await self.get_limits(admin_username)
        filt = limits.question_bank_filter
        if not any([filt.exam_tags, filt.subjects, filt.topics, filt.difficulties]):
            return True
        doc = await self._questions.get_by_id(question_id)
        if not doc:
            return False
        return self._doc_matches_bank_filter(doc, filt)

    async def assert_questions_allowed_for_admin(self, admin_username: str, question_ids: List[str]) -> None:
        for qid in question_ids:
            if qid and not await self.question_allowed_for_admin(admin_username, qid):
                raise ValueError(
                    "One or more questions are outside your question-bank access filters. "
                    "Adjust the paper or contact a super admin."
                )

    async def build_mongo_filter_for_admin(self, admin_username: str, base: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        limits = await self.get_limits(admin_username)
        return merge_question_bank_filter(base or {}, limits.question_bank_filter)
