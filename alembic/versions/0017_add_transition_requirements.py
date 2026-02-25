"""add transition requirements fields for status designer

Revision ID: 0017_transition_requirements
Revises: 0016_table_availability
Create Date: 2026-02-25
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0017_transition_requirements"
down_revision = "0016_table_availability"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("topic_status_transitions", sa.Column("required_data_keys", sa.JSON(), nullable=True))
    op.add_column("topic_status_transitions", sa.Column("required_mime_types", sa.JSON(), nullable=True))


def downgrade():
    op.drop_column("topic_status_transitions", "required_mime_types")
    op.drop_column("topic_status_transitions", "required_data_keys")
