"""add request read/unread markers

Revision ID: 0006_request_read_markers
Revises: 0005_admin_user_topics
Create Date: 2026-02-23
"""

from alembic import op
import sqlalchemy as sa

revision = "0006_request_read_markers"
down_revision = "0005_admin_user_topics"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "requests",
        sa.Column("client_has_unread_updates", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column("requests", sa.Column("client_unread_event_type", sa.String(length=32), nullable=True))
    op.add_column(
        "requests",
        sa.Column("lawyer_has_unread_updates", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column("requests", sa.Column("lawyer_unread_event_type", sa.String(length=32), nullable=True))


def downgrade():
    op.drop_column("requests", "lawyer_unread_event_type")
    op.drop_column("requests", "lawyer_has_unread_updates")
    op.drop_column("requests", "client_unread_event_type")
    op.drop_column("requests", "client_has_unread_updates")
