"""extend request data templates and request data requirements for chat requests

Revision ID: 0021_request_data_chat_fields
Revises: 0020_admin_users_phone
Create Date: 2026-02-26 12:10:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0021_request_data_chat_fields"
down_revision = "0020_admin_users_phone"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("topic_data_templates", sa.Column("value_type", sa.String(length=20), nullable=False, server_default="text"))
    op.add_column("topic_data_templates", sa.Column("document_name", sa.String(length=200), nullable=True))
    op.create_index(op.f("ix_topic_data_templates_document_name"), "topic_data_templates", ["document_name"], unique=False)

    op.add_column("request_data_requirements", sa.Column("request_message_id", sa.UUID(), nullable=True))
    op.add_column("request_data_requirements", sa.Column("field_type", sa.String(length=20), nullable=False, server_default="text"))
    op.add_column("request_data_requirements", sa.Column("document_name", sa.String(length=200), nullable=True))
    op.add_column("request_data_requirements", sa.Column("value_text", sa.String(length=500), nullable=True))
    op.add_column("request_data_requirements", sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"))
    op.create_index(op.f("ix_request_data_requirements_request_message_id"), "request_data_requirements", ["request_message_id"], unique=False)
    op.create_index(op.f("ix_request_data_requirements_document_name"), "request_data_requirements", ["document_name"], unique=False)

    op.alter_column("topic_data_templates", "value_type", server_default=None)
    op.alter_column("request_data_requirements", "field_type", server_default=None)
    op.alter_column("request_data_requirements", "sort_order", server_default=None)


def downgrade() -> None:
    op.drop_index(op.f("ix_request_data_requirements_document_name"), table_name="request_data_requirements")
    op.drop_index(op.f("ix_request_data_requirements_request_message_id"), table_name="request_data_requirements")
    op.drop_column("request_data_requirements", "sort_order")
    op.drop_column("request_data_requirements", "value_text")
    op.drop_column("request_data_requirements", "document_name")
    op.drop_column("request_data_requirements", "field_type")
    op.drop_column("request_data_requirements", "request_message_id")

    op.drop_index(op.f("ix_topic_data_templates_document_name"), table_name="topic_data_templates")
    op.drop_column("topic_data_templates", "document_name")
    op.drop_column("topic_data_templates", "value_type")
