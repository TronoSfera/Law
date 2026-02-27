from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models.common import TimestampMixin, UUIDMixin


class RequestServiceRequest(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "request_service_requests"

    request_id: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    client_id: Mapped[str | None] = mapped_column(String(60), nullable=True, index=True)
    assigned_lawyer_id: Mapped[str | None] = mapped_column(String(60), nullable=True, index=True)
    resolved_by_admin_id: Mapped[str | None] = mapped_column(String(60), nullable=True, index=True)

    type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="NEW", index=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_by_client: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    admin_unread: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    lawyer_unread: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    admin_read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    lawyer_read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
