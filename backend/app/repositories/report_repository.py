from __future__ import annotations

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.models.report import Report


class ReportRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(self, report: Report) -> Report:
        self.db.add(report)
        self.db.commit()
        self.db.refresh(report)
        return report

    def list_for_owner(self, owner_id: int, limit: int = 50) -> list[Report]:
        return list(
            self.db.scalars(
                select(Report)
                .where(Report.owner_id == owner_id)
                .order_by(desc(Report.created_at))
                .limit(limit)
            ).all()
        )

    def get_for_owner(self, report_id: int, owner_id: int) -> Report | None:
        return self.db.scalar(select(Report).where(Report.id == report_id, Report.owner_id == owner_id))

    def update_title(self, report: Report, title: str) -> Report:
        report.title = title
        self.db.commit()
        self.db.refresh(report)
        return report

    def delete(self, report: Report) -> None:
        self.db.delete(report)
        self.db.commit()
