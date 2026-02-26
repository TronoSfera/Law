"""add important date to requests and status history

Revision ID: 0023_status_important_date
Revises: 0022_req_data_templates
Create Date: 2026-02-26 15:20:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision = "0023_status_important_date"
down_revision = "0022_req_data_templates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("requests", sa.Column("important_date_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index(op.f("ix_requests_important_date_at"), "requests", ["important_date_at"], unique=False)

    op.add_column("status_history", sa.Column("important_date_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index(op.f("ix_status_history_important_date_at"), "status_history", ["important_date_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_status_history_important_date_at"), table_name="status_history")
    op.drop_column("status_history", "important_date_at")

    op.drop_index(op.f("ix_requests_important_date_at"), table_name="requests")
    op.drop_column("requests", "important_date_at")

