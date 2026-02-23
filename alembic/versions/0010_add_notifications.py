"""add notifications table

Revision ID: 0010_notifications
Revises: 0009_sla_transition_config
Create Date: 2026-02-23
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0010_notifications"
down_revision = "0009_sla_transition_config"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "notifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("responsible", sa.String(length=200), nullable=False, server_default="Администратор системы"),
        sa.Column("request_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("recipient_type", sa.String(length=20), nullable=False),
        sa.Column("recipient_admin_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("recipient_track_number", sa.String(length=40), nullable=True),
        sa.Column("event_type", sa.String(length=50), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("dedupe_key", sa.String(length=255), nullable=True, unique=True),
    )
    op.create_index("ix_notifications_request_id", "notifications", ["request_id"])
    op.create_index("ix_notifications_recipient_type", "notifications", ["recipient_type"])
    op.create_index("ix_notifications_recipient_admin_user_id", "notifications", ["recipient_admin_user_id"])
    op.create_index("ix_notifications_recipient_track_number", "notifications", ["recipient_track_number"])
    op.create_index("ix_notifications_event_type", "notifications", ["event_type"])
    op.create_index("ix_notifications_is_read", "notifications", ["is_read"])
    op.create_check_constraint(
        "ck_notifications_recipient_type",
        "notifications",
        "recipient_type IN ('CLIENT','ADMIN_USER')",
    )
    op.create_check_constraint(
        "ck_notifications_recipient_binding",
        "notifications",
        "("
        "(recipient_type = 'CLIENT' AND recipient_track_number IS NOT NULL AND recipient_admin_user_id IS NULL)"
        " OR "
        "(recipient_type = 'ADMIN_USER' AND recipient_admin_user_id IS NOT NULL AND recipient_track_number IS NULL)"
        ")",
    )


def downgrade():
    op.drop_constraint("ck_notifications_recipient_binding", "notifications", type_="check")
    op.drop_constraint("ck_notifications_recipient_type", "notifications", type_="check")
    op.drop_index("ix_notifications_is_read", table_name="notifications")
    op.drop_index("ix_notifications_event_type", table_name="notifications")
    op.drop_index("ix_notifications_recipient_track_number", table_name="notifications")
    op.drop_index("ix_notifications_recipient_admin_user_id", table_name="notifications")
    op.drop_index("ix_notifications_recipient_type", table_name="notifications")
    op.drop_index("ix_notifications_request_id", table_name="notifications")
    op.drop_table("notifications")
