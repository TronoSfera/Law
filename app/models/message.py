import uuid
from datetime import datetime

from sqlalchemy import String, Boolean, DateTime, Index
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.db.session import Base
from app.db.encrypted_types import EncryptedChatText
from app.models.common import UUIDMixin, TimestampMixin

class Message(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "messages"
    __table_args__ = (
        Index("ix_messages_request_created_id", "request_id", "created_at", "id"),
    )
    request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    author_type: Mapped[str] = mapped_column(String(20), nullable=False)  # CLIENT|LAWYER|SYSTEM
    author_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    body: Mapped[str | None] = mapped_column(EncryptedChatText(), nullable=True)
    immutable: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    delivered_to_client_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delivered_to_staff_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    read_by_client_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    read_by_staff_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
