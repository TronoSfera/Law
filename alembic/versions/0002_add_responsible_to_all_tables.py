"""add responsible to all tables

Revision ID: 0002_add_responsible
Revises: 0001_init
Create Date: 2026-02-22
"""

from alembic import op
import sqlalchemy as sa

revision = "0002_add_responsible"
down_revision = "0001_init"
branch_labels = None
depends_on = None

TABLES = [
    "admin_users",
    "topics",
    "statuses",
    "form_fields",
    "requests",
    "messages",
    "attachments",
    "status_history",
    "audit_log",
    "otp_sessions",
    "quotes",
]


def upgrade():
    for table in TABLES:
        op.add_column(
            table,
            sa.Column(
                "responsible",
                sa.String(length=200),
                nullable=False,
                server_default=sa.text("'Администратор системы'"),
            ),
        )


def downgrade():
    for table in reversed(TABLES):
        op.drop_column(table, "responsible")
