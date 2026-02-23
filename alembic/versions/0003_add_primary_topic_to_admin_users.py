"""add primary topic profile to admin users

Revision ID: 0003_admin_user_primary_topic
Revises: 0002_add_responsible
Create Date: 2026-02-22
"""

from alembic import op
import sqlalchemy as sa

revision = "0003_admin_user_primary_topic"
down_revision = "0002_add_responsible"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("admin_users", sa.Column("primary_topic_code", sa.String(length=50), nullable=True))
    op.create_index("ix_admin_users_primary_topic_code", "admin_users", ["primary_topic_code"])


def downgrade():
    op.drop_index("ix_admin_users_primary_topic_code", table_name="admin_users")
    op.drop_column("admin_users", "primary_topic_code")
