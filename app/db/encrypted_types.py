from __future__ import annotations

from sqlalchemy import Text
from sqlalchemy.types import TypeDecorator

from app.services.chat_crypto import decrypt_message_body, encrypt_message_body


class EncryptedChatText(TypeDecorator):
    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        return encrypt_message_body(value)

    def process_result_value(self, value, dialect):
        return decrypt_message_body(value)
