"""add topic status transitions

Revision ID: 0007_topic_status_transitions
Revises: 0006_request_read_markers
Create Date: 2026-02-23
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0007_topic_status_transitions"
down_revision = "0006_request_read_markers"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "topic_status_transitions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "responsible",
            sa.String(length=200),
            nullable=False,
            server_default=sa.text("'Администратор системы'"),
        ),
        sa.Column("topic_code", sa.String(length=50), nullable=False),
        sa.Column("from_status", sa.String(length=50), nullable=False),
        sa.Column("to_status", sa.String(length=50), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.UniqueConstraint(
            "topic_code",
            "from_status",
            "to_status",
            name="uq_topic_status_transitions_topic_from_to",
        ),
    )
    op.create_index("ix_topic_status_transitions_topic_code", "topic_status_transitions", ["topic_code"])
    op.create_index("ix_topic_status_transitions_from_status", "topic_status_transitions", ["from_status"])
    op.create_index("ix_topic_status_transitions_to_status", "topic_status_transitions", ["to_status"])


def downgrade():
    op.drop_index("ix_topic_status_transitions_to_status", table_name="topic_status_transitions")
    op.drop_index("ix_topic_status_transitions_from_status", table_name="topic_status_transitions")
    op.drop_index("ix_topic_status_transitions_topic_code", table_name="topic_status_transitions")
    op.drop_table("topic_status_transitions")
