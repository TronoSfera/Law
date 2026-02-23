from sqlalchemy import String, Integer, Boolean, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models.common import UUIDMixin, TimestampMixin


class TopicDataTemplate(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "topic_data_templates"
    __table_args__ = (
        UniqueConstraint(
            "topic_code",
            "key",
            name="uq_topic_data_templates_topic_key",
        ),
    )

    topic_code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    key: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    required: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
