import uuid
from datetime import datetime

from sqlalchemy import String, Boolean, DateTime, Index, Text, event
from sqlalchemy.orm import Mapped, Session as OrmSession, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.db.session import Base
from app.models.common import UUIDMixin, TimestampMixin
from app.models.request import Request
from app.services.chat_crypto import encrypt_message_body, encrypt_message_body_for_request, is_encrypted_message

class Message(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "messages"
    __table_args__ = (
        Index("ix_messages_request_created_id", "request_id", "created_at", "id"),
    )
    request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    author_type: Mapped[str] = mapped_column(String(20), nullable=False)  # CLIENT|LAWYER|SYSTEM
    author_admin_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    author_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    immutable: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    delivered_to_client_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delivered_to_staff_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    read_by_client_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    read_by_staff_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


def _find_request_for_message(session: OrmSession, request_id: uuid.UUID | None) -> Request | None:
    if request_id is None:
        return None
    for obj in session.new:
        if isinstance(obj, Request) and obj.id == request_id:
            return obj
    for obj in session.identity_map.values():
        if isinstance(obj, Request) and obj.id == request_id:
            return obj
    return session.get(Request, request_id)


@event.listens_for(OrmSession, "before_flush")
def _encrypt_message_bodies_before_flush(session: OrmSession, flush_context, instances) -> None:
    candidates = [obj for obj in session.new if isinstance(obj, Message)]
    candidates.extend(obj for obj in session.dirty if isinstance(obj, Message))
    for message in candidates:
        raw_body = message.body
        if raw_body is None:
            continue
        text = str(raw_body)
        if not text or is_encrypted_message(text):
            continue
        request_row = _find_request_for_message(session, getattr(message, "request_id", None))
        if request_row is None:
            message.body = encrypt_message_body(text)
            continue
        encrypted_body, next_extra_fields, changed = encrypt_message_body_for_request(
            text,
            request_extra_fields=request_row.extra_fields,
        )
        message.body = encrypted_body
        if changed:
            request_row.extra_fields = next_extra_fields
