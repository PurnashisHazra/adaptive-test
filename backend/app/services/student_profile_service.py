from typing import Any, Dict, List, Optional

from app.repositories.attempt_repository import AttemptRepository
from app.repositories.paper_repository import PaperRepository
from app.repositories.question_repository import QuestionRepository
from app.repositories.student_profile_repository import StudentProfileRepository
from app.repositories.user_repository import UserRepository
from app.schemas.student_profile import (
    StudentProfileAdminView,
    StudentProfileListItem,
    StudentProfileUpdate,
    StudentSessionControls,
)
from app.utils.ids import oid_str


class StudentProfileService:
    def __init__(self) -> None:
        self._profiles = StudentProfileRepository()
        self._users = UserRepository()
        self._papers = PaperRepository()
        self._attempts = AttemptRepository()
        self._questions = QuestionRepository()

    async def ensure_indexes(self) -> None:
        await self._profiles.ensure_indexes()

    def _defaults(self, username: str) -> Dict[str, Any]:
        return {
            "student_username": username.strip(),
            "display_name": None,
            "practice_attempts_allowance": None,
            "allowed_exam_tags": [],
            "blocked": False,
        }

    async def get_or_create_doc(self, student_username: str) -> Dict[str, Any]:
        uname = student_username.strip()
        row = await self._profiles.get(uname)
        if row:
            return row
        return await self._profiles.upsert(uname, self._defaults(uname))

    def _display_name(self, doc: Dict[str, Any], username: str) -> str:
        dn = (doc.get("display_name") or "").strip()
        return dn or username

    async def _attempts_used(self, username: str) -> int:
        return await self._attempts.count_standalone_for_student(username)

    async def get_session_controls(self, student_username: str) -> StudentSessionControls:
        doc = await self.get_or_create_doc(student_username)
        uname = student_username.strip()
        used = await self._attempts_used(uname)
        allowance = doc.get("practice_attempts_allowance")
        blocked = bool(doc.get("blocked"))
        remaining: Optional[int] = None
        can_start = True
        block_reason: Optional[str] = None

        if blocked:
            can_start = False
            block_reason = "Your account has been blocked from AdapTest. Contact your instructor."
        elif allowance is not None:
            remaining = max(0, int(allowance) - used)
            if remaining <= 0:
                can_start = False
                block_reason = f"You have used all {int(allowance)} practice test attempts allowed."

        return StudentSessionControls(
            student_username=uname,
            display_name=self._display_name(doc, uname),
            blocked=blocked,
            block_reason=block_reason,
            practice_attempts_allowance=int(allowance) if allowance is not None else None,
            practice_attempts_used=used,
            practice_attempts_remaining=remaining,
            allowed_exam_tags=list(doc.get("allowed_exam_tags") or []),
            can_start_practice_test=can_start,
        )

    async def assert_not_blocked(self, student_username: str) -> None:
        doc = await self.get_or_create_doc(student_username)
        if bool(doc.get("blocked")):
            raise ValueError("Your account has been blocked from AdapTest. Contact your instructor.")

    async def assert_can_start_practice_test(
        self,
        student_username: str,
        exam_tag: Optional[str],
    ) -> str:
        """Validate policy; return display name to use for the attempt."""
        controls = await self.get_session_controls(student_username)
        if not controls.can_start_practice_test:
            raise ValueError(controls.block_reason or "Cannot start practice test")

        allowed = [str(t).strip().upper() for t in controls.allowed_exam_tags if str(t).strip()]
        if allowed:
            chosen = (exam_tag or "").strip().upper()
            if not chosen:
                raise ValueError(f"Select an exam type: {', '.join(allowed)}")
            if chosen not in allowed:
                raise ValueError(f"Exam type must be one of: {', '.join(allowed)}")

        return controls.display_name

    async def _admin_code_for(self, admin_username: str) -> Optional[str]:
        admin = await self._users.get_by_username(admin_username.strip())
        if not admin:
            return None
        code = admin.get("admin_code")
        return str(code).strip().upper() if code else None

    async def _student_belongs_to_admin(self, student_username: str, admin_code: str) -> bool:
        user = await self._users.get_by_username(student_username.strip())
        if not user or str(user.get("role", "")).lower() != "student":
            return False
        assigned = user.get("assigned_admin_code")
        return bool(assigned) and str(assigned).strip().upper() == admin_code.strip().upper()

    async def list_students_admin(self, admin_username: str) -> List[StudentProfileListItem]:
        admin_code = await self._admin_code_for(admin_username)
        if not admin_code:
            return []
        users = await self._users.list_students_by_admin_code(admin_code)
        profiles = {p["student_username"]: p for p in await self._profiles.list_all()}
        out: List[StudentProfileListItem] = []
        for u in users:
            uname = u["username"]
            doc = profiles.get(uname) or self._defaults(uname)
            assigns = await self._papers.list_assignments_for_student(uname)
            used = await self._attempts_used(uname)
            out.append(
                StudentProfileListItem(
                    student_username=uname,
                    display_name=doc.get("display_name"),
                    blocked=bool(doc.get("blocked")),
                    practice_attempts_allowance=doc.get("practice_attempts_allowance"),
                    practice_attempts_used=used,
                    allowed_exam_tags=list(doc.get("allowed_exam_tags") or []),
                    assigned_paper_count=len(assigns),
                )
            )
        return out

    async def get_admin_view(self, student_username: str, admin_username: str) -> StudentProfileAdminView:
        uname = student_username.strip()
        admin_code = await self._admin_code_for(admin_username)
        if not admin_code:
            raise ValueError("Your admin account has no admin code yet. Ask a super admin to assign one.")
        if not await self._student_belongs_to_admin(uname, admin_code):
            raise ValueError("Student not found")
        user = await self._users.get_by_username(uname)
        if not user:
            raise ValueError("Student not found")
        doc = await self.get_or_create_doc(uname)
        assigns = await self._papers.list_assignments_for_student(uname)
        used = await self._attempts_used(uname)
        return StudentProfileAdminView(
            student_username=uname,
            display_name=doc.get("display_name"),
            practice_attempts_allowance=doc.get("practice_attempts_allowance"),
            allowed_exam_tags=list(doc.get("allowed_exam_tags") or []),
            blocked=bool(doc.get("blocked")),
            assigned_paper_ids=[str(a["paper_id"]) for a in assigns],
            practice_attempts_used=used,
            updated_at=doc.get("updated_at"),
        )

    async def update_admin(self, student_username: str, admin_username: str, body: StudentProfileUpdate) -> StudentProfileAdminView:
        uname = student_username.strip()
        admin_code = await self._admin_code_for(admin_username)
        if not admin_code:
            raise ValueError("Your admin account has no admin code yet. Ask a super admin to assign one.")
        if not await self._student_belongs_to_admin(uname, admin_code):
            raise ValueError("Student not found")
        user = await self._users.get_by_username(uname)
        if not user:
            raise ValueError("Student not found")

        dn = (body.display_name or "").strip() or None
        await self._profiles.upsert(
            uname,
            {
                "display_name": dn,
                "practice_attempts_allowance": body.practice_attempts_allowance,
                "allowed_exam_tags": body.allowed_exam_tags,
                "blocked": body.blocked,
            },
        )
        await self._papers.sync_assignments_for_student(uname, body.assigned_paper_ids)
        return await self.get_admin_view(uname, admin_username)

    async def list_available_exam_tags(self) -> List[str]:
        from_bank = await self._questions.list_exam_tags()
        from_profiles: set[str] = set()
        for p in await self._profiles.list_all():
            for t in p.get("allowed_exam_tags") or []:
                if str(t).strip():
                    from_profiles.add(str(t).strip().upper())
        return sorted(set(from_bank) | from_profiles)

    async def list_papers_for_admin(self) -> List[Dict[str, str]]:
        rows = await self._papers.list_papers(limit=500)
        return [{"id": oid_str(r["_id"]), "title": str(r.get("title", ""))} for r in rows]
