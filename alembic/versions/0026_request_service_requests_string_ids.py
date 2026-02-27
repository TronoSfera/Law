"""normalize request_service_requests link column types to varchar

Revision ID: 0026_srv_req_str_ids
Revises: 0025_service_requests
Create Date: 2026-02-27 15:40:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision = "0026_srv_req_str_ids"
down_revision = "0025_service_requests"
branch_labels = None
depends_on = None


def _postgres_alter_to_varchar(column_name: str) -> None:
    op.execute(
        sa.text(
            f"""
            ALTER TABLE request_service_requests
            ALTER COLUMN {column_name} TYPE VARCHAR(60)
            USING {column_name}::text
            """
        )
    )


def _postgres_alter_to_uuid(column_name: str) -> None:
    op.execute(
        sa.text(
            f"""
            ALTER TABLE request_service_requests
            ALTER COLUMN {column_name} TYPE UUID
            USING NULLIF({column_name}, '')::uuid
            """
        )
    )


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for name in ("request_id", "client_id", "assigned_lawyer_id", "resolved_by_admin_id"):
            _postgres_alter_to_varchar(name)


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for name in ("request_id", "client_id", "assigned_lawyer_id", "resolved_by_admin_id"):
            _postgres_alter_to_uuid(name)

