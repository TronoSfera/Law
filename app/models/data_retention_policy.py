from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models.common import TimestampMixin, UUIDMixin


class DataRetentionPolicy(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "data_retention_policies"

    entity: Mapped[str] = mapped_column(String(80), unique=True, nullable=False, index=True)
    retention_days: Mapped[int] = mapped_column(Integer, nullable=False, default=365)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    hard_delete: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    description: Mapped[str | None] = mapped_column(String(300), nullable=True)
