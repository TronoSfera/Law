from __future__ import annotations

import uuid

from sqlalchemy import Boolean, JSON, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models.common import TimestampMixin, UUIDMixin


class SecurityAuditLog(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "security_audit_log"

    actor_role: Mapped[str] = mapped_column(String(30), nullable=False)
    actor_subject: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    actor_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)

    action: Mapped[str] = mapped_column(String(50), nullable=False)
    scope: Mapped[str] = mapped_column(String(50), nullable=False)
    object_key: Mapped[str | None] = mapped_column(String(500), nullable=True)

    request_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    attachment_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    allowed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    reason: Mapped[str | None] = mapped_column(String(400), nullable=True)
    details: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
