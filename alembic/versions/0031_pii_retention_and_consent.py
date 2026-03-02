"""add pdn consent fields and data retention policies

Revision ID: 0031_pii_retention_and_consent
Revises: 0030_attachment_scan
Create Date: 2026-03-02
"""

from datetime import datetime, timezone
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0031_pii_retention_and_consent"
down_revision = "0030_attachment_scan"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "requests",
        sa.Column("pdn_consent", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "requests",
        sa.Column("pdn_consent_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "requests",
        sa.Column("pdn_consent_ip", sa.String(length=64), nullable=True),
    )

    op.create_table(
        "data_retention_policies",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("responsible", sa.String(length=200), nullable=False, server_default="Администратор системы"),
        sa.Column("entity", sa.String(length=80), nullable=False, unique=True),
        sa.Column("retention_days", sa.Integer(), nullable=False, server_default="365"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("hard_delete", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("description", sa.String(length=300), nullable=True),
    )
    op.create_index(
        "ix_data_retention_policies_entity",
        "data_retention_policies",
        ["entity"],
        unique=True,
    )

    now = datetime.now(timezone.utc)
    policies = sa.table(
        "data_retention_policies",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
        sa.column("responsible", sa.String(length=200)),
        sa.column("entity", sa.String(length=80)),
        sa.column("retention_days", sa.Integer()),
        sa.column("enabled", sa.Boolean()),
        sa.column("hard_delete", sa.Boolean()),
        sa.column("description", sa.String(length=300)),
    )
    op.bulk_insert(
        policies,
        [
            {
                "id": uuid.UUID("8c3d4b50-2f11-4ec4-a993-a7f5af6f45b1"),
                "created_at": now,
                "updated_at": now,
                "responsible": "Администратор системы",
                "entity": "otp_sessions",
                "retention_days": 1,
                "enabled": True,
                "hard_delete": True,
                "description": "Одноразовые коды и технические OTP-сессии",
            },
            {
                "id": uuid.UUID("9c9e89b2-a9ee-4f1f-b80b-8f93a3f227c2"),
                "created_at": now,
                "updated_at": now,
                "responsible": "Администратор системы",
                "entity": "notifications",
                "retention_days": 120,
                "enabled": True,
                "hard_delete": True,
                "description": "Уведомления пользователей/сотрудников",
            },
            {
                "id": uuid.UUID("3ee2d4fb-42a0-48f5-a5b4-5f5f0ebebea7"),
                "created_at": now,
                "updated_at": now,
                "responsible": "Администратор системы",
                "entity": "audit_log",
                "retention_days": 365,
                "enabled": True,
                "hard_delete": True,
                "description": "Операционный аудит изменений сущностей",
            },
            {
                "id": uuid.UUID("4f6c95ff-7c6d-43a4-bdb5-d0d764649f22"),
                "created_at": now,
                "updated_at": now,
                "responsible": "Администратор системы",
                "entity": "security_audit_log",
                "retention_days": 365,
                "enabled": True,
                "hard_delete": True,
                "description": "Журнал безопасности и доступа к ПДн",
            },
            {
                "id": uuid.UUID("8a3600f9-a89a-4ff2-b2a1-0bf248f7377a"),
                "created_at": now,
                "updated_at": now,
                "responsible": "Администратор системы",
                "entity": "requests",
                "retention_days": 3650,
                "enabled": False,
                "hard_delete": True,
                "description": "Терминальные заявки (выключено по умолчанию)",
            },
        ],
    )

    op.alter_column("requests", "pdn_consent", server_default=None)


def downgrade():
    op.drop_index("ix_data_retention_policies_entity", table_name="data_retention_policies")
    op.drop_table("data_retention_policies")
    op.drop_column("requests", "pdn_consent_ip")
    op.drop_column("requests", "pdn_consent_at")
    op.drop_column("requests", "pdn_consent")
