"""add phone to admin_users

Revision ID: 0020_admin_users_phone
Revises: 0019_request_cost_on_requests
Create Date: 2026-02-26 22:10:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0020_admin_users_phone"
down_revision = "0019_request_cost_on_requests"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("admin_users", sa.Column("phone", sa.String(length=30), nullable=True))
    op.create_index(op.f("ix_admin_users_phone"), "admin_users", ["phone"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_admin_users_phone"), table_name="admin_users")
    op.drop_column("admin_users", "phone")
