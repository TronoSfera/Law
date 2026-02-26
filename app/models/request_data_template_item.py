from __future__ import annotations

import uuid

from sqlalchemy import Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models.common import TimestampMixin, UUIDMixin


class RequestDataTemplateItem(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "request_data_template_items"
    __table_args__ = (
        UniqueConstraint("request_data_template_id", "key", name="uq_request_data_template_items_template_key"),
    )

    request_data_template_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    topic_data_template_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    key: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    value_type: Mapped[str] = mapped_column(String(20), nullable=False, default="string")
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
