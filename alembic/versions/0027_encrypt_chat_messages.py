"""encrypt historical chat messages at rest

Revision ID: 0027_encrypt_chat_messages
Revises: 0026_srv_req_str_ids
Create Date: 2026-02-27 21:30:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

from app.services.chat_crypto import decrypt_message_body, encrypt_message_body, is_encrypted_message


# revision identifiers, used by Alembic.
revision = "0027_encrypt_chat_messages"
down_revision = "0026_srv_req_str_ids"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id, body FROM messages WHERE body IS NOT NULL")).mappings().all()
    for row in rows:
        message_id = row.get("id")
        body = row.get("body")
        body_text = str(body or "")
        if not body_text or is_encrypted_message(body_text):
            continue
        encrypted = encrypt_message_body(body_text)
        bind.execute(
            sa.text("UPDATE messages SET body = :body WHERE id = :id"),
            {"body": encrypted, "id": str(message_id)},
        )


def downgrade() -> None:
    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id, body FROM messages WHERE body IS NOT NULL")).mappings().all()
    for row in rows:
        message_id = row.get("id")
        body = row.get("body")
        body_text = str(body or "")
        if not body_text or not is_encrypted_message(body_text):
            continue
        decrypted = decrypt_message_body(body_text)
        bind.execute(
            sa.text("UPDATE messages SET body = :body WHERE id = :id"),
            {"body": decrypted, "id": str(message_id)},
        )
