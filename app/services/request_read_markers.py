from __future__ import annotations

from app.models.request import Request

EVENT_MESSAGE = "MESSAGE"
EVENT_ATTACHMENT = "ATTACHMENT"
EVENT_STATUS = "STATUS"


def mark_unread_for_client(request: Request, event_type: str) -> None:
    request.client_has_unread_updates = True
    request.client_unread_event_type = str(event_type or "").strip().upper() or None


def mark_unread_for_lawyer(request: Request, event_type: str) -> None:
    request.lawyer_has_unread_updates = True
    request.lawyer_unread_event_type = str(event_type or "").strip().upper() or None


def clear_unread_for_client(request: Request) -> bool:
    changed = bool(request.client_has_unread_updates or request.client_unread_event_type)
    request.client_has_unread_updates = False
    request.client_unread_event_type = None
    return changed


def clear_unread_for_lawyer(request: Request) -> bool:
    changed = bool(request.lawyer_has_unread_updates or request.lawyer_unread_event_type)
    request.lawyer_has_unread_updates = False
    request.lawyer_unread_event_type = None
    return changed
