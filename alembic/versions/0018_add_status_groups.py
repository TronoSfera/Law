"""add status groups dictionary and status.status_group_id

Revision ID: 0018_status_groups
Revises: 0017_transition_requirements
Create Date: 2026-02-25 20:05:00.000000
"""

from __future__ import annotations

import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "0018_status_groups"
down_revision = "0017_transition_requirements"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "status_groups",
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("responsible", sa.String(length=200), nullable=False, server_default="Администратор системы"),
    )
    op.create_index("ix_status_groups_name", "status_groups", ["name"], unique=True)

    op.add_column("statuses", sa.Column("status_group_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_index("ix_statuses_status_group_id", "statuses", ["status_group_id"])

    conn = op.get_bind()
    groups = [
        ("Новые", 10),
        ("В работе", 20),
        ("Ожидание", 30),
        ("Завершены", 40),
    ]
    group_ids: dict[str, str] = {}
    for name, sort_order in groups:
        group_id = str(uuid.uuid4())
        group_ids[name] = group_id
        conn.execute(
            sa.text(
                """
                INSERT INTO status_groups (id, name, sort_order, responsible)
                VALUES (:id, :name, :sort_order, :responsible)
                """
            ),
            {
                "id": group_id,
                "name": name,
                "sort_order": sort_order,
                "responsible": "Администратор системы",
            },
        )

    conn.execute(
        sa.text(
            """
            UPDATE statuses
            SET status_group_id = :group_done
            WHERE
              COALESCE(is_terminal, false) = true
              OR UPPER(COALESCE(kind, 'DEFAULT')) = 'PAID'
              OR UPPER(COALESCE(code, '')) LIKE '%CLOSE%'
              OR UPPER(COALESCE(code, '')) LIKE '%RESOLV%'
              OR UPPER(COALESCE(code, '')) LIKE '%REJECT%'
              OR UPPER(COALESCE(code, '')) LIKE '%DONE%'
              OR UPPER(COALESCE(code, '')) LIKE '%PAID%'
            """
        ),
        {"group_done": group_ids["Завершены"]},
    )
    conn.execute(
        sa.text(
            """
            UPDATE statuses
            SET status_group_id = :group_waiting
            WHERE
              status_group_id IS NULL
              AND (
                UPPER(COALESCE(kind, 'DEFAULT')) = 'INVOICE'
                OR UPPER(COALESCE(code, '')) LIKE '%WAIT%'
                OR UPPER(COALESCE(code, '')) LIKE '%PEND%'
                OR UPPER(COALESCE(code, '')) LIKE '%HOLD%'
                OR UPPER(COALESCE(code, '')) LIKE '%SUSPEND%'
                OR UPPER(COALESCE(code, '')) LIKE '%BLOCK%'
              )
            """
        ),
        {"group_waiting": group_ids["Ожидание"]},
    )
    conn.execute(
        sa.text(
            """
            UPDATE statuses
            SET status_group_id = :group_new
            WHERE
              status_group_id IS NULL
              AND (
                UPPER(COALESCE(code, '')) LIKE 'NEW%'
                OR UPPER(COALESCE(code, '')) LIKE '%_NEW'
              )
            """
        ),
        {"group_new": group_ids["Новые"]},
    )
    conn.execute(
        sa.text(
            """
            UPDATE statuses
            SET status_group_id = :group_in_progress
            WHERE status_group_id IS NULL
            """
        ),
        {"group_in_progress": group_ids["В работе"]},
    )

    op.alter_column("status_groups", "sort_order", server_default=None)
    op.alter_column("status_groups", "created_at", server_default=None)
    op.alter_column("status_groups", "updated_at", server_default=None)
    op.alter_column("status_groups", "responsible", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_statuses_status_group_id", table_name="statuses")
    op.drop_column("statuses", "status_group_id")
    op.drop_index("ix_status_groups_name", table_name="status_groups")
    op.drop_table("status_groups")
