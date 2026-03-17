from __future__ import annotations

import logging
from time import perf_counter
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from app.models.attachment import Attachment
from app.models.message import Message
from app.models.request import Request
from app.models.request_data_requirement import RequestDataRequirement
from app.services.chat_crypto import decrypt_message_body_for_request
from app.services.notifications import EVENT_MESSAGE as NOTIFICATION_EVENT_MESSAGE, notify_request_event
from app.services.request_read_markers import EVENT_MESSAGE, mark_unread_for_client, mark_unread_for_lawyer

MAX_CHAT_MESSAGE_LEN = 12_000
DEFAULT_CHAT_WINDOW_LIMIT = 50
MAX_CHAT_WINDOW_LIMIT = 200
MAX_CHAT_BODY_BATCH = 200
CHAT_PARTICIPANT_ADMIN_IDS_KEY = "chat_participant_admin_ids"
_CHAT_WORKSPACE_LOG = logging.getLogger("uvicorn.error")


def _normalize_message_body(body: str | None) -> str:
    message_body = str(body or "").strip()
    if not message_body:
        raise HTTPException(status_code=400, detail='Поле "body" обязательно')
    if len(message_body) > MAX_CHAT_MESSAGE_LEN:
        raise HTTPException(status_code=400, detail=f'Поле "body" не должно превышать {MAX_CHAT_MESSAGE_LEN} символов')
    return message_body.replace("\x00", "")


def list_messages_for_request(db: Session, request_id: Any) -> list[Message]:
    return (
        db.query(Message)
        .filter(Message.request_id == request_id)
        .order_by(Message.created_at.asc(), Message.id.asc())
        .all()
    )


def clamp_chat_window_limit(limit: int | None) -> int:
    if limit is None:
        return DEFAULT_CHAT_WINDOW_LIMIT
    try:
        normalized = int(limit)
    except (TypeError, ValueError):
        normalized = DEFAULT_CHAT_WINDOW_LIMIT
    return max(1, min(normalized, MAX_CHAT_WINDOW_LIMIT))


def clamp_chat_body_batch_limit(limit: int | None) -> int:
    if limit is None:
        return MAX_CHAT_BODY_BATCH
    try:
        normalized = int(limit)
    except (TypeError, ValueError):
        normalized = MAX_CHAT_BODY_BATCH
    return max(1, min(normalized, MAX_CHAT_BODY_BATCH))


def _parse_window_message_uuid(raw: str | None) -> uuid.UUID | None:
    value = str(raw or "").strip()
    if not value:
        return None
    try:
        return uuid.UUID(value)
    except (TypeError, ValueError):
        return None


def _parse_window_datetime(raw: str | None) -> datetime | None:
    value = str(raw or "").strip()
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def list_messages_for_request_window(
    db: Session,
    request_id: Any,
    *,
    limit: int | None,
    before_id: str | None = None,
    before_created_at: str | None = None,
    before_count: int = 0,
) -> tuple[list[Message], bool]:
    window_limit = clamp_chat_window_limit(limit)
    base_query = db.query(Message).filter(Message.request_id == request_id)
    before_uuid = _parse_window_message_uuid(before_id)
    before_dt = _parse_window_datetime(before_created_at)

    if before_uuid is not None and before_dt is not None:
        base_query = base_query.filter(
            or_(
                Message.created_at < before_dt,
                and_(Message.created_at == before_dt, Message.id < before_uuid),
            )
        )
        rows_desc = (
            base_query
            .order_by(Message.created_at.desc(), Message.id.desc())
            .limit(window_limit + 1)
            .all()
        )
        has_more = len(rows_desc) > window_limit
        rows = list(reversed(rows_desc[:window_limit]))
        return rows, has_more

    loaded_count = max(0, int(before_count or 0))
    total = int(base_query.count() or 0)
    if total <= 0 or loaded_count >= total:
        return [], False

    remaining = total - loaded_count
    window_size = min(window_limit, remaining)
    offset = max(total - loaded_count - window_size, 0)
    rows = (
        base_query
        .order_by(Message.created_at.asc(), Message.id.asc())
        .offset(offset)
        .limit(window_size)
        .all()
    )
    has_more = offset > 0
    return rows, has_more


def _iso_or_none(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc).isoformat()
    return value.astimezone(timezone.utc).isoformat()


def _mark_counterparty_delivery(
    db: Session,
    *,
    request_id: Any,
    recipient: str,
    mark_read: bool,
    commit: bool = True,
) -> bool:
    side = str(recipient or "").strip().upper()
    if side not in {"CLIENT", "STAFF"}:
        return False

    now = datetime.now(timezone.utc)
    changed = False
    if side == "CLIENT":
        sender_filter = Message.author_type != "CLIENT"
        delivered_column = Message.delivered_to_client_at
        read_column = Message.read_by_client_at
    else:
        sender_filter = Message.author_type == "CLIENT"
        delivered_column = Message.delivered_to_staff_at
        read_column = Message.read_by_staff_at

    delivered_count = (
        db.query(Message)
        .filter(Message.request_id == request_id, sender_filter, delivered_column.is_(None))
        .update(
            {
                delivered_column: now,
                Message.updated_at: now,
            },
            synchronize_session=False,
        )
    )
    if delivered_count:
        changed = True

    if mark_read:
        read_count = (
            db.query(Message)
            .filter(Message.request_id == request_id, sender_filter, read_column.is_(None))
            .update(
                {
                    read_column: now,
                    delivered_column: func.coalesce(delivered_column, now),
                    Message.updated_at: now,
                },
                synchronize_session=False,
            )
        )
        if read_count:
            changed = True

    if changed and commit:
        db.commit()
    return changed


def mark_messages_delivered_for_client(db: Session, *, request_id: Any) -> bool:
    return _mark_counterparty_delivery(db, request_id=request_id, recipient="CLIENT", mark_read=False)


def mark_messages_read_for_client(db: Session, *, request_id: Any) -> bool:
    return _mark_counterparty_delivery(db, request_id=request_id, recipient="CLIENT", mark_read=True)


def mark_messages_delivered_for_staff(db: Session, *, request_id: Any) -> bool:
    return _mark_counterparty_delivery(db, request_id=request_id, recipient="STAFF", mark_read=False)


def mark_messages_read_for_staff(db: Session, *, request_id: Any, commit: bool = True) -> bool:
    return _mark_counterparty_delivery(db, request_id=request_id, recipient="STAFF", mark_read=True, commit=commit)


def serialize_message(row: Message, *, body: str | None = None, body_loaded: bool = True) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "request_id": str(row.request_id),
        "author_type": row.author_type,
        "author_name": row.author_name,
        "body": body,
        "body_loaded": bool(body_loaded),
        "message_kind": "TEXT",
        "request_data_items": [],
        "request_data_all_filled": False,
        "created_at": _iso_or_none(row.created_at),
        "updated_at": _iso_or_none(row.updated_at),
        "delivered_to_client_at": _iso_or_none(row.delivered_to_client_at),
        "delivered_to_staff_at": _iso_or_none(row.delivered_to_staff_at),
        "read_by_client_at": _iso_or_none(row.read_by_client_at),
        "read_by_staff_at": _iso_or_none(row.read_by_staff_at),
    }


def _truncate_request_data_label(label: str, limit: int = 18) -> str:
    text = str(label or "").strip()
    if len(text) <= limit:
        return text
    return text[: max(3, limit - 3)].rstrip() + "..."


def _message_uuid_list(rows: list[Message]) -> list[uuid.UUID]:
    out: list[uuid.UUID] = []
    for row in rows:
        message_id = getattr(row, "id", None)
        if isinstance(message_id, uuid.UUID):
            out.append(message_id)
    return out


def _request_data_message_ids(db: Session, request_id: Any, message_ids: list[uuid.UUID]) -> set[str]:
    if not message_ids:
        return set()
    rows = (
        db.query(RequestDataRequirement.request_message_id)
        .filter(
            RequestDataRequirement.request_id == request_id,
            RequestDataRequirement.request_message_id.in_(message_ids),
        )
        .distinct()
        .all()
    )
    return {str(item[0]) for item in rows if item and item[0] is not None}


def _normalize_admin_uuid(value: str | None) -> str | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        return str(uuid.UUID(raw))
    except (TypeError, ValueError):
        return None


def _register_chat_participant(request: Request, admin_user_id: str | None) -> None:
    normalized = _normalize_admin_uuid(admin_user_id)
    if not normalized:
        return
    current = request.extra_fields if isinstance(request.extra_fields, dict) else {}
    extra = dict(current or {})
    raw_ids = extra.get(CHAT_PARTICIPANT_ADMIN_IDS_KEY)
    known_ids: set[str] = set()
    if isinstance(raw_ids, list):
        for value in raw_ids:
            item = _normalize_admin_uuid(value)
            if item:
                known_ids.add(item)
    elif isinstance(raw_ids, str):
        item = _normalize_admin_uuid(raw_ids)
        if item:
            known_ids.add(item)
    known_ids.add(normalized)
    extra[CHAT_PARTICIPANT_ADMIN_IDS_KEY] = sorted(known_ids)
    request.extra_fields = extra


def serialize_messages_for_request(
    db: Session,
    request_id: Any,
    rows: list[Message],
    *,
    request_extra_fields: dict[str, Any] | None = None,
    include_bodies: bool = True,
) -> list[dict[str, Any]]:
    started_at = perf_counter()
    message_ids = _message_uuid_list(rows)
    requirements_started_at = perf_counter()
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
    requirements_ms = (perf_counter() - requirements_started_at) * 1000.0
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
        attachment_lookup_started_at = perf_counter()
        attachment_rows = db.query(Attachment).filter(Attachment.id.in_(file_attachment_ids)).all()
        attachment_map = {str(row.id): row for row in attachment_rows}
        attachment_lookup_ms = (perf_counter() - attachment_lookup_started_at) * 1000.0
    else:
        attachment_lookup_ms = 0.0

    out: list[dict[str, Any]] = []
    for row in rows:
        linked = by_message_id.get(str(row.id), [])
        is_request_data = bool(linked)
        if is_request_data:
            body_value = "Запрос"
            body_loaded = True
        elif include_bodies:
            body_value = decrypt_message_body_for_request(row.body, request_extra_fields=request_extra_fields)
            body_loaded = True
        else:
            body_value = None
            body_loaded = False

        payload = serialize_message(row, body=body_value, body_loaded=body_loaded)
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
    total_ms = (perf_counter() - started_at) * 1000.0
    _CHAT_WORKSPACE_LOG.info(
        "serialize_messages request_id=%s total_ms=%.2f requirements_ms=%.2f attachment_lookup_ms=%.2f rows=%s requirements=%s file_requirements=%s",
        str(request_id),
        total_ms,
        requirements_ms,
        attachment_lookup_ms,
        len(rows),
        len(requirements),
        len(file_attachment_ids),
    )
    return out


def serialize_message_bodies_for_request(
    db: Session,
    request_id: Any,
    rows: list[Message],
    *,
    request_extra_fields: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    request_data_ids = _request_data_message_ids(db, request_id, _message_uuid_list(rows))
    payload: list[dict[str, Any]] = []
    for row in rows:
        row_id = str(row.id)
        if row_id in request_data_ids:
            payload.append({"id": row_id, "body": "Запрос", "body_loaded": True})
            continue
        payload.append(
            {
                "id": row_id,
                "body": decrypt_message_body_for_request(row.body, request_extra_fields=request_extra_fields),
                "body_loaded": True,
            }
        )
    return payload


def serialize_message_for_request(
    row: Message,
    *,
    request_extra_fields: dict[str, Any] | None,
) -> dict[str, Any]:
    return serialize_message(
        row,
        body=decrypt_message_body_for_request(row.body, request_extra_fields=request_extra_fields),
        body_loaded=True,
    )


def create_client_message(
    db: Session,
    *,
    request: Request,
    body: str,
    event_type: str = EVENT_MESSAGE,
) -> Message:
    message_body = _normalize_message_body(body)

    row = Message(
        request_id=request.id,
        author_type="CLIENT",
        author_name=request.client_name,
        body=message_body,
        responsible="Клиент",
    )
    normalized_event = str(event_type or EVENT_MESSAGE).strip().upper() or EVENT_MESSAGE
    mark_unread_for_lawyer(request, normalized_event)
    request.responsible = "Клиент"
    notify_request_event(
        db,
        request=request,
        event_type=normalized_event or NOTIFICATION_EVENT_MESSAGE,
        actor_role="CLIENT",
        body=None,
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
    event_type: str = EVENT_MESSAGE,
) -> Message:
    message_body = _normalize_message_body(body)

    normalized_role = str(actor_role or "").strip().upper()
    if normalized_role not in {"ADMIN", "LAWYER", "CURATOR"}:
        raise HTTPException(status_code=400, detail="Некорректная роль автора сообщения")
    author_type = "LAWYER" if normalized_role in {"LAWYER", "CURATOR"} else "SYSTEM"
    responsible = str(actor_name or "").strip() or "Администратор системы"

    row = Message(
        request_id=request.id,
        author_type=author_type,
        author_name=str(actor_name or "").strip() or author_type,
        body=message_body,
        responsible=responsible,
    )
    _register_chat_participant(request, actor_admin_user_id)
    normalized_event = str(event_type or EVENT_MESSAGE).strip().upper() or EVENT_MESSAGE
    mark_unread_for_client(request, normalized_event)
    request.responsible = responsible
    notify_request_event(
        db,
        request=request,
        event_type=normalized_event or NOTIFICATION_EVENT_MESSAGE,
        actor_role=normalized_role,
        actor_admin_user_id=actor_admin_user_id,
        body=None,
        responsible=responsible,
    )
    db.add(row)
    db.add(request)
    db.commit()
    db.refresh(row)
    return row


def get_chat_activity_summary(db: Session, request_id: Any) -> dict[str, Any]:
    message_count, latest_message_at = (
        db.query(
            func.count(Message.id),
            func.max(func.coalesce(Message.updated_at, Message.created_at)),
        )
        .filter(Message.request_id == request_id)
        .one()
    )
    attachment_count, latest_attachment_at = (
        db.query(
            func.count(Attachment.id),
            func.max(func.coalesce(Attachment.updated_at, Attachment.created_at)),
        )
        .filter(Attachment.request_id == request_id)
        .one()
    )
    latest_candidates = [value for value in (latest_message_at, latest_attachment_at) if value is not None]
    latest_activity_at = max(latest_candidates) if latest_candidates else None
    return {
        "message_count": int(message_count or 0),
        "attachment_count": int(attachment_count or 0),
        "latest_message_at": latest_message_at,
        "latest_attachment_at": latest_attachment_at,
        "latest_activity_at": latest_activity_at,
    }
