import uuid
from datetime import datetime

from sqlalchemy import String, Integer, Boolean, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.db.session import Base
from app.models.common import UUIDMixin, TimestampMixin


class Attachment(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "attachments"
    request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    message_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True, nullable=True)
    file_name: Mapped[str] = mapped_column(String(300), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(150), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    s3_key: Mapped[str] = mapped_column(String(500), nullable=False)
    immutable: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    scan_status: Mapped[str] = mapped_column(String(20), nullable=False, default="CLEAN", index=True)
    scan_signature: Mapped[str | None] = mapped_column(String(255), nullable=True)
    scan_error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    scanned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    content_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    detected_mime: Mapped[str | None] = mapped_column(String(150), nullable=True)
