"""add financial fields for dashboard metrics

Revision ID: 0011_dashboard_financial_fields
Revises: 0010_notifications
Create Date: 2026-02-23
"""

from alembic import op
import sqlalchemy as sa

revision = "0011_dashboard_financial_fields"
down_revision = "0010_notifications"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("admin_users", sa.Column("default_rate", sa.Numeric(12, 2), nullable=True))
    op.add_column("admin_users", sa.Column("salary_percent", sa.Numeric(5, 2), nullable=True))
    op.create_check_constraint(
        "ck_admin_users_salary_percent_range",
        "admin_users",
        "salary_percent IS NULL OR (salary_percent >= 0 AND salary_percent <= 100)",
    )

    op.add_column("requests", sa.Column("effective_rate", sa.Numeric(12, 2), nullable=True))
    op.add_column("requests", sa.Column("invoice_amount", sa.Numeric(14, 2), nullable=True))
    op.add_column("requests", sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("requests", sa.Column("paid_by_admin_id", sa.String(length=64), nullable=True))
    op.create_index("ix_requests_paid_at", "requests", ["paid_at"])
    op.create_check_constraint(
        "ck_requests_invoice_amount_non_negative",
        "requests",
        "invoice_amount IS NULL OR invoice_amount >= 0",
    )
    op.create_check_constraint(
        "ck_requests_effective_rate_non_negative",
        "requests",
        "effective_rate IS NULL OR effective_rate >= 0",
    )


def downgrade():
    op.drop_constraint("ck_requests_effective_rate_non_negative", "requests", type_="check")
    op.drop_constraint("ck_requests_invoice_amount_non_negative", "requests", type_="check")
    op.drop_index("ix_requests_paid_at", table_name="requests")
    op.drop_column("requests", "paid_by_admin_id")
    op.drop_column("requests", "paid_at")
    op.drop_column("requests", "invoice_amount")
    op.drop_column("requests", "effective_rate")

    op.drop_constraint("ck_admin_users_salary_percent_range", "admin_users", type_="check")
    op.drop_column("admin_users", "salary_percent")
    op.drop_column("admin_users", "default_rate")
