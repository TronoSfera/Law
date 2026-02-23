"""add avatar url to admin users

Revision ID: 0004_admin_user_avatar
Revises: 0003_admin_user_primary_topic
Create Date: 2026-02-22
"""

from alembic import op
import sqlalchemy as sa

revision = "0004_admin_user_avatar"
down_revision = "0003_admin_user_primary_topic"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("admin_users", sa.Column("avatar_url", sa.String(length=500), nullable=True))


def downgrade():
    op.drop_column("admin_users", "avatar_url")
