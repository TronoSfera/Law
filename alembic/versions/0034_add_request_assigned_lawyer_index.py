"""add index for requests.assigned_lawyer_id

Revision ID: 0034_request_assigned_lawyer_idx
Revises: 0033_message_receipts
Create Date: 2026-03-16
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0034_request_assigned_lawyer_idx"
down_revision = "0033_message_receipts"
branch_labels = None
depends_on = None


def _has_index(inspector: sa.Inspector, table: str, index_name: str) -> bool:
    return any(str(idx.get("name")) == index_name for idx in inspector.get_indexes(table))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not _has_index(inspector, "requests", "ix_requests_assigned_lawyer_id"):
        op.create_index("ix_requests_assigned_lawyer_id", "requests", ["assigned_lawyer_id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _has_index(inspector, "requests", "ix_requests_assigned_lawyer_id"):
        op.drop_index("ix_requests_assigned_lawyer_id", table_name="requests")
