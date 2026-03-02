"""repair missing email auth columns in legacy prod databases

Revision ID: 0032_email_cols_fix
Revises: 0031_pii_retention_and_consent
Create Date: 2026-03-02
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0032_email_cols_fix"
down_revision = "0031_pii_retention_and_consent"
branch_labels = None
depends_on = None


def _has_column(inspector: sa.Inspector, table: str, column: str) -> bool:
    return any(str(col.get("name")) == column for col in inspector.get_columns(table))


def _has_index(inspector: sa.Inspector, table: str, index_name: str) -> bool:
    return any(str(idx.get("name")) == index_name for idx in inspector.get_indexes(table))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not _has_column(inspector, "clients", "email"):
        op.add_column("clients", sa.Column("email", sa.String(length=255), nullable=True))
    inspector = sa.inspect(bind)
    if not _has_index(inspector, "clients", "ix_clients_email"):
        op.create_index("ix_clients_email", "clients", ["email"], unique=False)

    if not _has_column(inspector, "requests", "client_email"):
        op.add_column("requests", sa.Column("client_email", sa.String(length=255), nullable=True))
    inspector = sa.inspect(bind)
    if not _has_index(inspector, "requests", "ix_requests_client_email"):
        op.create_index("ix_requests_client_email", "requests", ["client_email"], unique=False)

    if not _has_column(inspector, "otp_sessions", "channel"):
        op.add_column("otp_sessions", sa.Column("channel", sa.String(length=16), nullable=True, server_default="SMS"))
    if not _has_column(inspector, "otp_sessions", "email"):
        op.add_column("otp_sessions", sa.Column("email", sa.String(length=255), nullable=True))
    op.execute("UPDATE otp_sessions SET channel = 'SMS' WHERE channel IS NULL")
    op.alter_column("otp_sessions", "channel", nullable=False, server_default=None)
    inspector = sa.inspect(bind)
    if not _has_index(inspector, "otp_sessions", "ix_otp_sessions_email"):
        op.create_index("ix_otp_sessions_email", "otp_sessions", ["email"], unique=False)


def downgrade() -> None:
    # Intentionally no-op for safety on heterogeneous legacy databases.
    pass
