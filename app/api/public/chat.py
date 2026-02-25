from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_public_session
from app.db.session import get_db
from app.models.request import Request
from app.schemas.public import PublicMessageCreate
from app.services.chat_service import create_client_message, list_messages_for_request, serialize_message

router = APIRouter()


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
    return [serialize_message(row) for row in rows]


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
