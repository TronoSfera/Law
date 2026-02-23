"""add invoices table

Revision ID: 0012_add_invoices_table
Revises: 0011_dashboard_financial_fields
Create Date: 2026-02-23
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0012_add_invoices_table"
down_revision = "0011_dashboard_financial_fields"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "invoices",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("responsible", sa.String(length=200), nullable=False, server_default="Администратор системы"),
        sa.Column("request_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("invoice_number", sa.String(length=40), nullable=False, unique=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="WAITING_PAYMENT"),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="RUB"),
        sa.Column("payer_display_name", sa.String(length=300), nullable=False),
        sa.Column("payer_details_encrypted", sa.Text(), nullable=True),
        sa.Column("issued_by_admin_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("issued_by_role", sa.String(length=20), nullable=True),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_invoices_request_id", "invoices", ["request_id"])
    op.create_index("ix_invoices_invoice_number", "invoices", ["invoice_number"], unique=True)
    op.create_index("ix_invoices_status", "invoices", ["status"])
    op.create_index("ix_invoices_issued_by_admin_user_id", "invoices", ["issued_by_admin_user_id"])
    op.create_check_constraint("ck_invoices_amount_non_negative", "invoices", "amount >= 0")
    op.create_check_constraint(
        "ck_invoices_status_allowed",
        "invoices",
        "status IN ('WAITING_PAYMENT', 'PAID', 'CANCELED')",
    )


def downgrade():
    op.drop_constraint("ck_invoices_status_allowed", "invoices", type_="check")
    op.drop_constraint("ck_invoices_amount_non_negative", "invoices", type_="check")
    op.drop_index("ix_invoices_issued_by_admin_user_id", table_name="invoices")
    op.drop_index("ix_invoices_status", table_name="invoices")
    op.drop_index("ix_invoices_invoice_number", table_name="invoices")
    op.drop_index("ix_invoices_request_id", table_name="invoices")
    op.drop_table("invoices")
