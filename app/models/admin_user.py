from sqlalchemy import Boolean, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column
from app.db.session import Base
from app.models.common import UUIDMixin, TimestampMixin

class AdminUser(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "admin_users"
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # ADMIN|LAWYER
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    primary_topic_code: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    default_rate: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    salary_percent: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
