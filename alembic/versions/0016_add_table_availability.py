"""add table availability controls for dictionaries

Revision ID: 0016_table_availability
Revises: 0015_clients_table_links
Create Date: 2026-02-24
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0016_table_availability"
down_revision = "0015_clients_table_links"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "table_availability",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("responsible", sa.String(length=200), nullable=False, server_default="Администратор системы"),
        sa.Column("table_name", sa.String(length=120), nullable=False, unique=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.create_index("ix_table_availability_table_name", "table_availability", ["table_name"], unique=True)
    op.create_index("ix_table_availability_is_active", "table_availability", ["is_active"], unique=False)


def downgrade():
    op.drop_index("ix_table_availability_is_active", table_name="table_availability")
    op.drop_index("ix_table_availability_table_name", table_name="table_availability")
    op.drop_table("table_availability")
