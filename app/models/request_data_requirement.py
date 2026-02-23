import uuid

from sqlalchemy import String, Boolean, Text, UniqueConstraint
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
    topic_template_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    key: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    required: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by_admin_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
