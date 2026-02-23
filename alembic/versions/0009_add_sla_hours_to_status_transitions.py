"""add sla_hours to topic status transitions

Revision ID: 0009_sla_transition_config
Revises: 0008_request_templates
Create Date: 2026-02-23
"""

from alembic import op
import sqlalchemy as sa

revision = "0009_sla_transition_config"
down_revision = "0008_request_templates"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("topic_status_transitions", sa.Column("sla_hours", sa.Integer(), nullable=True))
    op.create_check_constraint(
        "ck_topic_status_transitions_sla_hours_positive",
        "topic_status_transitions",
        "sla_hours IS NULL OR sla_hours > 0",
    )


def downgrade():
    op.drop_constraint("ck_topic_status_transitions_sla_hours_positive", "topic_status_transitions", type_="check")
    op.drop_column("topic_status_transitions", "sla_hours")
