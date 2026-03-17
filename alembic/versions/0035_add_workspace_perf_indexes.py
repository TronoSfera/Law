"""add composite indexes for request workspace payloads

Revision ID: 0035_workspace_perf_indexes
Revises: 0034_request_assigned_lawyer_idx
Create Date: 2026-03-17
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0035_workspace_perf_indexes"
down_revision = "0034_request_assigned_lawyer_idx"
branch_labels = None
depends_on = None


def _has_index(inspector: sa.Inspector, table: str, index_name: str) -> bool:
    return any(str(idx.get("name")) == index_name for idx in inspector.get_indexes(table))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not _has_index(inspector, "messages", "ix_messages_request_created_id"):
        op.create_index("ix_messages_request_created_id", "messages", ["request_id", "created_at", "id"], unique=False)
    if not _has_index(inspector, "attachments", "ix_attachments_request_created_id"):
        op.create_index("ix_attachments_request_created_id", "attachments", ["request_id", "created_at", "id"], unique=False)
    if not _has_index(inspector, "invoices", "ix_invoices_request_issued_id"):
        op.create_index("ix_invoices_request_issued_id", "invoices", ["request_id", "issued_at", "id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _has_index(inspector, "invoices", "ix_invoices_request_issued_id"):
        op.drop_index("ix_invoices_request_issued_id", table_name="invoices")
    if _has_index(inspector, "attachments", "ix_attachments_request_created_id"):
        op.drop_index("ix_attachments_request_created_id", table_name="attachments")
    if _has_index(inspector, "messages", "ix_messages_request_created_id"):
        op.drop_index("ix_messages_request_created_id", table_name="messages")
