"""add admin user topics relation table

Revision ID: 0005_admin_user_topics
Revises: 0004_admin_user_avatar
Create Date: 2026-02-22
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0005_admin_user_topics"
down_revision = "0004_admin_user_avatar"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "admin_user_topics",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "responsible",
            sa.String(length=200),
            nullable=False,
            server_default=sa.text("'Администратор системы'"),
        ),
        sa.Column("admin_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("topic_code", sa.String(length=50), nullable=False),
        sa.UniqueConstraint("admin_user_id", "topic_code", name="uq_admin_user_topics_user_topic"),
    )
    op.create_index("ix_admin_user_topics_admin_user_id", "admin_user_topics", ["admin_user_id"])
    op.create_index("ix_admin_user_topics_topic_code", "admin_user_topics", ["topic_code"])


def downgrade():
    op.drop_index("ix_admin_user_topics_topic_code", table_name="admin_user_topics")
    op.drop_index("ix_admin_user_topics_admin_user_id", table_name="admin_user_topics")
    op.drop_table("admin_user_topics")
