from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.admin_user import AdminUser
from app.models.attachment import Attachment
from app.models.invoice import Invoice
from app.models.message import Message
from app.models.request import Request
from app.services.attachment_scan import SCAN_STATUS_CLEAN
from app.services.invoice_crypto import decrypt_requisites
from app.services.invoice_pdf import build_invoice_pdf_bytes
from app.services.notifications import EVENT_MESSAGE as NOTIFICATION_EVENT_MESSAGE, notify_request_event
from app.services.request_read_markers import EVENT_MESSAGE, mark_unread_for_client
from app.services.s3_storage import build_object_key, get_s3_storage

INVOICE_CHAT_MESSAGE_BODY = "Счет на оплату"
CHAT_PARTICIPANT_ADMIN_IDS_KEY = "chat_participant_admin_ids"
INVOICE_STATUS_LABELS = {
    "WAITING_PAYMENT": "Ожидает оплату",
    "PAID": "Оплачен",
    "CANCELED": "Отменен",
}


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_admin_uuid(value: Any) -> str | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        return str(uuid.UUID(raw))
    except (TypeError, ValueError):
        return None


def _register_chat_participant(request: Request, admin_user_id: Any) -> None:
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


def _write_invoice_pdf_to_storage_or_500(*, key: str, content: bytes) -> None:
    storage = get_s3_storage()
    if hasattr(storage, "client") and hasattr(storage.client, "put_object") and hasattr(storage, "bucket"):
        storage.client.put_object(
            Bucket=storage.bucket,
            Key=key,
            Body=content,
            ContentType="application/pdf",
        )
        return
    objects = getattr(storage, "objects", None)
    if isinstance(objects, dict):
        objects[key] = {
            "size": int(len(content)),
            "mime": "application/pdf",
            "content": bytes(content),
        }
        return
    raise HTTPException(status_code=500, detail="Хранилище не поддерживает запись PDF счета")


def _status_label(status: str | None) -> str:
    normalized = str(status or "").strip().upper()
    if not normalized:
        return "-"
    return INVOICE_STATUS_LABELS.get(normalized, normalized)


def _issuer_name(db: Session, *, actor_admin_user_id: Any, actor_name: str) -> str:
    normalized = _normalize_admin_uuid(actor_admin_user_id)
    if not normalized:
        return str(actor_name or "").strip() or "Администратор системы"
    row = db.get(AdminUser, uuid.UUID(normalized))
    if row is None:
        return str(actor_name or "").strip() or "Администратор системы"
    return str(row.name or row.email or actor_name or "Администратор системы").strip() or "Администратор системы"


def create_invoice_chat_message_with_attachment(
    db: Session,
    *,
    request: Request,
    invoice: Invoice,
    actor_role: str,
    actor_name: str,
    actor_admin_user_id: Any,
    responsible: str,
) -> tuple[Message, Attachment]:
    normalized_role = str(actor_role or "").strip().upper() or "ADMIN"
    author_type = "LAWYER" if normalized_role in {"LAWYER", "CURATOR"} else "SYSTEM"
    author_name = str(actor_name or "").strip() or ("Юрист" if author_type == "LAWYER" else "Администратор системы")
    safe_responsible = str(responsible or "").strip() or "Администратор системы"

    message = Message(
        request_id=request.id,
        author_type=author_type,
        author_name=author_name,
        body=INVOICE_CHAT_MESSAGE_BODY,
        responsible=safe_responsible,
    )
    db.add(message)
    db.flush()

    requisites = decrypt_requisites(invoice.payer_details_encrypted)
    pdf_bytes = build_invoice_pdf_bytes(
        invoice_number=invoice.invoice_number,
        amount=float(invoice.amount or 0),
        currency=str(invoice.currency or "RUB"),
        status=_status_label(invoice.status),
        issued_at=invoice.issued_at,
        paid_at=invoice.paid_at,
        payer_display_name=str(invoice.payer_display_name or "").strip() or "Клиент",
        request_track_number=str(request.track_number or "").strip() or str(request.id),
        issued_by_name=_issuer_name(db, actor_admin_user_id=actor_admin_user_id, actor_name=author_name),
        requisites=requisites,
    )
    if not pdf_bytes:
        raise HTTPException(status_code=500, detail="Не удалось сформировать PDF счета")

    file_name = f"Счет {invoice.invoice_number}.pdf"
    object_key = build_object_key(f"requests/{request.id}", file_name)
    _write_invoice_pdf_to_storage_or_500(key=object_key, content=pdf_bytes)

    attachment = Attachment(
        request_id=request.id,
        message_id=message.id,
        file_name=file_name,
        mime_type="application/pdf",
        size_bytes=int(len(pdf_bytes)),
        s3_key=object_key,
        immutable=False,
        scan_status=SCAN_STATUS_CLEAN,
        scan_signature=None,
        scan_error=None,
        scanned_at=_now_utc(),
        detected_mime="application/pdf",
        responsible=safe_responsible,
    )
    db.add(attachment)

    _register_chat_participant(request, actor_admin_user_id)
    mark_unread_for_client(request, EVENT_MESSAGE)
    request.total_attachments_bytes = int(request.total_attachments_bytes or 0) + int(len(pdf_bytes))
    request.responsible = safe_responsible
    db.add(request)
    notify_request_event(
        db,
        request=request,
        event_type=NOTIFICATION_EVENT_MESSAGE,
        actor_role=normalized_role,
        actor_admin_user_id=actor_admin_user_id,
        body=None,
        responsible=safe_responsible,
    )
    return message, attachment
