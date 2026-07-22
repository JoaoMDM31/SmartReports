from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ReportListItem(BaseModel):
    id: int
    title: str
    filename: str
    source_sheet: str | None
    created_at: datetime
    row_count: int
    column_count: int
    insight_preview: str


class ReportDetail(BaseModel):
    id: int
    title: str
    filename: str
    source_sheet: str | None
    columns_schema: dict[str, Any]
    analysis_summary: dict[str, Any]
    insight_text: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ReportUpdate(BaseModel):
    title: str = Field(min_length=2, max_length=180)


class ReportChatRequest(BaseModel):
    question: str = Field(min_length=2, max_length=600)


class ReportChatResponse(BaseModel):
    answer: str
    confidence: str
    evidence: list[dict[str, Any]] = []
    next_steps: list[str] = []


class DashboardSummary(BaseModel):
    total_reports: int
    total_rows_processed: int
    latest_report_title: str | None
    latest_report_at: datetime | None
    most_common_columns: list[dict[str, Any]]
