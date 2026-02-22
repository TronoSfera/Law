from sqlalchemy import String, Integer, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.db.session import Base
from app.models.common import UUIDMixin, TimestampMixin

class Request(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "requests"
    track_number: Mapped[str] = mapped_column(String(40), unique=True, nullable=False, index=True)
    client_name: Mapped[str] = mapped_column(String(200), nullable=False)
    client_phone: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    topic_code: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    status_code: Mapped[str] = mapped_column(String(50), nullable=False, index=True, default="NEW")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    extra_fields: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    assigned_lawyer_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    total_attachments_bytes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
