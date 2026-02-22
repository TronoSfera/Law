from sqlalchemy import String, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from app.db.session import Base
from app.models.common import UUIDMixin, TimestampMixin

class AdminUser(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "admin_users"
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # ADMIN|LAWYER
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
