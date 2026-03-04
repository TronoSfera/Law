from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import inspect
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models.admin_user import AdminUser
from app.models.message import Message
from app.models.request import Request
from app.services.notifications import (
    EVENT_ASSIGNMENT as NOTIFICATION_EVENT_ASSIGNMENT,
    EVENT_REASSIGNMENT as NOTIFICATION_EVENT_REASSIGNMENT,
    notify_request_event,
)
from app.services.request_read_markers import (
    EVENT_ASSIGNMENT,
    EVENT_REASSIGNMENT,
    mark_unread_for_client,
    mark_unread_for_lawyer,
)


def _normalize_uuid_text(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    try:
        return str(UUID(raw))
    except ValueError:
        return raw


def _lawyer_label(db: Session, lawyer_id: str) -> str:
    normalized_id = _normalize_uuid_text(lawyer_id)
    if not normalized_id:
        return "Не назначен"
    try:
        lawyer_uuid = UUID(normalized_id)
    except ValueError:
        return normalized_id
    row = db.get(AdminUser, lawyer_uuid)
    if row is None:
        return normalized_id
    return str(row.name or row.email or normalized_id).strip() or normalized_id


def _service_message_author(actor_role: str, actor_name: str | None) -> str:
    normalized_role = str(actor_role or "").strip().upper()
    explicit = str(actor_name or "").strip()
    if explicit:
        return explicit
    if normalized_role in {"LAWYER", "CURATOR"}:
        return "Юрист"
    if normalized_role == "CLIENT":
        return "Клиент"
    return "Администратор системы"


def _can_write_messages(db: Session) -> bool:
    try:
        bind = db.get_bind()
        if bind is None:
            return False
        return bool(inspect(bind).has_table(Message.__tablename__))
    except (SQLAlchemyError, ValueError, TypeError):
        return False


def apply_assignment_change(
    db: Session,
    *,
    request: Request,
    old_lawyer_id: Any,
    new_lawyer_id: Any,
    actor_role: str,
    actor_admin_user_id: str | None = None,
    responsible: str = "Администратор системы",
    actor_name: str | None = None,
) -> dict[str, str] | None:
    old_id = _normalize_uuid_text(old_lawyer_id)
    new_id = _normalize_uuid_text(new_lawyer_id)
    if not new_id or old_id == new_id:
        return None

    old_label = _lawyer_label(db, old_id) if old_id else "Не назначен"
    new_label = _lawyer_label(db, new_id)

    if old_id:
        notification_event = NOTIFICATION_EVENT_REASSIGNMENT
        marker_event = EVENT_REASSIGNMENT
        notification_body = f"Переназначено: {old_label} -> {new_label}"
        chat_body = (
            f"Переназначено: {old_label} -> {new_label}\n"
            f"Предыдущий юрист: {old_label}\n"
            f"Новый юрист: {new_label}"
        )
    else:
        notification_event = NOTIFICATION_EVENT_ASSIGNMENT
        marker_event = EVENT_ASSIGNMENT
        notification_body = f"Назначен юрист: {new_label}"
        chat_body = f"Назначен юрист: {new_label}\nЮрист: {new_label}"

    safe_responsible = str(responsible or "").strip() or "Администратор системы"
    normalized_actor_role = str(actor_role or "").strip().upper() or "ADMIN"

    mark_unread_for_client(request, marker_event)
    mark_unread_for_lawyer(request, marker_event)
    request.responsible = safe_responsible

    notify_request_event(
        db,
        request=request,
        event_type=notification_event,
        actor_role=normalized_actor_role,
        actor_admin_user_id=actor_admin_user_id,
        body=notification_body,
        responsible=safe_responsible,
    )

    if _can_write_messages(db):
        db.add(
            Message(
                request_id=request.id,
                author_type="SYSTEM",
                author_name=_service_message_author(normalized_actor_role, actor_name),
                body=chat_body,
                immutable=True,
                responsible=safe_responsible,
            )
        )
    db.add(request)
    return {
        "notification_event": notification_event,
        "marker_event": marker_event,
        "notification_body": notification_body,
        "chat_body": chat_body,
    }
