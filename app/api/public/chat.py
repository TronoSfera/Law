from __future__ import annotations
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
from app.services.chat_service import create_client_message, list_messages_for_request, serialize_message, serialize_messages_for_request
from app.services.request_read_markers import EVENT_MESSAGE, mark_unread_for_lawyer

router = APIRouter()


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
