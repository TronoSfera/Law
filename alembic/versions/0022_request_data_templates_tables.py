"""add request data templates and template items tables

Revision ID: 0022_req_data_templates
Revises: 0021_request_data_chat_fields
Create Date: 2026-02-26 13:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "0022_req_data_templates"
down_revision = "0021_request_data_chat_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "request_data_templates",
        sa.Column("topic_code", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_by_admin_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("responsible", sa.String(length=200), nullable=False, server_default="Администратор системы"),
        sa.UniqueConstraint("topic_code", "name", name="uq_request_data_templates_topic_name"),
    )
    op.create_index(op.f("ix_request_data_templates_topic_code"), "request_data_templates", ["topic_code"], unique=False)
    op.create_index(op.f("ix_request_data_templates_name"), "request_data_templates", ["name"], unique=False)
    op.create_index(op.f("ix_request_data_templates_created_by_admin_id"), "request_data_templates", ["created_by_admin_id"], unique=False)

    op.create_table(
        "request_data_template_items",
        sa.Column("request_data_template_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("topic_data_template_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("key", sa.String(length=80), nullable=False),
        sa.Column("label", sa.String(length=200), nullable=False),
        sa.Column("value_type", sa.String(length=20), nullable=False, server_default="string"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("responsible", sa.String(length=200), nullable=False, server_default="Администратор системы"),
        sa.UniqueConstraint("request_data_template_id", "key", name="uq_request_data_template_items_template_key"),
    )
    op.create_index(op.f("ix_request_data_template_items_request_data_template_id"), "request_data_template_items", ["request_data_template_id"], unique=False)
    op.create_index(op.f("ix_request_data_template_items_topic_data_template_id"), "request_data_template_items", ["topic_data_template_id"], unique=False)
    op.create_index(op.f("ix_request_data_template_items_key"), "request_data_template_items", ["key"], unique=False)

    op.alter_column("request_data_templates", "enabled", server_default=None)
    op.alter_column("request_data_templates", "sort_order", server_default=None)
    op.alter_column("request_data_templates", "responsible", server_default=None)
    op.alter_column("request_data_template_items", "value_type", server_default=None)
    op.alter_column("request_data_template_items", "sort_order", server_default=None)
    op.alter_column("request_data_template_items", "responsible", server_default=None)


def downgrade() -> None:
    op.drop_index(op.f("ix_request_data_template_items_key"), table_name="request_data_template_items")
    op.drop_index(op.f("ix_request_data_template_items_topic_data_template_id"), table_name="request_data_template_items")
    op.drop_index(op.f("ix_request_data_template_items_request_data_template_id"), table_name="request_data_template_items")
    op.drop_table("request_data_template_items")

    op.drop_index(op.f("ix_request_data_templates_created_by_admin_id"), table_name="request_data_templates")
    op.drop_index(op.f("ix_request_data_templates_name"), table_name="request_data_templates")
    op.drop_index(op.f("ix_request_data_templates_topic_code"), table_name="request_data_templates")
    op.drop_table("request_data_templates")
