"""add landing featured staff carousel table

Revision ID: 0024_featured_staff_carousel
Revises: 0023_status_important_date
Create Date: 2026-02-26 23:45:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "0024_featured_staff_carousel"
down_revision = "0023_status_important_date"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "landing_featured_staff",
        sa.Column("admin_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("caption", sa.String(length=300), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("pinned", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("responsible", sa.String(length=200), nullable=False, server_default="Администратор системы"),
        sa.UniqueConstraint("admin_user_id", name="uq_landing_featured_staff_admin_user"),
    )
    op.create_index(
        op.f("ix_landing_featured_staff_admin_user_id"),
        "landing_featured_staff",
        ["admin_user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_landing_featured_staff_sort_order"),
        "landing_featured_staff",
        ["sort_order"],
        unique=False,
    )
    op.create_index(
        op.f("ix_landing_featured_staff_pinned"),
        "landing_featured_staff",
        ["pinned"],
        unique=False,
    )
    op.create_index(
        op.f("ix_landing_featured_staff_enabled"),
        "landing_featured_staff",
        ["enabled"],
        unique=False,
    )

    op.alter_column("landing_featured_staff", "sort_order", server_default=None)
    op.alter_column("landing_featured_staff", "pinned", server_default=None)
    op.alter_column("landing_featured_staff", "enabled", server_default=None)
    op.alter_column("landing_featured_staff", "responsible", server_default=None)


def downgrade() -> None:
    op.drop_index(op.f("ix_landing_featured_staff_enabled"), table_name="landing_featured_staff")
    op.drop_index(op.f("ix_landing_featured_staff_pinned"), table_name="landing_featured_staff")
    op.drop_index(op.f("ix_landing_featured_staff_sort_order"), table_name="landing_featured_staff")
    op.drop_index(op.f("ix_landing_featured_staff_admin_user_id"), table_name="landing_featured_staff")
    op.drop_table("landing_featured_staff")
