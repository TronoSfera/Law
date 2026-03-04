"""add per-message delivery and read receipts for chat

Revision ID: 0033_message_receipts
Revises: 0032_email_cols_fix
Create Date: 2026-03-03
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0033_message_receipts"
down_revision = "0032_email_cols_fix"
branch_labels = None
depends_on = None


def _has_column(inspector: sa.Inspector, table: str, column: str) -> bool:
    return any(str(col.get("name")) == column for col in inspector.get_columns(table))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not _has_column(inspector, "messages", "delivered_to_client_at"):
        op.add_column("messages", sa.Column("delivered_to_client_at", sa.DateTime(timezone=True), nullable=True))
    if not _has_column(inspector, "messages", "delivered_to_staff_at"):
        op.add_column("messages", sa.Column("delivered_to_staff_at", sa.DateTime(timezone=True), nullable=True))
    if not _has_column(inspector, "messages", "read_by_client_at"):
        op.add_column("messages", sa.Column("read_by_client_at", sa.DateTime(timezone=True), nullable=True))
    if not _has_column(inspector, "messages", "read_by_staff_at"):
        op.add_column("messages", sa.Column("read_by_staff_at", sa.DateTime(timezone=True), nullable=True))

    # Historical messages are considered already delivered/read by their counterparty
    # so old chats do not show endless "sent only" state.
    op.execute(
        sa.text(
            """
            UPDATE messages
            SET delivered_to_staff_at = COALESCE(delivered_to_staff_at, created_at, NOW()),
                read_by_staff_at = COALESCE(read_by_staff_at, created_at, NOW()),
                updated_at = COALESCE(updated_at, NOW())
            WHERE author_type = 'CLIENT'
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE messages
            SET delivered_to_client_at = COALESCE(delivered_to_client_at, created_at, NOW()),
                read_by_client_at = COALESCE(read_by_client_at, created_at, NOW()),
                updated_at = COALESCE(updated_at, NOW())
            WHERE author_type <> 'CLIENT' OR author_type IS NULL
            """
        )
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _has_column(inspector, "messages", "read_by_staff_at"):
        op.drop_column("messages", "read_by_staff_at")
    inspector = sa.inspect(bind)
    if _has_column(inspector, "messages", "read_by_client_at"):
        op.drop_column("messages", "read_by_client_at")
    inspector = sa.inspect(bind)
    if _has_column(inspector, "messages", "delivered_to_staff_at"):
        op.drop_column("messages", "delivered_to_staff_at")
    inspector = sa.inspect(bind)
    if _has_column(inspector, "messages", "delivered_to_client_at"):
        op.drop_column("messages", "delivered_to_client_at")
