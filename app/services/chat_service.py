from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.message import Message
from app.models.request import Request
from app.services.notifications import EVENT_MESSAGE as NOTIFICATION_EVENT_MESSAGE, notify_request_event
from app.services.request_read_markers import EVENT_MESSAGE, mark_unread_for_client, mark_unread_for_lawyer


def list_messages_for_request(db: Session, request_id: Any) -> list[Message]:
    return (
        db.query(Message)
        .filter(Message.request_id == request_id)
        .order_by(Message.created_at.asc(), Message.id.asc())
        .all()
    )


def serialize_message(row: Message) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "request_id": str(row.request_id),
        "author_type": row.author_type,
        "author_name": row.author_name,
        "body": row.body,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def create_client_message(db: Session, *, request: Request, body: str) -> Message:
    message_body = str(body or "").strip()
    if not message_body:
        raise HTTPException(status_code=400, detail='Поле "body" обязательно')

    row = Message(
        request_id=request.id,
        author_type="CLIENT",
        author_name=request.client_name,
        body=message_body,
        responsible="Клиент",
    )
    mark_unread_for_lawyer(request, EVENT_MESSAGE)
    request.responsible = "Клиент"
    notify_request_event(
        db,
        request=request,
        event_type=NOTIFICATION_EVENT_MESSAGE,
        actor_role="CLIENT",
        body=message_body,
        responsible="Клиент",
    )
    db.add(row)
    db.add(request)
    db.commit()
    db.refresh(row)
    return row


def create_admin_or_lawyer_message(
    db: Session,
    *,
    request: Request,
    body: str,
    actor_role: str,
    actor_name: str,
    actor_admin_user_id: str | None = None,
) -> Message:
    message_body = str(body or "").strip()
    if not message_body:
        raise HTTPException(status_code=400, detail='Поле "body" обязательно')

    normalized_role = str(actor_role or "").strip().upper()
    if normalized_role not in {"ADMIN", "LAWYER"}:
        raise HTTPException(status_code=400, detail="Некорректная роль автора сообщения")
    author_type = "LAWYER" if normalized_role == "LAWYER" else "SYSTEM"
    responsible = str(actor_name or "").strip() or "Администратор системы"

    row = Message(
        request_id=request.id,
        author_type=author_type,
        author_name=str(actor_name or "").strip() or author_type,
        body=message_body,
        responsible=responsible,
    )
    mark_unread_for_client(request, EVENT_MESSAGE)
    request.responsible = responsible
    notify_request_event(
        db,
        request=request,
        event_type=NOTIFICATION_EVENT_MESSAGE,
        actor_role=normalized_role,
        actor_admin_user_id=actor_admin_user_id,
        body=message_body,
        responsible=responsible,
    )
    db.add(row)
    db.add(request)
    db.commit()
    db.refresh(row)
    return row
