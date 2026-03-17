"""add author admin user id to messages

Revision ID: 0036_message_author_admin_id
Revises: 0035_workspace_perf_indexes
Create Date: 2026-03-17
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0036_message_author_admin_id"
down_revision = "0035_workspace_perf_indexes"
branch_labels = None
depends_on = None


def _has_column(inspector: sa.Inspector, table: str, column_name: str) -> bool:
    return any(str(column.get("name")) == column_name for column in inspector.get_columns(table))


def _has_index(inspector: sa.Inspector, table: str, index_name: str) -> bool:
    return any(str(index.get("name")) == index_name for index in inspector.get_indexes(table))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not _has_column(inspector, "messages", "author_admin_user_id"):
        op.add_column("messages", sa.Column("author_admin_user_id", postgresql.UUID(as_uuid=True), nullable=True))

    inspector = sa.inspect(bind)
    if not _has_index(inspector, "messages", "ix_messages_author_admin_user_id"):
        op.create_index("ix_messages_author_admin_user_id", "messages", ["author_admin_user_id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _has_index(inspector, "messages", "ix_messages_author_admin_user_id"):
        op.drop_index("ix_messages_author_admin_user_id", table_name="messages")

    inspector = sa.inspect(bind)
    if _has_column(inspector, "messages", "author_admin_user_id"):
        op.drop_column("messages", "author_admin_user_id")
