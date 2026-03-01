"""auth mode email support

Revision ID: 0028_auth_mode_email
Revises: 0027_encrypt_chat_messages
Create Date: 2026-03-01 13:15:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision = "0028_auth_mode_email"
down_revision = "0027_encrypt_chat_messages"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("clients", sa.Column("email", sa.String(length=255), nullable=True))
    op.create_index("ix_clients_email", "clients", ["email"], unique=False)

    op.add_column("requests", sa.Column("client_email", sa.String(length=255), nullable=True))
    op.create_index("ix_requests_client_email", "requests", ["client_email"], unique=False)

    op.add_column("otp_sessions", sa.Column("channel", sa.String(length=16), nullable=True, server_default="SMS"))
    op.add_column("otp_sessions", sa.Column("email", sa.String(length=255), nullable=True))
    op.create_index("ix_otp_sessions_email", "otp_sessions", ["email"], unique=False)
    op.execute("UPDATE otp_sessions SET channel = 'SMS' WHERE channel IS NULL")
    op.alter_column("otp_sessions", "channel", nullable=False, server_default=None)


def downgrade() -> None:
    op.drop_index("ix_otp_sessions_email", table_name="otp_sessions")
    op.drop_column("otp_sessions", "email")
    op.drop_column("otp_sessions", "channel")

    op.drop_index("ix_requests_client_email", table_name="requests")
    op.drop_column("requests", "client_email")

    op.drop_index("ix_clients_email", table_name="clients")
    op.drop_column("clients", "email")
