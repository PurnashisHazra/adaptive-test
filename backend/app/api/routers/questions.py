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
    PdfImportCommitRequest,
    PdfImportPreviewResponse,
    QuestionAdmin,
    QuestionCreate,
    QuestionUpdate,
)
from app.services.ai_question_generator import AIQuestionGenerator
from app.services.bulk_import_service import BulkImportService
from app.services.question_service import QuestionService, QuestionValidationError
from app.services.pdf_question_import_service import PdfQuestionImportService, preview_item_to_question_create
from app.services.r2_storage_service import R2StorageService
from app.api.deps_auth import require_admin

router = APIRouter(prefix="/questions", tags=["questions"], dependencies=[Depends(require_admin)])


@router.get("", response_model=Paginated[QuestionAdmin])
async def list_questions(
    subject: Optional[str] = None,
    topic: Optional[str] = None,
    difficulty: Optional[Difficulty] = None,
    search: Optional[str] = None,
    question_type: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    svc: QuestionService = Depends(get_question_service),
) -> Paginated[QuestionAdmin]:
    items, total = await svc.list_page(
        subject=subject,
        topic=topic,
        difficulty=difficulty,
        search=search,
        question_type=question_type,
        page=page,
        page_size=page_size,
    )
    return Paginated(items=[QuestionAdmin.model_validate(i) for i in items], total=total, page=page, page_size=page_size)


@router.get("/count")
async def count_questions(svc: QuestionService = Depends(get_question_service)) -> dict:
    return {"total": await svc.count()}


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
            detail="Could not generate a question draft. Check OpenAI settings and try another prompt.",
        )
    return draft


@router.get("/{question_id}", response_model=QuestionAdmin)
async def get_question(
    question_id: str,
    svc: QuestionService = Depends(get_question_service),
) -> QuestionAdmin:
    doc = await svc.get_admin(question_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Question not found")
    return QuestionAdmin.model_validate(doc)


@router.post("", response_model=QuestionAdmin)
async def create_question(
    body: QuestionCreate,
    svc: QuestionService = Depends(get_question_service),
) -> QuestionAdmin:
    try:
        qid = await svc.create(body)
    except QuestionValidationError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
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
