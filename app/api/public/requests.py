from __future__ import annotations

from datetime import timedelta
from uuid import UUID
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import settings
from app.core.deps import get_public_session
from app.core.security import create_jwt
from app.db.session import get_db
from app.models.admin_user import AdminUser
from app.models.attachment import Attachment
from app.models.client import Client
from app.models.invoice import Invoice
from app.models.message import Message
from app.models.audit_log import AuditLog
from app.models.request import Request
from app.models.request_service_request import RequestServiceRequest
from app.models.status_history import StatusHistory
from app.models.topic import Topic
from app.services.invoice_crypto import decrypt_requisites
from app.services.invoice_pdf import build_invoice_pdf_bytes
from app.services.chat_service import create_client_message, list_messages_for_request
from app.services.notifications import (
    get_client_notification,
    list_client_notifications,
    mark_client_notifications_read,
    serialize_notification,
)
from app.services.request_read_markers import clear_unread_for_client
from app.services.request_templates import validate_required_topic_fields_or_400
from app.api.admin.requests_modules.status_flow import get_request_status_route_service
from app.schemas.public import (
    PublicAttachmentRead,
    PublicMessageCreate,
    PublicMessageRead,
    PublicRequestCreate,
    PublicRequestCreated,
    PublicServiceRequestCreate,
    PublicServiceRequestRead,
    PublicStatusHistoryRead,
    PublicTimelineEvent,
)

router = APIRouter()

OTP_CREATE_PURPOSE = "CREATE_REQUEST"
OTP_VIEW_PURPOSE = "VIEW_REQUEST"
INVOICE_STATUS_LABELS = {
    "WAITING_PAYMENT": "Ожидает оплату",
    "PAID": "Оплачен",
    "CANCELED": "Отменен",
}
SERVICE_REQUEST_TYPES = {"CURATOR_CONTACT", "LAWYER_CHANGE_REQUEST"}


def _normalize_phone(raw: str | None) -> str:
    value = str(raw or "").strip()
    if not value:
        return ""
    allowed = {"+", "(", ")", "-", " "}
    return "".join(ch for ch in value if ch.isdigit() or ch in allowed).strip()


def _normalize_track(raw: str | None) -> str:
    return str(raw or "").strip().upper()


def _set_view_cookie(response: Response, subject: str) -> None:
    token = create_jwt(
        {"sub": subject, "purpose": OTP_VIEW_PURPOSE},
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


def _require_view_session_or_403(session: dict) -> str:
    purpose = str(session.get("purpose") or "").strip().upper()
    subject = str(session.get("sub") or "").strip()
    if purpose != OTP_VIEW_PURPOSE or not subject:
        raise HTTPException(status_code=403, detail="Нет доступа к заявке")
    return subject


def _ensure_view_access_or_403(session: dict, req: Request) -> None:
    subject = _require_view_session_or_403(session)
    if _normalize_track(subject) == _normalize_track(req.track_number):
        return
    if _normalize_phone(subject) and _normalize_phone(subject) == _normalize_phone(req.client_phone):
        return
    raise HTTPException(status_code=403, detail="Нет доступа к заявке")


def _request_for_track_or_404(db: Session, session: dict, track_number: str) -> Request:
    normalized_track = _normalize_track(track_number)
    subject = _require_view_session_or_403(session)
    subject_track = _normalize_track(subject)
    if subject_track.startswith("TRK-") and subject_track != normalized_track:
        raise HTTPException(status_code=403, detail="Нет доступа к заявке")
    req = db.query(Request).filter(Request.track_number == normalized_track).first()
    if req is None:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    _ensure_view_access_or_403(session, req)
    return req


def _upsert_client_by_phone(db: Session, *, full_name: str, phone: str) -> Client:
    normalized_phone = _normalize_phone(phone)
    if not normalized_phone:
        raise HTTPException(status_code=400, detail='Поле "client_phone" обязательно')
    normalized_name = str(full_name or "").strip() or "Клиент"

    client = db.query(Client).filter(Client.phone == normalized_phone).first()
    if client is None:
        client = Client(
            full_name=normalized_name,
            phone=normalized_phone,
            responsible="Клиент",
        )
        db.add(client)
        db.flush()
        return client
    if client.full_name != normalized_name:
        client.full_name = normalized_name
        client.responsible = "Клиент"
        db.add(client)
        db.flush()
    return client


def _to_iso(value) -> str | None:
    return value.isoformat() if value is not None else None


def _serialize_public_service_request(row: RequestServiceRequest) -> PublicServiceRequestRead:
    return PublicServiceRequestRead(
        id=row.id,
        request_id=row.request_id,
        client_id=row.client_id,
        type=str(row.type or ""),
        status=str(row.status or "NEW"),
        body=str(row.body or ""),
        created_by_client=bool(row.created_by_client),
        created_at=_to_iso(row.created_at),
        updated_at=_to_iso(row.updated_at),
        resolved_at=_to_iso(row.resolved_at),
    )


def _public_invoice_payload(row: Invoice, track_number: str) -> dict:
    status_code = str(row.status or "").upper()
    return {
        "id": str(row.id),
        "invoice_number": row.invoice_number,
        "status": row.status,
        "status_label": INVOICE_STATUS_LABELS.get(status_code, row.status),
        "amount": float(row.amount) if row.amount is not None else 0.0,
        "currency": row.currency,
        "payer_display_name": row.payer_display_name,
        "issued_at": _to_iso(row.issued_at),
        "paid_at": _to_iso(row.paid_at),
        "download_url": f"/api/public/requests/{track_number}/invoices/{row.id}/pdf",
    }


@router.post("", response_model=PublicRequestCreated, status_code=201)
def create_request(
    payload: PublicRequestCreate,
    response: Response,
    db: Session = Depends(get_db),
    session: dict = Depends(get_public_session),
):
    _require_create_session_or_403(session, payload.client_phone)
    validate_required_topic_fields_or_400(db, payload.topic_code, payload.extra_fields)
    client = _upsert_client_by_phone(db, full_name=payload.client_name, phone=payload.client_phone)

    track = f"TRK-{uuid4().hex[:10].upper()}"
    row = Request(
        track_number=track,
        client_id=client.id,
        client_name=client.full_name,
        client_phone=client.phone,
        topic_code=payload.topic_code,
        description=payload.description,
        extra_fields=payload.extra_fields,
        responsible="Клиент",
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    _set_view_cookie(response, client.phone)
    return PublicRequestCreated(request_id=row.id, track_number=row.track_number, otp_required=False)


@router.get("/topics")
def list_public_topics(db: Session = Depends(get_db)):
    rows = (
        db.query(Topic)
        .filter(Topic.enabled.is_(True))
        .order_by(Topic.sort_order.asc(), Topic.name.asc(), Topic.code.asc())
        .all()
    )
    return [{"code": row.code, "name": row.name} for row in rows]


@router.get("/my")
def list_my_requests(
    db: Session = Depends(get_db),
    session: dict = Depends(get_public_session),
):
    subject = _require_view_session_or_403(session)
    normalized_track = _normalize_track(subject)
    normalized_phone = _normalize_phone(subject)

    query = db.query(Request)
    if normalized_track.startswith("TRK-"):
        query = query.filter(Request.track_number == normalized_track)
    else:
        query = query.filter(Request.client_phone == normalized_phone)

    rows = query.order_by(Request.updated_at.desc(), Request.created_at.desc(), Request.id.desc()).all()
    return {
        "rows": [
            {
                "id": str(row.id),
                "track_number": row.track_number,
                "topic_code": row.topic_code,
                "status_code": row.status_code,
                "client_has_unread_updates": bool(row.client_has_unread_updates),
                "client_unread_event_type": row.client_unread_event_type,
                "created_at": _to_iso(row.created_at),
                "updated_at": _to_iso(row.updated_at),
            }
            for row in rows
        ],
        "total": len(rows),
    }


@router.get("/{track_number}")
def get_request_by_track(
    track_number: str,
    db: Session = Depends(get_db),
    session: dict = Depends(get_public_session),
):
    req = _request_for_track_or_404(db, session, track_number)
    topic_name = None
    if str(req.topic_code or "").strip():
        try:
            topic = db.query(Topic).filter(Topic.code == req.topic_code).first()
            topic_name = topic.name if topic and topic.name else None
        except SQLAlchemyError:
            topic_name = None
    lawyer_name = None
    lawyer_phone = None
    lawyer_id = str(req.assigned_lawyer_id or "").strip()
    if lawyer_id:
        try:
            lawyer_uuid = UUID(lawyer_id)
        except ValueError:
            lawyer_uuid = None
        if lawyer_uuid is not None:
            try:
                lawyer = db.get(AdminUser, lawyer_uuid)
            except SQLAlchemyError:
                lawyer = None
            if lawyer is not None:
                lawyer_name = lawyer.name
                lawyer_phone = lawyer.phone

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
        "client_id": str(req.client_id) if req.client_id else None,
        "track_number": req.track_number,
        "client_name": req.client_name,
        "client_phone": req.client_phone,
        "topic_code": req.topic_code,
        "topic_name": topic_name,
        "status_code": req.status_code,
        "important_date_at": _to_iso(req.important_date_at),
        "description": req.description,
        "extra_fields": req.extra_fields,
        "assigned_lawyer_id": req.assigned_lawyer_id,
        "assigned_lawyer_name": lawyer_name or req.assigned_lawyer_id,
        "assigned_lawyer_phone": lawyer_phone,
        "request_cost": float(req.request_cost) if req.request_cost is not None else None,
        "effective_rate": float(req.effective_rate) if req.effective_rate is not None else None,
        "paid_at": _to_iso(req.paid_at),
        "client_has_unread_updates": req.client_has_unread_updates,
        "client_unread_event_type": req.client_unread_event_type,
        "lawyer_has_unread_updates": req.lawyer_has_unread_updates,
        "lawyer_unread_event_type": req.lawyer_unread_event_type,
        "created_at": _to_iso(req.created_at),
        "updated_at": _to_iso(req.updated_at),
    }


@router.get("/{track_number}/status-route")
def get_status_route_by_track(
    track_number: str,
    db: Session = Depends(get_db),
    session: dict = Depends(get_public_session),
):
    req = _request_for_track_or_404(db, session, track_number)
    try:
        payload = get_request_status_route_service(
            str(req.id),
            db,
            {"role": "ADMIN", "sub": "", "email": "Клиент"},
        )
        payload["available_statuses"] = []
        return payload
    except Exception:
        current = str(req.status_code or "").strip()
        changed_at = _to_iso(req.updated_at or req.created_at)
        return {
            "request_id": str(req.id),
            "track_number": req.track_number,
            "topic_code": req.topic_code,
            "current_status": current or None,
            "current_important_date_at": _to_iso(req.important_date_at),
            "available_statuses": [],
            "history": [
                {
                    "id": "current",
                    "from_status": None,
                    "to_status": current or None,
                    "to_status_name": current or None,
                    "changed_at": changed_at,
                    "important_date_at": _to_iso(req.important_date_at),
                    "comment": None,
                    "duration_seconds": None,
                }
            ],
            "nodes": [
                {
                    "code": current or "",
                    "name": current or "-",
                    "kind": "DEFAULT",
                    "state": "current",
                    "changed_at": changed_at,
                    "sla_hours": None,
                    "note": "Текущий этап обработки заявки",
                }
            ]
            if current
            else [],
        }


@router.get("/{track_number}/messages", response_model=list[PublicMessageRead])
def list_messages_by_track(
    track_number: str,
    db: Session = Depends(get_db),
    session: dict = Depends(get_public_session),
):
    req = _request_for_track_or_404(db, session, track_number)
    rows = list_messages_for_request(db, req.id)
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
    row = create_client_message(db, request=req, body=payload.body)

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


@router.get("/{track_number}/invoices")
def list_invoices_by_track(
    track_number: str,
    db: Session = Depends(get_db),
    session: dict = Depends(get_public_session),
):
    req = _request_for_track_or_404(db, session, track_number)
    rows = (
        db.query(Invoice)
        .filter(Invoice.request_id == req.id)
        .order_by(Invoice.issued_at.desc(), Invoice.created_at.desc(), Invoice.id.desc())
        .all()
    )
    return [_public_invoice_payload(row, req.track_number) for row in rows]


@router.get("/{track_number}/invoices/{invoice_id}/pdf")
def download_invoice_pdf_by_track(
    track_number: str,
    invoice_id: str,
    db: Session = Depends(get_db),
    session: dict = Depends(get_public_session),
):
    req = _request_for_track_or_404(db, session, track_number)
    try:
        invoice_uuid = UUID(str(invoice_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Некорректный invoice_id")

    invoice = db.get(Invoice, invoice_uuid)
    if invoice is None or str(invoice.request_id) != str(req.id):
        raise HTTPException(status_code=404, detail="Счет не найден")

    issuer = db.get(AdminUser, invoice.issued_by_admin_user_id) if invoice.issued_by_admin_user_id else None
    requisites = decrypt_requisites(invoice.payer_details_encrypted)
    pdf_bytes = build_invoice_pdf_bytes(
        invoice_number=invoice.invoice_number,
        amount=float(invoice.amount) if invoice.amount is not None else 0.0,
        currency=invoice.currency,
        status=INVOICE_STATUS_LABELS.get(str(invoice.status or "").upper(), invoice.status or "-"),
        issued_at=invoice.issued_at,
        paid_at=invoice.paid_at,
        payer_display_name=invoice.payer_display_name,
        request_track_number=req.track_number,
        issued_by_name=(issuer.name if issuer else invoice.issued_by_role),
        requisites=requisites,
    )
    file_name = f"{invoice.invoice_number}.pdf"
    headers = {"Content-Disposition": f'attachment; filename="{file_name}"'}
    return StreamingResponse(iter([pdf_bytes]), media_type="application/pdf", headers=headers)


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


@router.post("/{track_number}/service-requests", response_model=PublicServiceRequestRead, status_code=201)
def create_service_request_by_track(
    track_number: str,
    payload: PublicServiceRequestCreate,
    db: Session = Depends(get_db),
    session: dict = Depends(get_public_session),
):
    req = _request_for_track_or_404(db, session, track_number)
    request_type = str(payload.type or "").strip().upper()
    if request_type not in SERVICE_REQUEST_TYPES:
        raise HTTPException(status_code=400, detail="Некорректный тип запроса")

    body = str(payload.body or "").strip()
    if len(body) < 3:
        raise HTTPException(status_code=400, detail='Поле "body" должно содержать минимум 3 символа')

    assigned_lawyer_value = None
    assigned_lawyer_raw = str(req.assigned_lawyer_id or "").strip()
    if assigned_lawyer_raw:
        assigned_lawyer_value = assigned_lawyer_raw

    lawyer_unread = request_type == "CURATOR_CONTACT" and assigned_lawyer_value is not None
    row = RequestServiceRequest(
        request_id=str(req.id),
        client_id=str(req.client_id) if req.client_id else None,
        assigned_lawyer_id=assigned_lawyer_value,
        type=request_type,
        status="NEW",
        body=body,
        created_by_client=True,
        admin_unread=True,
        lawyer_unread=lawyer_unread,
        responsible="Клиент",
    )
    db.add(row)
    db.flush()
    db.add(
        AuditLog(
            actor_admin_id=None,
            entity="request_service_requests",
            entity_id=str(row.id),
            action="CREATE_CLIENT_REQUEST",
            diff={
                "request_id": str(req.id),
                "track_number": req.track_number,
                "type": request_type,
                "status": "NEW",
            },
            responsible="Клиент",
        )
    )
    db.commit()
    db.refresh(row)
    return _serialize_public_service_request(row)


@router.get("/{track_number}/service-requests", response_model=list[PublicServiceRequestRead])
def list_service_requests_by_track(
    track_number: str,
    db: Session = Depends(get_db),
    session: dict = Depends(get_public_session),
):
    req = _request_for_track_or_404(db, session, track_number)
    rows = (
        db.query(RequestServiceRequest)
        .filter(
            RequestServiceRequest.request_id == str(req.id),
            RequestServiceRequest.created_by_client.is_(True),
        )
        .order_by(RequestServiceRequest.created_at.desc(), RequestServiceRequest.id.desc())
        .all()
    )
    return [_serialize_public_service_request(row) for row in rows]


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
