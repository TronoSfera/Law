"""add avatar_original_key and avatar_crop_json to admin_users

Stores the S3 key of the unmodified original photo and the crop parameters
so the avatar can be re-cropped without re-uploading the source image.

Revision ID: 0038_avatar_crop_fields
Revises: 0037_fix_status_groups
Create Date: 2026-04-06
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0038_avatar_crop_fields"
down_revision = "0037_fix_status_groups"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("admin_users", sa.Column("avatar_original_key", sa.String(500), nullable=True))
    op.add_column("admin_users", sa.Column("avatar_crop_json", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("admin_users", "avatar_crop_json")
    op.drop_column("admin_users", "avatar_original_key")
