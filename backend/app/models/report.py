from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Report(Base):
    __tablename__ = "reports"
    __table_args__ = (
        Index("ix_reports_owner_created_at", "owner_id", "created_at"),
        Index("ix_reports_owner_title", "owner_id", "title"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(180))
    filename: Mapped[str] = mapped_column(String(255))
    source_sheet: Mapped[str | None] = mapped_column(String(180), nullable=True)
    columns_schema: Mapped[dict] = mapped_column(JSON)
    analysis_summary: Mapped[dict] = mapped_column(JSON)
    insight_text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="reports")
