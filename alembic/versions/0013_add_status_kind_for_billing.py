"""add status kind and invoice template for billing flow

Revision ID: 0013_status_kind_billing
Revises: 0012_add_invoices_table
Create Date: 2026-02-23
"""

from alembic import op
import sqlalchemy as sa

revision = "0013_status_kind_billing"
down_revision = "0012_add_invoices_table"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("statuses", sa.Column("kind", sa.String(length=20), nullable=False, server_default="DEFAULT"))
    op.add_column("statuses", sa.Column("invoice_template", sa.Text(), nullable=True))
    op.create_check_constraint(
        "ck_statuses_kind_allowed",
        "statuses",
        "kind IN ('DEFAULT', 'INVOICE', 'PAID')",
    )
    op.create_index("ix_statuses_kind", "statuses", ["kind"])
    op.alter_column("statuses", "kind", server_default=None)


def downgrade():
    op.drop_index("ix_statuses_kind", table_name="statuses")
    op.drop_constraint("ck_statuses_kind_allowed", "statuses", type_="check")
    op.drop_column("statuses", "invoice_template")
    op.drop_column("statuses", "kind")
