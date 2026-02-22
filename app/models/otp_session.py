from sqlalchemy import String, Integer, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, timezone, timedelta
from app.db.session import Base
from app.models.common import UUIDMixin, TimestampMixin

def utcnow():
    return datetime.now(timezone.utc)

class OtpSession(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "otp_sessions"
    purpose: Mapped[str] = mapped_column(String(30), nullable=False)
    track_number: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    phone: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    code_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: utcnow() + timedelta(minutes=10))
