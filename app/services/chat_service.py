from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.message import Message
from app.models.attachment import Attachment
from app.models.request import Request
from app.models.request_data_requirement import RequestDataRequirement
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


def _truncate_request_data_label(label: str, limit: int = 18) -> str:
    text = str(label or "").strip()
    if len(text) <= limit:
        return text
    return text[: max(3, limit - 3)].rstrip() + "..."


def serialize_messages_for_request(db: Session, request_id: Any, rows: list[Message]) -> list[dict[str, Any]]:
    message_ids = []
    for row in rows:
        try:
            message_ids.append(row.id)
        except Exception:
            continue
    requirements = (
        db.query(RequestDataRequirement)
        .filter(
            RequestDataRequirement.request_id == request_id,
            RequestDataRequirement.request_message_id.in_(message_ids) if message_ids else False,
        )
        .order_by(
            RequestDataRequirement.request_message_id.asc(),
            RequestDataRequirement.sort_order.asc(),
            RequestDataRequirement.created_at.asc(),
            RequestDataRequirement.id.asc(),
        )
        .all()
        if message_ids
        else []
    )
    by_message_id: dict[str, list[RequestDataRequirement]] = {}
    for item in requirements:
        mid = str(item.request_message_id or "").strip()
        if not mid:
            continue
        by_message_id.setdefault(mid, []).append(item)
    file_attachment_ids = []
    for item in requirements:
        if str(item.field_type or "").lower() != "file":
            continue
        raw = str(item.value_text or "").strip()
        if not raw:
            continue
        try:
            file_attachment_ids.append(raw)
        except Exception:
            continue
    attachment_map: dict[str, Attachment] = {}
    if file_attachment_ids:
        attachment_rows = db.query(Attachment).filter(Attachment.id.in_(file_attachment_ids)).all()
        attachment_map = {str(row.id): row for row in attachment_rows}

    out: list[dict[str, Any]] = []
    for row in rows:
        payload = serialize_message(row)
        linked = by_message_id.get(str(row.id), [])
        if linked:
            linked_sorted = sorted(
                linked,
                key=lambda req: (
                    1 if str(req.value_text or "").strip() else 0,
                    int(req.sort_order or 0),
                    req.created_at.timestamp() if getattr(req, "created_at", None) else 0,
                    str(req.id),
                ),
            )
            items = []
            all_filled = True
            for idx, req in enumerate(linked_sorted, start=1):
                value_text = str(req.value_text or "").strip()
                is_filled = bool(value_text)
                if not is_filled:
                    all_filled = False
                items.append(
                    {
                        "id": str(req.id),
                        "index": idx,
                        "key": req.key,
                        "label": req.label,
                        "label_short": _truncate_request_data_label(str(req.label or "")),
                        "field_type": str(req.field_type or "text"),
                        "document_name": req.document_name,
                        "value_text": req.value_text,
                        "value_file": (
                            {
                                "attachment_id": str(attachment_map[value_text].id),
                                "file_name": attachment_map[value_text].file_name,
                                "mime_type": attachment_map[value_text].mime_type,
                                "size_bytes": int(attachment_map[value_text].size_bytes or 0),
                                "download_url": None,
                            }
                            if str(req.field_type or "").lower() == "file" and value_text in attachment_map
                            else None
                        ),
                        "is_filled": is_filled,
                    }
                )
            payload["message_kind"] = "REQUEST_DATA"
            payload["request_data_items"] = items
            payload["request_data_all_filled"] = all_filled and bool(items)
            payload["body"] = "Запрос"
        else:
            payload["message_kind"] = "TEXT"
        out.append(payload)
    return out


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
