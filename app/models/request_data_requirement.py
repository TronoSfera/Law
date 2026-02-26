import uuid

from sqlalchemy import String, Boolean, Text, UniqueConstraint, Integer
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID

from app.db.session import Base
from app.models.common import UUIDMixin, TimestampMixin


class RequestDataRequirement(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "request_data_requirements"
    __table_args__ = (
        UniqueConstraint(
            "request_id",
            "key",
            name="uq_request_data_requirements_request_key",
        ),
    )

    request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    request_message_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    topic_template_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    key: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    field_type: Mapped[str] = mapped_column(String(20), nullable=False, default="text")
    document_name: Mapped[str | None] = mapped_column(String(200), nullable=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    value_text: Mapped[str | None] = mapped_column(String(500), nullable=True)
    required: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_by_admin_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
