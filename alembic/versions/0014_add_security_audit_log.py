"""add security audit log table for file access events

Revision ID: 0014_security_audit_log
Revises: 0013_status_kind_billing
Create Date: 2026-02-23
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0014_security_audit_log"
down_revision = "0013_status_kind_billing"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "security_audit_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("responsible", sa.String(length=200), nullable=False, server_default="Администратор системы"),
        sa.Column("actor_role", sa.String(length=30), nullable=False),
        sa.Column("actor_subject", sa.String(length=200), nullable=False, server_default=""),
        sa.Column("actor_ip", sa.String(length=64), nullable=True),
        sa.Column("action", sa.String(length=50), nullable=False),
        sa.Column("scope", sa.String(length=50), nullable=False),
        sa.Column("object_key", sa.String(length=500), nullable=True),
        sa.Column("request_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("attachment_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("allowed", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("reason", sa.String(length=400), nullable=True),
        sa.Column("details", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
    )
    op.create_index("ix_security_audit_log_created_at", "security_audit_log", ["created_at"])
    op.create_index("ix_security_audit_log_allowed", "security_audit_log", ["allowed"])
    op.create_index("ix_security_audit_log_action", "security_audit_log", ["action"])
    op.create_index("ix_security_audit_log_actor_subject", "security_audit_log", ["actor_subject"])
    op.alter_column("security_audit_log", "details", server_default=None)
    op.alter_column("security_audit_log", "allowed", server_default=None)
    op.alter_column("security_audit_log", "actor_subject", server_default=None)


def downgrade():
    op.drop_index("ix_security_audit_log_actor_subject", table_name="security_audit_log")
    op.drop_index("ix_security_audit_log_action", table_name="security_audit_log")
    op.drop_index("ix_security_audit_log_allowed", table_name="security_audit_log")
    op.drop_index("ix_security_audit_log_created_at", table_name="security_audit_log")
    op.drop_table("security_audit_log")
