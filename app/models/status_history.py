import uuid
from datetime import datetime
from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.db.session import Base
from app.models.common import UUIDMixin, TimestampMixin

class StatusHistory(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "status_history"
    request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    from_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    to_status: Mapped[str] = mapped_column(String(50), nullable=False)
    changed_by_admin_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    comment: Mapped[str | None] = mapped_column(String(400), nullable=True)
    important_date_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
