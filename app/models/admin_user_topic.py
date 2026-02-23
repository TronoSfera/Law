import uuid

from sqlalchemy import String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models.common import UUIDMixin, TimestampMixin


class AdminUserTopic(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "admin_user_topics"
    __table_args__ = (UniqueConstraint("admin_user_id", "topic_code", name="uq_admin_user_topics_user_topic"),)

    admin_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    topic_code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
