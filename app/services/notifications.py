from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import and_
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models.admin_user import AdminUser
from app.models.notification import Notification
from app.models.request import Request
from app.services.telegram_notify import send_telegram_message

RECIPIENT_CLIENT = "CLIENT"
RECIPIENT_ADMIN_USER = "ADMIN_USER"

EVENT_MESSAGE = "MESSAGE"
EVENT_ATTACHMENT = "ATTACHMENT"
EVENT_STATUS = "STATUS"
EVENT_SLA_OVERDUE = "SLA_OVERDUE"

_EVENT_LABELS = {
    EVENT_MESSAGE: "Новое сообщение",
    EVENT_ATTACHMENT: "Новый файл",
    EVENT_STATUS: "Изменен статус",
    EVENT_SLA_OVERDUE: "SLA просрочен",
}


def _as_utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_uuid_or_none(value: Any) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError):
        return None


def _normalize_track(value: Any) -> str | None:
    track = str(value or "").strip().upper()
    return track or None


def _normalized_event(event_type: str) -> str:
    return str(event_type or "").strip().upper()


def _title_for_event(event_type: str, request: Request) -> str:
    prefix = _EVENT_LABELS.get(event_type, "Обновление")
    track = str(request.track_number or "").strip() or str(request.id)
    return f"{prefix} по заявке {track}"


def _telegram_text_for_event(event_type: str, request: Request, body: str | None = None) -> str:
    label = _EVENT_LABELS.get(event_type, "Обновление")
    track = str(request.track_number or "").strip() or str(request.id)
    topic = str(request.topic_code or "").strip() or "-"
    status = str(request.status_code or "").strip() or "-"
    tail = f"\n{body.strip()}" if str(body or "").strip() else ""
    return f"#{track}\n{label}\nТема: {topic}\nСтатус: {status}{tail}"


def _active_admin_ids(db: Session, *, exclude_admin_user_id: uuid.UUID | None = None) -> list[uuid.UUID]:
    try:
        rows = (
            db.query(AdminUser.id)
            .filter(
                AdminUser.role == "ADMIN",
                AdminUser.is_active.is_(True),
            )
            .all()
        )
    except SQLAlchemyError:
        # Some isolated tests bootstrap only a subset of tables.
        return []
    out: list[uuid.UUID] = []
    for (admin_id,) in rows:
        if not admin_id:
            continue
        if exclude_admin_user_id is not None and admin_id == exclude_admin_user_id:
            continue
        out.append(admin_id)
    return out


def _create_notification(
    db: Session,
    *,
    request: Request,
    recipient_type: str,
    recipient_admin_user_id: uuid.UUID | None = None,
    recipient_track_number: str | None = None,
    event_type: str,
    title: str,
    body: str | None = None,
    payload: dict[str, Any] | None = None,
    responsible: str = "Система уведомлений",
    dedupe_key: str | None = None,
) -> Notification | None:
    recipient_kind = str(recipient_type or "").strip().upper()
    if recipient_kind not in {RECIPIENT_CLIENT, RECIPIENT_ADMIN_USER}:
        return None
    if recipient_kind == RECIPIENT_CLIENT and not _normalize_track(recipient_track_number):
        return None
    if recipient_kind == RECIPIENT_ADMIN_USER and recipient_admin_user_id is None:
        return None

    normalized_dedupe = str(dedupe_key or "").strip() or None
    if normalized_dedupe:
        exists = db.query(Notification.id).filter(Notification.dedupe_key == normalized_dedupe).first()
        if exists is not None:
            return None

    row = Notification(
        request_id=request.id,
        recipient_type=recipient_kind,
        recipient_admin_user_id=recipient_admin_user_id if recipient_kind == RECIPIENT_ADMIN_USER else None,
        recipient_track_number=_normalize_track(recipient_track_number) if recipient_kind == RECIPIENT_CLIENT else None,
        event_type=_normalized_event(event_type),
        title=str(title or "").strip() or _title_for_event(event_type, request),
        body=str(body or "").strip() or None,
        payload=dict(payload or {}),
        is_read=False,
        read_at=None,
        responsible=str(responsible or "").strip() or "Система уведомлений",
        dedupe_key=normalized_dedupe,
    )
    db.add(row)
    return row


def notify_request_event(
    db: Session,
    *,
    request: Request,
    event_type: str,
    actor_role: str,
    actor_admin_user_id: str | uuid.UUID | None = None,
    body: str | None = None,
    responsible: str = "Система уведомлений",
    send_telegram: bool = True,
    dedupe_prefix: str | None = None,
) -> dict[str, int]:
    event = _normalized_event(event_type)
    actor = str(actor_role or "").strip().upper() or "SYSTEM"
    actor_uuid = _as_uuid_or_none(actor_admin_user_id)
    title = _title_for_event(event, request)
    payload = {
        "request_id": str(request.id),
        "track_number": request.track_number,
        "topic_code": request.topic_code,
        "status_code": request.status_code,
        "event_type": event,
        "actor_role": actor,
    }

    internal_created = 0
    telegram_sent = 0

    def _dedupe_key_for(recipient_marker: str) -> str | None:
        prefix = str(dedupe_prefix or "").strip()
        if not prefix:
            return None
        return f"{prefix}:{recipient_marker}"

    def _notify_client() -> None:
        nonlocal internal_created
        track = _normalize_track(request.track_number)
        if not track:
            return
        dedupe_key = _dedupe_key_for(f"client:{track}")
        row = _create_notification(
            db,
            request=request,
            recipient_type=RECIPIENT_CLIENT,
            recipient_track_number=track,
            event_type=event,
            title=title,
            body=body,
            payload=payload,
            responsible=responsible,
            dedupe_key=dedupe_key,
        )
        if row is not None:
            internal_created += 1

    def _notify_lawyer_if_any() -> None:
        nonlocal internal_created
        lawyer_uuid = _as_uuid_or_none(request.assigned_lawyer_id)
        if lawyer_uuid is None:
            return
        if actor_uuid is not None and lawyer_uuid == actor_uuid:
            return
        dedupe_key = _dedupe_key_for(f"lawyer:{lawyer_uuid}")
        row = _create_notification(
            db,
            request=request,
            recipient_type=RECIPIENT_ADMIN_USER,
            recipient_admin_user_id=lawyer_uuid,
            event_type=event,
            title=title,
            body=body,
            payload=payload,
            responsible=responsible,
            dedupe_key=dedupe_key,
        )
        if row is not None:
            internal_created += 1

    def _notify_admins() -> None:
        nonlocal internal_created
        admin_ids = _active_admin_ids(db, exclude_admin_user_id=actor_uuid)
        for admin_id in admin_ids:
            dedupe_key = _dedupe_key_for(f"admin:{admin_id}")
            row = _create_notification(
                db,
                request=request,
                recipient_type=RECIPIENT_ADMIN_USER,
                recipient_admin_user_id=admin_id,
                event_type=event,
                title=title,
                body=body,
                payload=payload,
                responsible=responsible,
                dedupe_key=dedupe_key,
            )
            if row is not None:
                internal_created += 1

    if event in {EVENT_MESSAGE, EVENT_ATTACHMENT}:
        if actor == "CLIENT":
            _notify_lawyer_if_any()
            _notify_admins()
        else:
            _notify_client()
    elif event == EVENT_STATUS:
        _notify_client()
        if actor == "ADMIN":
            _notify_lawyer_if_any()
    elif event == EVENT_SLA_OVERDUE:
        _notify_lawyer_if_any()
        _notify_admins()
    else:
        _notify_client()
        _notify_lawyer_if_any()

    if send_telegram and internal_created > 0:
        result = send_telegram_message(_telegram_text_for_event(event, request, body))
        if bool(result.get("sent")):
            telegram_sent += 1

    return {"internal_created": int(internal_created), "telegram_sent": int(telegram_sent)}


def serialize_notification(row: Notification) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "request_id": str(row.request_id) if row.request_id else None,
        "recipient_type": row.recipient_type,
        "recipient_admin_user_id": str(row.recipient_admin_user_id) if row.recipient_admin_user_id else None,
        "recipient_track_number": row.recipient_track_number,
        "event_type": row.event_type,
        "title": row.title,
        "body": row.body,
        "payload": row.payload or {},
        "is_read": bool(row.is_read),
        "read_at": row.read_at.isoformat() if row.read_at else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def mark_admin_notifications_read(
    db: Session,
    *,
    admin_user_id: str | uuid.UUID,
    request_id: uuid.UUID | None = None,
    notification_id: uuid.UUID | None = None,
    responsible: str = "Система уведомлений",
) -> int:
    admin_uuid = _as_uuid_or_none(admin_user_id)
    if admin_uuid is None:
        return 0
    query = db.query(Notification).filter(
        Notification.recipient_type == RECIPIENT_ADMIN_USER,
        Notification.recipient_admin_user_id == admin_uuid,
        Notification.is_read.is_(False),
    )
    if request_id is not None:
        query = query.filter(Notification.request_id == request_id)
    if notification_id is not None:
        query = query.filter(Notification.id == notification_id)
    rows = query.all()
    now = _as_utc_now()
    for row in rows:
        row.is_read = True
        row.read_at = now
        row.responsible = responsible
        db.add(row)
    return len(rows)


def mark_client_notifications_read(
    db: Session,
    *,
    track_number: str,
    request_id: uuid.UUID | None = None,
    notification_id: uuid.UUID | None = None,
    responsible: str = "Клиент",
) -> int:
    track = _normalize_track(track_number)
    if not track:
        return 0
    query = db.query(Notification).filter(
        Notification.recipient_type == RECIPIENT_CLIENT,
        Notification.recipient_track_number == track,
        Notification.is_read.is_(False),
    )
    if request_id is not None:
        query = query.filter(Notification.request_id == request_id)
    if notification_id is not None:
        query = query.filter(Notification.id == notification_id)
    rows = query.all()
    now = _as_utc_now()
    for row in rows:
        row.is_read = True
        row.read_at = now
        row.responsible = responsible
        db.add(row)
    return len(rows)


def list_admin_notifications(
    db: Session,
    *,
    admin_user_id: str | uuid.UUID,
    unread_only: bool = False,
    request_id: uuid.UUID | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[Notification], int]:
    admin_uuid = _as_uuid_or_none(admin_user_id)
    if admin_uuid is None:
        return [], 0
    query = db.query(Notification).filter(
        Notification.recipient_type == RECIPIENT_ADMIN_USER,
        Notification.recipient_admin_user_id == admin_uuid,
    )
    if unread_only:
        query = query.filter(Notification.is_read.is_(False))
    if request_id is not None:
        query = query.filter(Notification.request_id == request_id)
    total = query.count()
    rows = (
        query.order_by(Notification.created_at.desc(), Notification.id.desc())
        .offset(int(max(offset, 0)))
        .limit(int(min(max(limit, 1), 200)))
        .all()
    )
    return rows, int(total)


def list_client_notifications(
    db: Session,
    *,
    track_number: str,
    unread_only: bool = False,
    request_id: uuid.UUID | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[Notification], int]:
    track = _normalize_track(track_number)
    if not track:
        return [], 0
    query = db.query(Notification).filter(
        Notification.recipient_type == RECIPIENT_CLIENT,
        Notification.recipient_track_number == track,
    )
    if unread_only:
        query = query.filter(Notification.is_read.is_(False))
    if request_id is not None:
        query = query.filter(Notification.request_id == request_id)
    total = query.count()
    rows = (
        query.order_by(Notification.created_at.desc(), Notification.id.desc())
        .offset(int(max(offset, 0)))
        .limit(int(min(max(limit, 1), 200)))
        .all()
    )
    return rows, int(total)


def get_admin_notification(
    db: Session,
    *,
    admin_user_id: str | uuid.UUID,
    notification_id: uuid.UUID,
) -> Notification | None:
    admin_uuid = _as_uuid_or_none(admin_user_id)
    if admin_uuid is None:
        return None
    return (
        db.query(Notification)
        .filter(
            Notification.id == notification_id,
            Notification.recipient_type == RECIPIENT_ADMIN_USER,
            Notification.recipient_admin_user_id == admin_uuid,
        )
        .first()
    )


def get_client_notification(
    db: Session,
    *,
    track_number: str,
    notification_id: uuid.UUID,
) -> Notification | None:
    track = _normalize_track(track_number)
    if not track:
        return None
    return (
        db.query(Notification)
        .filter(
            and_(
                Notification.id == notification_id,
                Notification.recipient_type == RECIPIENT_CLIENT,
                Notification.recipient_track_number == track,
            )
        )
        .first()
    )
