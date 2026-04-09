from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse

from app.api.deps import get_bulk_import_service, get_question_service
from app.models.domain import Difficulty
from app.schemas.common import BulkImportResult, Message, Paginated
from app.schemas.question import AIGenerateQuestionRequest, QuestionAdmin, QuestionCreate, QuestionUpdate
from app.services.ai_question_generator import AIQuestionGenerator
from app.services.bulk_import_service import BulkImportService
from app.services.question_service import QuestionService, QuestionValidationError
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
