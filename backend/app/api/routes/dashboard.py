from collections import Counter

from fastapi import APIRouter, Depends
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.core.database import get_db
from app.models.report import Report
from app.models.user import User
from app.schemas.report import DashboardSummary

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
def dashboard_summary(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> DashboardSummary:
    reports = db.scalars(
        select(Report)
        .where(Report.owner_id == current_user.id)
        .order_by(desc(Report.created_at))
        .limit(100)
    ).all()

    column_counter: Counter[str] = Counter()
    total_rows = 0
    for report in reports:
        total_rows += int((report.analysis_summary or {}).get("row_count", 0))
        for column in (report.columns_schema or {}).get("columns", []):
            column_counter[column.get("name", "")] += 1

    latest = reports[0] if reports else None
    return DashboardSummary(
        total_reports=len(reports),
        total_rows_processed=total_rows,
        latest_report_title=latest.title if latest else None,
        latest_report_at=latest.created_at if latest else None,
        most_common_columns=[
            {"name": name, "count": count}
            for name, count in column_counter.most_common(8)
            if name
        ],
    )
