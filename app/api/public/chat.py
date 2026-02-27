from __future__ import annotations
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_public_session
from app.db.session import get_db
from app.models.attachment import Attachment
from app.models.message import Message
from app.models.request import Request
from app.models.request_data_requirement import RequestDataRequirement
from app.schemas.public import PublicMessageCreate
from app.services.chat_presence import list_typing_presence, set_typing_presence
from app.services.chat_service import (
    create_client_message,
    get_chat_activity_summary,
    list_messages_for_request,
    serialize_message,
    serialize_messages_for_request,
)
from app.services.request_read_markers import EVENT_MESSAGE, mark_unread_for_lawyer

router = APIRouter()


def _parse_cursor(raw: str | None) -> datetime | None:
    value = str(raw or "").strip()
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _iso_or_none(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.isoformat()


def _as_utc_datetime(value) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
    if isinstance(value, str):
        return _parse_cursor(value)
    return None


def _attachment_meta_for_public(req: Request, value_text: str | None, db: Session) -> dict | None:
    raw = str(value_text or "").strip()
    if not raw:
        return None
    try:
        attachment_uuid = UUID(raw)
    except ValueError:
        return None
    attachment = db.get(Attachment, attachment_uuid)
    if attachment is None or attachment.request_id != req.id:
        return None
    return {
        "attachment_id": str(attachment.id),
        "file_name": attachment.file_name,
        "mime_type": attachment.mime_type,
        "size_bytes": int(attachment.size_bytes or 0),
        "download_url": f"/api/public/uploads/object/{attachment.id}",
    }


def _normalize_phone(raw: str | None) -> str:
    value = str(raw or "").strip()
    if not value:
        return ""
    allowed = {"+", "(", ")", "-", " "}
    return "".join(ch for ch in value if ch.isdigit() or ch in allowed).strip()


def _normalize_track(raw: str | None) -> str:
    return str(raw or "").strip().upper()


def _require_view_session_or_403(session: dict) -> str:
    purpose = str(session.get("purpose") or "").strip().upper()
    subject = str(session.get("sub") or "").strip()
    if purpose != "VIEW_REQUEST" or not subject:
        raise HTTPException(status_code=403, detail="Нет доступа к заявке")
    return subject


def _request_for_track_or_404(db: Session, track_number: str) -> Request:
    req = db.query(Request).filter(Request.track_number == _normalize_track(track_number)).first()
    if req is None:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    return req


def _ensure_view_access_or_403(session: dict, req: Request) -> None:
    subject = _require_view_session_or_403(session)
    subject_track = _normalize_track(subject)
    if subject_track.startswith("TRK-") and subject_track != _normalize_track(req.track_number):
        raise HTTPException(status_code=403, detail="Нет доступа к заявке")
    if subject_track == _normalize_track(req.track_number):
        return
    if _normalize_phone(subject) and _normalize_phone(subject) == _normalize_phone(req.client_phone):
        return
    raise HTTPException(status_code=403, detail="Нет доступа к заявке")


@router.get("/requests/{track_number}/messages")
def list_messages_by_track(
    track_number: str,
    db: Session = Depends(get_db),
    session: dict = Depends(get_public_session),
):
    req = _request_for_track_or_404(db, track_number)
    _ensure_view_access_or_403(session, req)
    rows = list_messages_for_request(db, req.id)
    return serialize_messages_for_request(db, req.id, rows)


@router.post("/requests/{track_number}/messages", status_code=201)
def create_message_by_track(
    track_number: str,
    payload: PublicMessageCreate,
    db: Session = Depends(get_db),
    session: dict = Depends(get_public_session),
):
    req = _request_for_track_or_404(db, track_number)
    _ensure_view_access_or_403(session, req)
    row = create_client_message(db, request=req, body=payload.body)
    return serialize_message(row)


@router.get("/requests/{track_number}/live")
def get_live_chat_state_by_track(
    track_number: str,
    cursor: str | None = None,
    db: Session = Depends(get_db),
    session: dict = Depends(get_public_session),
):
    req = _request_for_track_or_404(db, track_number)
    _ensure_view_access_or_403(session, req)
    summary = get_chat_activity_summary(db, req.id)
    latest_activity_at = _as_utc_datetime(summary.get("latest_activity_at"))
    latest_activity_iso = _iso_or_none(latest_activity_at)
    cursor_dt = _parse_cursor(cursor)
    has_updates = bool(latest_activity_at and (cursor_dt is None or latest_activity_at > cursor_dt))

    subject = _require_view_session_or_403(session)
    actor_key = f"CLIENT:{_normalize_track(subject) or _normalize_phone(subject)}"
    typing_rows = list_typing_presence(request_key=str(req.id), exclude_actor_key=actor_key)
    return {
        "track_number": req.track_number,
        "cursor": latest_activity_iso,
        "has_updates": has_updates,
        "message_count": int(summary.get("message_count") or 0),
        "attachment_count": int(summary.get("attachment_count") or 0),
        "latest_message_at": _iso_or_none(_as_utc_datetime(summary.get("latest_message_at"))),
        "latest_attachment_at": _iso_or_none(_as_utc_datetime(summary.get("latest_attachment_at"))),
        "typing": typing_rows,
    }


@router.post("/requests/{track_number}/typing")
def set_live_chat_typing_by_track(
    track_number: str,
    payload: dict,
    db: Session = Depends(get_db),
    session: dict = Depends(get_public_session),
):
    req = _request_for_track_or_404(db, track_number)
    _ensure_view_access_or_403(session, req)
    subject = _require_view_session_or_403(session)
    typing = bool((payload or {}).get("typing"))
    actor_key = f"CLIENT:{_normalize_track(subject) or _normalize_phone(subject)}"
    set_typing_presence(
        request_key=str(req.id),
        actor_key=actor_key,
        actor_label=str(req.client_name or "Клиент"),
        actor_role="CLIENT",
        typing=typing,
    )
    return {"status": "ok", "typing": typing}


@router.get("/requests/{track_number}/data-requests/{message_id}")
def get_data_request_by_message(
    track_number: str,
    message_id: str,
    db: Session = Depends(get_db),
    session: dict = Depends(get_public_session),
):
    req = _request_for_track_or_404(db, track_number)
    _ensure_view_access_or_403(session, req)
    try:
        message_uuid = UUID(str(message_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Некорректный идентификатор сообщения")
    message = db.get(Message, message_uuid)
    if message is None or message.request_id != req.id:
        raise HTTPException(status_code=404, detail="Сообщение запроса не найдено")
    rows = (
        db.query(RequestDataRequirement)
        .filter(
            RequestDataRequirement.request_id == req.id,
            RequestDataRequirement.request_message_id == message_uuid,
        )
        .order_by(RequestDataRequirement.sort_order.asc(), RequestDataRequirement.created_at.asc(), RequestDataRequirement.id.asc())
        .all()
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Запрос данных не найден")
    return {
        "message_id": str(message.id),
        "request_id": str(req.id),
        "track_number": req.track_number,
        "items": [
            {
                "id": str(row.id),
                "key": row.key,
                "label": row.label,
                "field_type": str(row.field_type or "text"),
                "value_text": row.value_text,
                "value_file": _attachment_meta_for_public(req, row.value_text, db) if str(row.field_type or "").lower() == "file" else None,
                "is_filled": bool(str(row.value_text or "").strip()),
                "sort_order": int(row.sort_order or 0),
            }
            for row in rows
        ],
    }


@router.post("/requests/{track_number}/data-requests/{message_id}")
def save_data_request_values(
    track_number: str,
    message_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    session: dict = Depends(get_public_session),
):
    req = _request_for_track_or_404(db, track_number)
    _ensure_view_access_or_403(session, req)
    try:
        message_uuid = UUID(str(message_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Некорректный идентификатор сообщения")
    message = db.get(Message, message_uuid)
    if message is None or message.request_id != req.id:
        raise HTTPException(status_code=404, detail="Сообщение запроса не найдено")

    raw_items = (payload or {}).get("items")
    if not isinstance(raw_items, list):
        raise HTTPException(status_code=400, detail="Ожидается список items")

    rows = (
        db.query(RequestDataRequirement)
        .filter(
            RequestDataRequirement.request_id == req.id,
            RequestDataRequirement.request_message_id == message_uuid,
        )
        .all()
    )
    by_id = {str(row.id): row for row in rows}
    by_key = {str(row.key): row for row in rows}
    updated = 0
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        target = None
        raw_id = str(item.get("id") or "").strip()
        if raw_id:
            target = by_id.get(raw_id)
        if target is None:
            raw_key = str(item.get("key") or "").strip()
            if raw_key:
                target = by_key.get(raw_key)
        if target is None:
            continue
        if str(target.field_type or "").lower() == "file":
            attachment_id_raw = str(item.get("attachment_id") or item.get("value_text") or "").strip()
            if attachment_id_raw:
                try:
                    attachment_uuid = UUID(attachment_id_raw)
                except ValueError:
                    raise HTTPException(status_code=400, detail="Некорректный attachment_id для файла")
                attachment = db.get(Attachment, attachment_uuid)
                if attachment is None or attachment.request_id != req.id:
                    raise HTTPException(status_code=400, detail="Файл для поля не найден или недоступен")
                normalized = str(attachment.id)
            else:
                normalized = ""
        else:
            value_text = item.get("value_text")
            normalized = str(value_text).strip() if value_text is not None else ""
        target.value_text = normalized or None
        target.responsible = "Клиент"
        db.add(target)
        updated += 1

    if updated:
        mark_unread_for_lawyer(req, EVENT_MESSAGE)
        req.responsible = "Клиент"
        db.add(req)
        db.commit()
    else:
        db.rollback()

    messages = list_messages_for_request(db, req.id)
    serialized = serialize_messages_for_request(db, req.id, messages)
    current = next((item for item in serialized if str(item.get("id")) == str(message_uuid)), None)
    return {"updated": updated, "message": current}
