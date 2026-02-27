"""add request service requests table

Revision ID: 0025_service_requests
Revises: 0024_featured_staff_carousel
Create Date: 2026-02-27 14:45:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "0025_service_requests"
down_revision = "0024_featured_staff_carousel"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "request_service_requests",
        sa.Column("request_id", sa.String(length=60), nullable=False),
        sa.Column("client_id", sa.String(length=60), nullable=True),
        sa.Column("assigned_lawyer_id", sa.String(length=60), nullable=True),
        sa.Column("resolved_by_admin_id", sa.String(length=60), nullable=True),
        sa.Column("type", sa.String(length=40), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="NEW"),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_by_client", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("admin_unread", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("lawyer_unread", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("admin_read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("lawyer_read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("responsible", sa.String(length=200), nullable=False, server_default="Администратор системы"),
    )
    op.create_index(op.f("ix_request_service_requests_request_id"), "request_service_requests", ["request_id"], unique=False)
    op.create_index(op.f("ix_request_service_requests_client_id"), "request_service_requests", ["client_id"], unique=False)
    op.create_index(
        op.f("ix_request_service_requests_assigned_lawyer_id"),
        "request_service_requests",
        ["assigned_lawyer_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_request_service_requests_resolved_by_admin_id"),
        "request_service_requests",
        ["resolved_by_admin_id"],
        unique=False,
    )
    op.create_index(op.f("ix_request_service_requests_type"), "request_service_requests", ["type"], unique=False)
    op.create_index(op.f("ix_request_service_requests_status"), "request_service_requests", ["status"], unique=False)
    op.create_index(op.f("ix_request_service_requests_admin_unread"), "request_service_requests", ["admin_unread"], unique=False)
    op.create_index(op.f("ix_request_service_requests_lawyer_unread"), "request_service_requests", ["lawyer_unread"], unique=False)

    op.alter_column("request_service_requests", "status", server_default=None)
    op.alter_column("request_service_requests", "created_by_client", server_default=None)
    op.alter_column("request_service_requests", "admin_unread", server_default=None)
    op.alter_column("request_service_requests", "lawyer_unread", server_default=None)
    op.alter_column("request_service_requests", "responsible", server_default=None)


def downgrade() -> None:
    op.drop_index(op.f("ix_request_service_requests_lawyer_unread"), table_name="request_service_requests")
    op.drop_index(op.f("ix_request_service_requests_admin_unread"), table_name="request_service_requests")
    op.drop_index(op.f("ix_request_service_requests_status"), table_name="request_service_requests")
    op.drop_index(op.f("ix_request_service_requests_type"), table_name="request_service_requests")
    op.drop_index(op.f("ix_request_service_requests_resolved_by_admin_id"), table_name="request_service_requests")
    op.drop_index(op.f("ix_request_service_requests_assigned_lawyer_id"), table_name="request_service_requests")
    op.drop_index(op.f("ix_request_service_requests_client_id"), table_name="request_service_requests")
    op.drop_index(op.f("ix_request_service_requests_request_id"), table_name="request_service_requests")
    op.drop_table("request_service_requests")
