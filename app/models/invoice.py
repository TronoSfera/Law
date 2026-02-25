import uuid
from datetime import datetime

from sqlalchemy import DateTime, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models.common import TimestampMixin, UUIDMixin


class Invoice(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "invoices"

    request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    client_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True, nullable=True)
    invoice_number: Mapped[str] = mapped_column(String(40), unique=True, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, index=True, default="WAITING_PAYMENT")
    amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="RUB")
    payer_display_name: Mapped[str] = mapped_column(String(300), nullable=False)
    payer_details_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    issued_by_admin_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True, nullable=True)
    issued_by_role: Mapped[str | None] = mapped_column(String(20), nullable=True)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
