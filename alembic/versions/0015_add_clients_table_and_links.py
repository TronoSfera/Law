"""add clients table and links from requests/invoices

Revision ID: 0015_clients_table_links
Revises: 0014_security_audit_log
Create Date: 2026-02-24
"""

from __future__ import annotations

import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0015_clients_table_links"
down_revision = "0014_security_audit_log"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "clients",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("responsible", sa.String(length=200), nullable=False, server_default="Администратор системы"),
        sa.Column("full_name", sa.String(length=200), nullable=False),
        sa.Column("phone", sa.String(length=30), nullable=False, unique=True),
    )
    op.create_index("ix_clients_phone", "clients", ["phone"], unique=True)

    op.add_column("requests", sa.Column("client_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("invoices", sa.Column("client_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_index("ix_requests_client_id", "requests", ["client_id"])
    op.create_index("ix_invoices_client_id", "invoices", ["client_id"])
    op.create_foreign_key("fk_requests_client_id_clients", "requests", "clients", ["client_id"], ["id"])
    op.create_foreign_key("fk_invoices_client_id_clients", "invoices", "clients", ["client_id"], ["id"])

    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            """
            SELECT DISTINCT ON (client_phone)
                client_phone,
                client_name
            FROM requests
            WHERE client_phone IS NOT NULL AND client_phone <> ''
            ORDER BY client_phone, created_at ASC NULLS FIRST
            """
        )
    ).mappings()

    for row in rows:
        client_id = uuid.uuid4()
        bind.execute(
            sa.text(
                """
                INSERT INTO clients (id, created_at, updated_at, responsible, full_name, phone)
                VALUES (:id, now(), now(), :responsible, :full_name, :phone)
                ON CONFLICT (phone) DO NOTHING
                """
            ),
            {
                "id": client_id,
                "responsible": "Миграция системы",
                "full_name": str(row.get("client_name") or "").strip() or "Клиент",
                "phone": str(row.get("client_phone") or "").strip(),
            },
        )

    bind.execute(
        sa.text(
            """
            UPDATE requests AS r
            SET client_id = c.id
            FROM clients AS c
            WHERE r.client_phone = c.phone
              AND (r.client_id IS NULL OR r.client_id <> c.id)
            """
        )
    )

    bind.execute(
        sa.text(
            """
            UPDATE invoices AS i
            SET client_id = r.client_id
            FROM requests AS r
            WHERE i.request_id = r.id
              AND (i.client_id IS NULL OR i.client_id <> r.client_id)
            """
        )
    )


def downgrade():
    op.drop_constraint("fk_invoices_client_id_clients", "invoices", type_="foreignkey")
    op.drop_constraint("fk_requests_client_id_clients", "requests", type_="foreignkey")
    op.drop_index("ix_invoices_client_id", table_name="invoices")
    op.drop_index("ix_requests_client_id", table_name="requests")
    op.drop_column("invoices", "client_id")
    op.drop_column("requests", "client_id")
    op.drop_index("ix_clients_phone", table_name="clients")
    op.drop_table("clients")
