from __future__ import annotations

from datetime import timedelta
from uuid import UUID
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_public_session
from app.core.security import create_jwt
from app.db.session import get_db
from app.models.attachment import Attachment
from app.models.message import Message
from app.models.request import Request
from app.models.status_history import StatusHistory
from app.services.notifications import (
    EVENT_MESSAGE as NOTIFICATION_EVENT_MESSAGE,
    get_client_notification,
    list_client_notifications,
    mark_client_notifications_read,
    notify_request_event,
    serialize_notification,
)
from app.services.request_read_markers import EVENT_MESSAGE, clear_unread_for_client, mark_unread_for_lawyer
from app.services.request_templates import validate_required_topic_fields_or_400
from app.schemas.public import (
    PublicAttachmentRead,
    PublicMessageCreate,
    PublicMessageRead,
    PublicRequestCreate,
    PublicRequestCreated,
    PublicStatusHistoryRead,
    PublicTimelineEvent,
)

router = APIRouter()

OTP_CREATE_PURPOSE = "CREATE_REQUEST"
OTP_VIEW_PURPOSE = "VIEW_REQUEST"


def _normalize_phone(raw: str | None) -> str:
    return str(raw or "").strip()


def _normalize_track(raw: str | None) -> str:
    return str(raw or "").strip().upper()


def _set_view_cookie(response: Response, track_number: str) -> None:
    token = create_jwt(
        {"sub": track_number, "purpose": OTP_VIEW_PURPOSE},
        settings.PUBLIC_JWT_SECRET,
        timedelta(days=settings.PUBLIC_JWT_TTL_DAYS),
    )
    response.set_cookie(
        key=settings.PUBLIC_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=settings.PUBLIC_JWT_TTL_DAYS * 24 * 3600,
    )


def _require_create_session_or_403(session: dict, client_phone: str) -> None:
    purpose = str(session.get("purpose") or "").strip().upper()
    sub = _normalize_phone(session.get("sub"))
    if purpose != OTP_CREATE_PURPOSE or not sub or sub != _normalize_phone(client_phone):
        raise HTTPException(status_code=403, detail="Требуется подтверждение телефона через OTP")


def _require_view_session_for_track_or_403(session: dict, track_number: str) -> None:
    purpose = str(session.get("purpose") or "").strip().upper()
    sub = _normalize_track(session.get("sub"))
    if purpose != OTP_VIEW_PURPOSE or not sub or sub != _normalize_track(track_number):
        raise HTTPException(status_code=403, detail="Нет доступа к заявке")


def _request_for_track_or_404(db: Session, session: dict, track_number: str) -> Request:
    normalized_track = _normalize_track(track_number)
    _require_view_session_for_track_or_403(session, normalized_track)
    req = db.query(Request).filter(Request.track_number == normalized_track).first()
    if req is None:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    return req


def _to_iso(value) -> str | None:
    return value.isoformat() if value is not None else None


@router.post("", response_model=PublicRequestCreated, status_code=201)
def create_request(
    payload: PublicRequestCreate,
    response: Response,
    db: Session = Depends(get_db),
    session: dict = Depends(get_public_session),
):
    _require_create_session_or_403(session, payload.client_phone)
    validate_required_topic_fields_or_400(db, payload.topic_code, payload.extra_fields)

    track = f"TRK-{uuid4().hex[:10].upper()}"
    row = Request(
        track_number=track,
        client_name=payload.client_name,
        client_phone=payload.client_phone,
        topic_code=payload.topic_code,
        description=payload.description,
        extra_fields=payload.extra_fields,
        responsible="Клиент",
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    _set_view_cookie(response, track)
    return PublicRequestCreated(request_id=row.id, track_number=row.track_number, otp_required=False)


@router.get("/{track_number}")
def get_request_by_track(
    track_number: str,
    db: Session = Depends(get_db),
    session: dict = Depends(get_public_session),
):
    req = _request_for_track_or_404(db, session, track_number)
    markers_cleared = clear_unread_for_client(req)
    notifications_cleared = mark_client_notifications_read(
        db,
        track_number=req.track_number,
        request_id=req.id,
        responsible="Клиент",
    )
    if markers_cleared or notifications_cleared:
        db.add(req)
        db.commit()
        db.refresh(req)

    return {
        "id": str(req.id),
        "track_number": req.track_number,
        "client_name": req.client_name,
        "client_phone": req.client_phone,
        "topic_code": req.topic_code,
        "status_code": req.status_code,
        "description": req.description,
        "extra_fields": req.extra_fields,
        "assigned_lawyer_id": req.assigned_lawyer_id,
        "client_has_unread_updates": req.client_has_unread_updates,
        "client_unread_event_type": req.client_unread_event_type,
        "lawyer_has_unread_updates": req.lawyer_has_unread_updates,
        "lawyer_unread_event_type": req.lawyer_unread_event_type,
        "created_at": _to_iso(req.created_at),
        "updated_at": _to_iso(req.updated_at),
    }


@router.get("/{track_number}/messages", response_model=list[PublicMessageRead])
def list_messages_by_track(
    track_number: str,
    db: Session = Depends(get_db),
    session: dict = Depends(get_public_session),
):
    req = _request_for_track_or_404(db, session, track_number)
    rows = (
        db.query(Message)
        .filter(Message.request_id == req.id)
        .order_by(Message.created_at.asc(), Message.id.asc())
        .all()
    )
    return [
        PublicMessageRead(
            id=row.id,
            request_id=row.request_id,
            author_type=row.author_type,
            author_name=row.author_name,
            body=row.body,
            created_at=_to_iso(row.created_at),
            updated_at=_to_iso(row.updated_at),
        )
        for row in rows
    ]


@router.post("/{track_number}/messages", response_model=PublicMessageRead, status_code=201)
def create_message_by_track(
    track_number: str,
    payload: PublicMessageCreate,
    db: Session = Depends(get_db),
    session: dict = Depends(get_public_session),
):
    req = _request_for_track_or_404(db, session, track_number)
    body = str(payload.body or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail='Поле "body" обязательно')

    row = Message(
        request_id=req.id,
        author_type="CLIENT",
        author_name=req.client_name,
        body=body,
        responsible="Клиент",
    )
    mark_unread_for_lawyer(req, EVENT_MESSAGE)
    req.responsible = "Клиент"
    notify_request_event(
        db,
        request=req,
        event_type=NOTIFICATION_EVENT_MESSAGE,
        actor_role="CLIENT",
        body=body,
        responsible="Клиент",
    )
    db.add(row)
    db.add(req)
    db.commit()
    db.refresh(row)

    return PublicMessageRead(
        id=row.id,
        request_id=row.request_id,
        author_type=row.author_type,
        author_name=row.author_name,
        body=row.body,
        created_at=_to_iso(row.created_at),
        updated_at=_to_iso(row.updated_at),
    )


@router.get("/{track_number}/attachments", response_model=list[PublicAttachmentRead])
def list_attachments_by_track(
    track_number: str,
    db: Session = Depends(get_db),
    session: dict = Depends(get_public_session),
):
    req = _request_for_track_or_404(db, session, track_number)
    rows = (
        db.query(Attachment)
        .filter(Attachment.request_id == req.id)
        .order_by(Attachment.created_at.desc(), Attachment.id.desc())
        .all()
    )
    return [
        PublicAttachmentRead(
            id=row.id,
            request_id=row.request_id,
            message_id=row.message_id,
            file_name=row.file_name,
            mime_type=row.mime_type,
            size_bytes=row.size_bytes,
            created_at=_to_iso(row.created_at),
            download_url=f"/api/public/uploads/object/{row.id}",
        )
        for row in rows
    ]


@router.get("/{track_number}/history", response_model=list[PublicStatusHistoryRead])
def list_status_history_by_track(
    track_number: str,
    db: Session = Depends(get_db),
    session: dict = Depends(get_public_session),
):
    req = _request_for_track_or_404(db, session, track_number)
    rows = (
        db.query(StatusHistory)
        .filter(StatusHistory.request_id == req.id)
        .order_by(StatusHistory.created_at.asc(), StatusHistory.id.asc())
        .all()
    )
    return [
        PublicStatusHistoryRead(
            id=row.id,
            request_id=row.request_id,
            from_status=row.from_status,
            to_status=row.to_status,
            comment=row.comment,
            created_at=_to_iso(row.created_at),
        )
        for row in rows
    ]


@router.get("/{track_number}/timeline", response_model=list[PublicTimelineEvent])
def list_timeline_by_track(
    track_number: str,
    db: Session = Depends(get_db),
    session: dict = Depends(get_public_session),
):
    req = _request_for_track_or_404(db, session, track_number)
    messages = db.query(Message).filter(Message.request_id == req.id).all()
    attachments = db.query(Attachment).filter(Attachment.request_id == req.id).all()
    statuses = db.query(StatusHistory).filter(StatusHistory.request_id == req.id).all()

    events: list[PublicTimelineEvent] = []
    for row in statuses:
        events.append(
            PublicTimelineEvent(
                type="status_change",
                created_at=_to_iso(row.created_at),
                payload={
                    "id": str(row.id),
                    "from_status": row.from_status,
                    "to_status": row.to_status,
                    "comment": row.comment,
                },
            )
        )
    for row in messages:
        events.append(
            PublicTimelineEvent(
                type="message",
                created_at=_to_iso(row.created_at),
                payload={
                    "id": str(row.id),
                    "author_type": row.author_type,
                    "author_name": row.author_name,
                    "body": row.body,
                },
            )
        )
    for row in attachments:
        events.append(
            PublicTimelineEvent(
                type="attachment",
                created_at=_to_iso(row.created_at),
                payload={
                    "id": str(row.id),
                    "file_name": row.file_name,
                    "mime_type": row.mime_type,
                    "size_bytes": row.size_bytes,
                    "download_url": f"/api/public/uploads/object/{row.id}",
                },
            )
        )

    def _sort_key(event: PublicTimelineEvent):
        return event.created_at or ""

    events.sort(key=_sort_key)
    return events


@router.get("/{track_number}/notifications")
def list_notifications_by_track(
    track_number: str,
    unread_only: bool = False,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    session: dict = Depends(get_public_session),
):
    req = _request_for_track_or_404(db, session, track_number)
    rows, total = list_client_notifications(
        db,
        track_number=req.track_number,
        unread_only=bool(unread_only),
        request_id=req.id,
        limit=limit,
        offset=offset,
    )
    _, unread_total = list_client_notifications(
        db,
        track_number=req.track_number,
        unread_only=True,
        request_id=req.id,
        limit=1,
        offset=0,
    )
    return {
        "rows": [serialize_notification(row) for row in rows],
        "total": int(total),
        "unread_total": int(unread_total),
    }


@router.post("/{track_number}/notifications/{notification_id}/read")
def read_notification_by_track(
    track_number: str,
    notification_id: str,
    db: Session = Depends(get_db),
    session: dict = Depends(get_public_session),
):
    req = _request_for_track_or_404(db, session, track_number)
    try:
        notification_uuid = UUID(str(notification_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Некорректный notification_id")
    row = get_client_notification(db, track_number=req.track_number, notification_id=notification_uuid)
    if row is None or str(row.request_id) != str(req.id):
        raise HTTPException(status_code=404, detail="Уведомление не найдено")
    changed = mark_client_notifications_read(
        db,
        track_number=req.track_number,
        request_id=req.id,
        notification_id=notification_uuid,
        responsible="Клиент",
    )
    db.commit()
    refreshed = get_client_notification(db, track_number=req.track_number, notification_id=notification_uuid)
    return {"status": "ok", "changed": int(changed), "notification": serialize_notification(refreshed) if refreshed else None}


@router.post("/{track_number}/notifications/read-all")
def read_all_notifications_by_track(
    track_number: str,
    db: Session = Depends(get_db),
    session: dict = Depends(get_public_session),
):
    req = _request_for_track_or_404(db, session, track_number)
    changed = mark_client_notifications_read(
        db,
        track_number=req.track_number,
        request_id=req.id,
        responsible="Клиент",
    )
    db.commit()
    return {"status": "ok", "changed": int(changed)}
