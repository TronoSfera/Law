from __future__ import annotations

# Backward-compatible facade: chat domain logic now lives in chat_secure_service.
from app.services.chat_secure_service import (
    create_admin_or_lawyer_message,
    create_client_message,
    get_chat_activity_summary,
    list_messages_for_request,
    serialize_message,
    serialize_messages_for_request,
)

__all__ = [
    "create_admin_or_lawyer_message",
    "create_client_message",
    "get_chat_activity_summary",
    "list_messages_for_request",
    "serialize_message",
    "serialize_messages_for_request",
]
