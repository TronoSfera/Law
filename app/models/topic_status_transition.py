from sqlalchemy import String, Integer, Boolean, UniqueConstraint, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models.common import UUIDMixin, TimestampMixin


class TopicStatusTransition(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "topic_status_transitions"
    __table_args__ = (
        UniqueConstraint(
            "topic_code",
            "from_status",
            "to_status",
            name="uq_topic_status_transitions_topic_from_to",
        ),
    )

    topic_code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    from_status: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    to_status: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sla_hours: Mapped[int | None] = mapped_column(Integer, nullable=True)
    required_data_keys: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    required_mime_types: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
