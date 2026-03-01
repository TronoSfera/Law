from datetime import datetime
import uuid

from sqlalchemy import Boolean, DateTime, Integer, JSON, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.db.session import Base
from app.models.common import UUIDMixin, TimestampMixin

class Request(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "requests"
    track_number: Mapped[str] = mapped_column(String(40), unique=True, nullable=False, index=True)
    client_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    client_name: Mapped[str] = mapped_column(String(200), nullable=False)
    client_phone: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    client_email: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    topic_code: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    status_code: Mapped[str] = mapped_column(String(50), nullable=False, index=True, default="NEW")
    important_date_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    extra_fields: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    assigned_lawyer_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    effective_rate: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    request_cost: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    invoice_amount: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    paid_by_admin_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    total_attachments_bytes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    client_has_unread_updates: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    client_unread_event_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    lawyer_has_unread_updates: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    lawyer_unread_event_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
