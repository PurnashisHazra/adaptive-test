from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import ValidationError
from fastapi.responses import StreamingResponse

from app.api.deps import (
    get_bulk_import_service,
    get_pdf_question_import_service,
    get_question_service,
    get_r2_storage_service,
)
from app.models.domain import Difficulty
from app.schemas.common import BulkImportResult, Message, Paginated, RowError
from app.schemas.question import (
    AIGenerateQuestionRequest,
    AutoAssignDifficultyRequest,
    AutoAssignDifficultyResponse,
    PdfImportCommitRequest,
    PdfImportPreviewResponse,
    QuestionAdmin,
    QuestionBankFolderTree,
    QuestionCreate,
    QuestionIdsLookupRequest,
    QuestionListRequest,
    QuestionUpdate,
)
from app.services.ai_question_generator import AIQuestionGenerator
from app.services.bulk_import_service import BulkImportService
from app.services.question_service import QuestionService, QuestionValidationError
from app.services.pdf_question_import_service import PdfQuestionImportService, preview_item_to_question_create
from app.services.r2_storage_service import R2StorageService
from app.api.deps_auth import require_admin
from app.schemas.question_bank_folder import (
    BulkCopyFoldersRequest,
    BulkCopyFoldersResult,
    BulkMoveFoldersRequest,
    BulkFolderMutationResult,
    CopyQuestionsRequest,
    CopyQuestionsResult,
    CreateCategoryRequest,
    CreateSubjectFolderRequest,
    FolderMutationResult,
    MoveFolderRequest,
    MoveQuestionsRequest,
    RenameCategoryRequest,
    RenameSubjectFolderRequest,
)
from app.services.question_bank_folder_service import QuestionBankFolderError, QuestionBankFolderService
from app.services.admin_limits_service import AdminLimitsService
from app.utils.exam_tags import normalize_exam_tag

router = APIRouter(prefix="/questions", tags=["questions"], dependencies=[Depends(require_admin)])


def _parse_exam_tag_filter(exam_tag: Optional[str]) -> Optional[str]:
    if not exam_tag or not str(exam_tag).strip():
        return None
    return normalize_exam_tag(str(exam_tag))


def _folder_svc() -> QuestionBankFolderService:
    return QuestionBankFolderService()


@router.get("", response_model=Paginated[QuestionAdmin])
async def list_questions(
    subject: Optional[str] = None,
    topic: Optional[str] = None,
    difficulty: Optional[Difficulty] = None,
    search: Optional[str] = None,
    question_type: Optional[str] = None,
    exam_tag: Optional[str] = Query(
        default=None,
        description="Filter by exam category tag on the question (must match a stored tag, e.g. CAT).",
    ),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    svc: QuestionService = Depends(get_question_service),
    claims: dict = Depends(require_admin),
) -> Paginated[QuestionAdmin]:
    exam_f = _parse_exam_tag_filter(exam_tag)
    sub = subject.strip() if subject and str(subject).strip() else None
    top = topic.strip() if topic and str(topic).strip() else None
    admin = str(claims.get("sub", ""))
    items, total = await svc.list_page_for_admin(
        admin,
        subject=sub,
        topic=top,
        difficulty=difficulty,
        search=search,
        question_type=question_type,
        exam_tag=exam_f,
        page=page,
        page_size=page_size,
    )
    return Paginated(items=[QuestionAdmin.model_validate(i) for i in items], total=total, page=page, page_size=page_size)


@router.post("/list", response_model=Paginated[QuestionAdmin])
async def list_questions_post(
    body: QuestionListRequest,
    svc: QuestionService = Depends(get_question_service),
    claims: dict = Depends(require_admin),
) -> Paginated[QuestionAdmin]:
    """List questions with filters in JSON body (use for long search text; avoids URL length limits)."""
    exam_f = _parse_exam_tag_filter(body.exam_tag)
    sub = body.subject.strip() if body.subject and body.subject.strip() else None
    top = body.topic.strip() if body.topic and body.topic.strip() else None
    admin = str(claims.get("sub", ""))
    items, total = await svc.list_page_for_admin(
        admin,
        subject=sub,
        topic=top,
        difficulty=body.difficulty,
        search=body.search,
        question_type=body.question_type,
        exam_tag=exam_f,
        page=body.page,
        page_size=body.page_size,
    )
    return Paginated(items=[QuestionAdmin.model_validate(i) for i in items], total=total, page=body.page, page_size=body.page_size)


@router.post("/by-ids", response_model=List[QuestionAdmin])
async def list_questions_by_ids(
    body: QuestionIdsLookupRequest,
    svc: QuestionService = Depends(get_question_service),
    claims: dict = Depends(require_admin),
) -> List[QuestionAdmin]:
    """Return questions in the given id order (missing or disallowed ids are omitted)."""
    admin = str(claims.get("sub", ""))
    items = await svc.list_admin_by_ids(admin, body.question_ids)
    return [QuestionAdmin.model_validate(i) for i in items]


@router.get("/count")
async def count_questions(svc: QuestionService = Depends(get_question_service)) -> dict:
    return {"total": await svc.count()}


@router.get("/folder-tree", response_model=QuestionBankFolderTree)
async def question_folder_tree(
    svc: QuestionService = Depends(get_question_service),
    claims: dict = Depends(require_admin),
) -> QuestionBankFolderTree:
    admin = str(claims.get("sub", ""))
    return await svc.folder_tree_for_admin(admin)


@router.post("/folders/categories", response_model=FolderMutationResult)
async def create_question_category(
    body: CreateCategoryRequest,
    claims: dict = Depends(require_admin),
) -> FolderMutationResult:
    admin = str(claims.get("sub", ""))
    try:
        await _folder_svc().create_category(admin, body)
    except QuestionBankFolderError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return FolderMutationResult(message="Category created")


@router.post("/folders/categories/{category_key}/subjects", response_model=FolderMutationResult)
async def create_subject_folder(
    category_key: str,
    body: CreateSubjectFolderRequest,
    claims: dict = Depends(require_admin),
) -> FolderMutationResult:
    admin = str(claims.get("sub", ""))
    try:
        await _folder_svc().create_subject_folder(admin, category_key, body)
    except QuestionBankFolderError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return FolderMutationResult(message="Subject folder created")


@router.patch("/folders/categories/{category_key}", response_model=FolderMutationResult)
async def rename_question_category(
    category_key: str,
    body: RenameCategoryRequest,
    claims: dict = Depends(require_admin),
) -> FolderMutationResult:
    if not body.new_name and not body.display_name:
        raise HTTPException(status_code=400, detail="Provide new_name and/or display_name")
    admin = str(claims.get("sub", ""))
    try:
        affected = await _folder_svc().rename_category(category_key, body, admin)
    except QuestionBankFolderError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return FolderMutationResult(affected=affected, message="Category updated")


@router.patch("/folders/categories/{category_key}/subjects/{subject_key}", response_model=FolderMutationResult)
async def rename_subject_folder(
    category_key: str,
    subject_key: str,
    body: RenameSubjectFolderRequest,
    claims: dict = Depends(require_admin),
) -> FolderMutationResult:
    admin = str(claims.get("sub", ""))
    try:
        affected = await _folder_svc().rename_subject_folder(category_key, subject_key, body, admin)
    except QuestionBankFolderError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return FolderMutationResult(affected=affected, message="Subject folder renamed")


@router.delete("/folders/categories/{category_key}", response_model=FolderMutationResult)
async def delete_question_category(
    category_key: str,
    claims: dict = Depends(require_admin),
) -> FolderMutationResult:
    admin = str(claims.get("sub", ""))
    try:
        deleted = await _folder_svc().delete_category(category_key, admin)
    except QuestionBankFolderError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return FolderMutationResult(affected=deleted, message="Category deleted")


@router.delete("/folders/categories/{category_key}/subjects/{subject_key}", response_model=FolderMutationResult)
async def delete_subject_folder(
    category_key: str,
    subject_key: str,
    claims: dict = Depends(require_admin),
) -> FolderMutationResult:
    admin = str(claims.get("sub", ""))
    try:
        deleted = await _folder_svc().delete_subject_folder(category_key, subject_key, admin)
    except QuestionBankFolderError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return FolderMutationResult(affected=deleted, message="Subject folder deleted")


@router.delete(
    "/folders/categories/{category_key}/subjects/{subject_key}/topics/{topic_key}",
    response_model=FolderMutationResult,
)
async def delete_topic_folder(
    category_key: str,
    subject_key: str,
    topic_key: str,
    claims: dict = Depends(require_admin),
) -> FolderMutationResult:
    admin = str(claims.get("sub", ""))
    try:
        deleted = await _folder_svc().delete_topic_folder(category_key, subject_key, topic_key, admin)
    except QuestionBankFolderError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return FolderMutationResult(affected=deleted, message="Topic folder deleted")


@router.post("/folders/move-folder", response_model=FolderMutationResult)
async def move_question_folder(
    body: MoveFolderRequest,
    claims: dict = Depends(require_admin),
) -> FolderMutationResult:
    admin = str(claims.get("sub", ""))
    try:
        affected = await _folder_svc().move_folder(body, admin)
    except QuestionBankFolderError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return FolderMutationResult(affected=affected, message=f"Moved folder ({affected} question(s) updated)")


@router.post("/folders/copy-folder", response_model=BulkCopyFoldersResult)
async def copy_question_folder(
    body: MoveFolderRequest,
    claims: dict = Depends(require_admin),
) -> BulkCopyFoldersResult:
    admin = str(claims.get("sub", ""))
    try:
        new_ids = await _folder_svc().copy_folder(body, admin)
    except QuestionBankFolderError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return BulkCopyFoldersResult(
        affected=len(new_ids),
        copied_question_ids=new_ids,
        message=f"Copied folder ({len(new_ids)} question(s))",
    )


@router.post("/folders/bulk-move", response_model=BulkFolderMutationResult)
async def bulk_move_question_folders(
    body: BulkMoveFoldersRequest,
    claims: dict = Depends(require_admin),
) -> BulkFolderMutationResult:
    admin = str(claims.get("sub", ""))
    try:
        affected = await _folder_svc().bulk_move_folders(body, admin)
    except QuestionBankFolderError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return BulkFolderMutationResult(
        affected=affected,
        message=f"Moved {len(body.from_paths)} folder(s) ({affected} question(s) updated)",
    )


@router.post("/folders/bulk-copy", response_model=BulkCopyFoldersResult)
async def bulk_copy_question_folders(
    body: BulkCopyFoldersRequest,
    claims: dict = Depends(require_admin),
) -> BulkCopyFoldersResult:
    admin = str(claims.get("sub", ""))
    try:
        copied, new_ids = await _folder_svc().bulk_copy_folders(body, admin)
    except QuestionBankFolderError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return BulkCopyFoldersResult(
        affected=copied,
        copied_question_ids=new_ids,
        message=f"Copied {len(body.from_paths)} folder(s) ({copied} question(s))",
    )


@router.post("/folders/move", response_model=FolderMutationResult)
async def move_questions_between_folders(
    body: MoveQuestionsRequest,
    claims: dict = Depends(require_admin),
) -> FolderMutationResult:
    admin = str(claims.get("sub", ""))
    try:
        moved = await _folder_svc().move_questions(body, admin)
    except QuestionBankFolderError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return FolderMutationResult(affected=moved, message=f"Moved {moved} question(s)")


@router.post("/folders/copy", response_model=CopyQuestionsResult)
async def copy_questions_between_folders(
    body: CopyQuestionsRequest,
    claims: dict = Depends(require_admin),
) -> CopyQuestionsResult:
    admin = str(claims.get("sub", ""))
    try:
        new_ids = await _folder_svc().copy_questions(body, admin)
    except QuestionBankFolderError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return CopyQuestionsResult(copied=len(new_ids), new_question_ids=new_ids)


@router.get("/export/csv")
async def export_questions_csv(svc: QuestionService = Depends(get_question_service)):
    data = await svc.export_csv_bytes()
    return StreamingResponse(
        iter([data]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="questions.csv"'},
    )


@router.delete("/all")
async def delete_all_questions(svc: QuestionService = Depends(get_question_service)) -> dict:
    deleted = await svc.delete_all()
    return {"deleted": deleted}


@router.post("/upload-image")
async def upload_question_image(
    file: UploadFile = File(...),
    r2: R2StorageService = Depends(get_r2_storage_service),
) -> dict:
    """Upload an image to R2; returns public URL for optional `image_url` on questions."""
    url = await r2.upload_question_image(file)
    return {"url": url}


@router.post("/import/pdf/preview", response_model=PdfImportPreviewResponse)
async def import_pdf_preview(
    file: UploadFile = File(...),
    subject: str = Form("General"),
    topic: str = Form("General"),
    pdf_svc: PdfQuestionImportService = Depends(get_pdf_question_import_service),
) -> PdfImportPreviewResponse:
    name = (file.filename or "").lower()
    if not name.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="A .pdf file is required")
    raw = await file.read()
    if len(raw) > 12 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="PDF too large (max 12MB)")
    return await pdf_svc.preview(raw, subject, topic)


@router.post("/import/pdf/commit", response_model=BulkImportResult)
async def import_pdf_commit(
    body: PdfImportCommitRequest,
    bulk: BulkImportService = Depends(get_bulk_import_service),
) -> BulkImportResult:
    result = BulkImportResult()
    creates: List[QuestionCreate] = []
    for i, item in enumerate(body.questions, start=1):
        try:
            creates.append(preview_item_to_question_create(item))
        except (ValueError, ValidationError) as e:
            result.errors.append(RowError(row=i, error=str(e)))
    if not creates:
        return result
    insert_res = await bulk.import_question_creates(creates)
    result.inserted = insert_res.inserted
    result.skipped = insert_res.skipped
    result.errors.extend(insert_res.errors)
    return result


@router.post("/import/json", response_model=BulkImportResult)
async def import_json(
    file: UploadFile = File(...),
    svc: BulkImportService = Depends(get_bulk_import_service),
) -> BulkImportResult:
    raw = await file.read()
    return await svc.import_json_bytes(raw)


@router.post("/import/csv", response_model=BulkImportResult)
async def import_csv(
    file: UploadFile = File(...),
    svc: BulkImportService = Depends(get_bulk_import_service),
) -> BulkImportResult:
    raw = await file.read()
    return await svc.import_csv_bytes(raw)


@router.post("/ai-generate-draft", response_model=QuestionCreate)
async def ai_generate_draft(body: AIGenerateQuestionRequest) -> QuestionCreate:
    generator = AIQuestionGenerator()
    draft = await generator.generate_expert_draft_question(
        prompt=body.prompt,
        subject=body.subject,
        topic=body.topic,
    )
    if not draft:
        raise HTTPException(
            status_code=502,
            detail="Could not generate a question draft. Check Adaptest AI settings and try another prompt.",
        )
    return draft


@router.post("/auto-assign-difficulty", response_model=AutoAssignDifficultyResponse)
async def auto_assign_difficulty(
    body: AutoAssignDifficultyRequest,
    svc: QuestionService = Depends(get_question_service),
) -> AutoAssignDifficultyResponse:
    """Use Adaptest AI to set difficulty from question text and exam category tags."""
    return await svc.auto_assign_difficulty_with_ai(body.question_ids)


@router.get("/{question_id}", response_model=QuestionAdmin)
async def get_question(
    question_id: str,
    svc: QuestionService = Depends(get_question_service),
    claims: dict = Depends(require_admin),
) -> QuestionAdmin:
    admin = str(claims.get("sub", ""))
    if not await AdminLimitsService().question_allowed_for_admin(admin, question_id):
        raise HTTPException(status_code=404, detail="Question not found")
    doc = await svc.get_admin(question_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Question not found")
    return QuestionAdmin.model_validate(doc)


@router.post("", response_model=QuestionAdmin)
async def create_question(
    body: QuestionCreate,
    svc: QuestionService = Depends(get_question_service),
    claims: dict = Depends(require_admin),
) -> QuestionAdmin:
    try:
        qid = await svc.create(body)
    except QuestionValidationError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    admin = str(claims.get("sub", ""))
    exam_tag = body.tags[0] if body.tags else ""
    try:
        await _folder_svc().ensure_path(admin, exam_tag, body.subject, body.topic, question_id=qid)
    except QuestionBankFolderError:
        pass
    doc = await svc.get_admin(qid)
    assert doc is not None
    return QuestionAdmin.model_validate(doc)


@router.patch("/{question_id}", response_model=QuestionAdmin)
async def update_question(
    question_id: str,
    body: QuestionUpdate,
    svc: QuestionService = Depends(get_question_service),
) -> QuestionAdmin:
    try:
        ok = await svc.update(question_id, body)
    except QuestionValidationError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if not ok:
        raise HTTPException(status_code=404, detail="Question not found")
    doc = await svc.get_admin(question_id)
    assert doc is not None
    return QuestionAdmin.model_validate(doc)


@router.delete("/{question_id}", response_model=Message)
async def delete_question(
    question_id: str,
    svc: QuestionService = Depends(get_question_service),
) -> Message:
    ok = await svc.delete(question_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Question not found")
    return Message(message="deleted")
