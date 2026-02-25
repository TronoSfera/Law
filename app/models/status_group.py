from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models.common import TimestampMixin, UUIDMixin


class StatusGroup(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "status_groups"

    name: Mapped[str] = mapped_column(String(200), nullable=False, unique=True, index=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
