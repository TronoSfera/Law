"""add topic/request template tables

Revision ID: 0008_request_templates
Revises: 0007_topic_status_transitions
Create Date: 2026-02-23
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0008_request_templates"
down_revision = "0007_topic_status_transitions"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "topic_required_fields",
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
        sa.Column("field_key", sa.String(length=80), nullable=False),
        sa.Column("required", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.UniqueConstraint("topic_code", "field_key", name="uq_topic_required_fields_topic_field"),
    )
    op.create_index("ix_topic_required_fields_topic_code", "topic_required_fields", ["topic_code"])
    op.create_index("ix_topic_required_fields_field_key", "topic_required_fields", ["field_key"])

    op.create_table(
        "topic_data_templates",
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
        sa.Column("key", sa.String(length=80), nullable=False),
        sa.Column("label", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("required", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.UniqueConstraint("topic_code", "key", name="uq_topic_data_templates_topic_key"),
    )
    op.create_index("ix_topic_data_templates_topic_code", "topic_data_templates", ["topic_code"])
    op.create_index("ix_topic_data_templates_key", "topic_data_templates", ["key"])

    op.create_table(
        "request_data_requirements",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "responsible",
            sa.String(length=200),
            nullable=False,
            server_default=sa.text("'Администратор системы'"),
        ),
        sa.Column("request_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("topic_template_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("key", sa.String(length=80), nullable=False),
        sa.Column("label", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("required", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_by_admin_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.UniqueConstraint("request_id", "key", name="uq_request_data_requirements_request_key"),
    )
    op.create_index("ix_request_data_requirements_request_id", "request_data_requirements", ["request_id"])
    op.create_index("ix_request_data_requirements_topic_template_id", "request_data_requirements", ["topic_template_id"])
    op.create_index("ix_request_data_requirements_key", "request_data_requirements", ["key"])


def downgrade():
    op.drop_index("ix_request_data_requirements_key", table_name="request_data_requirements")
    op.drop_index("ix_request_data_requirements_topic_template_id", table_name="request_data_requirements")
    op.drop_index("ix_request_data_requirements_request_id", table_name="request_data_requirements")
    op.drop_table("request_data_requirements")

    op.drop_index("ix_topic_data_templates_key", table_name="topic_data_templates")
    op.drop_index("ix_topic_data_templates_topic_code", table_name="topic_data_templates")
    op.drop_table("topic_data_templates")

    op.drop_index("ix_topic_required_fields_field_key", table_name="topic_required_fields")
    op.drop_index("ix_topic_required_fields_topic_code", table_name="topic_required_fields")
    op.drop_table("topic_required_fields")
