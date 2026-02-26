"""add request_cost field to requests

Revision ID: 0019_request_cost_on_requests
Revises: 0018_status_groups
Create Date: 2026-02-26 00:15:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0019_request_cost_on_requests"
down_revision = "0018_status_groups"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("requests", sa.Column("request_cost", sa.Numeric(14, 2), nullable=True))


def downgrade() -> None:
    op.drop_column("requests", "request_cost")

