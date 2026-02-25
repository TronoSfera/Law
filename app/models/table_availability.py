from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models.common import TimestampMixin, UUIDMixin


class TableAvailability(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "table_availability"

    table_name: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
