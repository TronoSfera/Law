"""admin totp fields

Revision ID: 0029_admin_totp
Revises: 0028_auth_mode_email
Create Date: 2026-03-01 13:55:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision = "0029_admin_totp"
down_revision = "0028_auth_mode_email"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("admin_users", sa.Column("totp_enabled", sa.Boolean(), nullable=True, server_default=sa.false()))
    op.add_column("admin_users", sa.Column("totp_secret_encrypted", sa.String(length=2000), nullable=True))
    op.add_column("admin_users", sa.Column("totp_backup_codes_hashes", sa.JSON(), nullable=True))
    op.add_column("admin_users", sa.Column("totp_last_used_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE admin_users SET totp_enabled = FALSE WHERE totp_enabled IS NULL")
    op.alter_column("admin_users", "totp_enabled", nullable=False, server_default=None)


def downgrade() -> None:
    op.drop_column("admin_users", "totp_last_used_at")
    op.drop_column("admin_users", "totp_backup_codes_hashes")
    op.drop_column("admin_users", "totp_secret_encrypted")
    op.drop_column("admin_users", "totp_enabled")
