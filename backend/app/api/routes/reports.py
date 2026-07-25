from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.core.cache import make_file_cache_key, read_json_cache, write_json_cache
from app.core.config import get_settings
from app.core.logging import get_logger
from app.core.database import get_db
from app.models.report import Report
from app.models.user import User
from app.repositories.report_repository import ReportRepository
from app.schemas.report import (
    ReportChatRequest,
    ReportChatResponse,
    ReportDetail,
    ReportListItem,
    ReportUpdate,
)
from app.services.ai_chat import answer_report_question_with_ai
from app.services.pdf_service import generate_report_pdf
from app.services.spreadsheet_analyzer import analyze_spreadsheet

router = APIRouter(prefix="/reports", tags=["reports"])
logger = get_logger(__name__)


@router.post("/upload", response_model=ReportDetail, status_code=status.HTTP_201_CREATED)
async def upload_report(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Report:
    settings = get_settings()
    contents = await file.read()
    if len(contents) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail=f"Arquivo acima do limite de {settings.max_upload_mb} MB.",
        )

    filename = _safe_filename(file.filename or "planilha.xlsx")
    if Path(filename).suffix.lower() not in settings.allowed_upload_extensions:
        raise HTTPException(
            status_code=400,
            detail="Formato nao suportado. Envie .xlsx, .xlsm, .xls ou .csv.",
        )

    cache_key = make_file_cache_key(contents)
    analysis = read_json_cache(cache_key)
    if analysis is None:
        try:
            analysis = analyze_spreadsheet(contents, filename)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        write_json_cache(cache_key, analysis)

    repository = ReportRepository(db)
    report = Report(
        owner_id=current_user.id,
        title=Path(filename).stem.replace("_", " ").title(),
        filename=filename,
        source_sheet=analysis.get("source_sheet"),
        columns_schema=analysis["schema"],
        analysis_summary=analysis["summary"],
        insight_text=analysis["insights"],
    )
    logger.info("report_created", extra={"user_id": current_user.id, "path": filename})
    return repository.create(report)


@router.get("", response_model=list[ReportListItem])
def list_reports(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[ReportListItem]:
    reports = ReportRepository(db).list_for_owner(current_user.id)

    return [
        ReportListItem(
            id=report.id,
            title=report.title,
            filename=report.filename,
            source_sheet=report.source_sheet,
            created_at=report.created_at,
            row_count=int((report.analysis_summary or {}).get("row_count", 0)),
            column_count=int((report.analysis_summary or {}).get("column_count", 0)),
            insight_preview=report.insight_text[:180],
        )
        for report in reports
    ]


@router.get("/{report_id}", response_model=ReportDetail)
def get_report(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Report:
    return _get_owned_report(report_id, current_user, db)


@router.patch("/{report_id}", response_model=ReportDetail)
def update_report(
    report_id: int,
    payload: ReportUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Report:
    repository = ReportRepository(db)
    report = _get_owned_report(report_id, current_user, db)
    return repository.update_title(report, payload.title.strip())


@router.post("/{report_id}/chat", response_model=ReportChatResponse)
def chat_with_report(
    report_id: int,
    payload: ReportChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    report = _get_owned_report(report_id, current_user, db)
    return answer_report_question_with_ai(payload.question, report)


@router.get("/{report_id}/pdf")
def export_report_pdf(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    report = _get_owned_report(report_id, current_user, db)
    pdf = generate_report_pdf(report, current_user)
    filename = f"SmartReports-{report.title.replace(' ', '-')}.pdf"
    return StreamingResponse(
        pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_report(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    report = _get_owned_report(report_id, current_user, db)
    ReportRepository(db).delete(report)


def _get_owned_report(report_id: int, current_user: User, db: Session) -> Report:
    report = ReportRepository(db).get_for_owner(report_id, current_user.id)
    if report is None:
        raise HTTPException(status_code=404, detail="Relatorio nao encontrado.")
    return report


def _safe_filename(filename: str) -> str:
    clean_name = Path(filename).name.strip().replace("\x00", "")
    if not clean_name:
        return "planilha.xlsx"
    return clean_name[:180]
