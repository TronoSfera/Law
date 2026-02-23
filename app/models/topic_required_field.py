from sqlalchemy import String, Integer, Boolean, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models.common import UUIDMixin, TimestampMixin


class TopicRequiredField(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "topic_required_fields"
    __table_args__ = (
        UniqueConstraint(
            "topic_code",
            "field_key",
            name="uq_topic_required_fields_topic_field",
        ),
    )

    topic_code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    field_key: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    required: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
