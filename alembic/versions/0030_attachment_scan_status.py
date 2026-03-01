"""attachment antivirus scan status

Revision ID: 0030_attachment_scan
Revises: 0029_admin_totp
Create Date: 2026-03-01 18:10:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision = "0030_attachment_scan"
down_revision = "0029_admin_totp"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "attachments",
        sa.Column("scan_status", sa.String(length=20), nullable=True, server_default="CLEAN"),
    )
    op.add_column("attachments", sa.Column("scan_signature", sa.String(length=255), nullable=True))
    op.add_column("attachments", sa.Column("scan_error", sa.String(length=500), nullable=True))
    op.add_column("attachments", sa.Column("scanned_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("attachments", sa.Column("content_sha256", sa.String(length=64), nullable=True))
    op.add_column("attachments", sa.Column("detected_mime", sa.String(length=150), nullable=True))
    op.execute("UPDATE attachments SET scan_status = 'CLEAN' WHERE scan_status IS NULL")
    op.alter_column("attachments", "scan_status", nullable=False, server_default=None)
    op.create_index("ix_attachments_scan_status", "attachments", ["scan_status"])


def downgrade() -> None:
    op.drop_index("ix_attachments_scan_status", table_name="attachments")
    op.drop_column("attachments", "detected_mime")
    op.drop_column("attachments", "content_sha256")
    op.drop_column("attachments", "scanned_at")
    op.drop_column("attachments", "scan_error")
    op.drop_column("attachments", "scan_signature")
    op.drop_column("attachments", "scan_status")
