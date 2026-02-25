from __future__ import annotations

import json
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.deps import require_role
from app.db.session import get_db
from app.models.admin_user import AdminUser
from app.models.invoice import Invoice
from app.models.request import Request
from app.schemas.universal import UniversalQuery
from app.services.invoice_crypto import decrypt_requisites, encrypt_requisites
from app.services.invoice_pdf import build_invoice_pdf_bytes
from app.services.universal_query import apply_universal_query

router = APIRouter()

STATUS_WAITING = "WAITING_PAYMENT"
STATUS_PAID = "PAID"
STATUS_CANCELED = "CANCELED"
ALLOWED_STATUSES = {STATUS_WAITING, STATUS_PAID, STATUS_CANCELED}
STATUS_LABELS = {
    STATUS_WAITING: "Ожидает оплату",
    STATUS_PAID: "Оплачен",
    STATUS_CANCELED: "Отменен",
}


def _to_float(value) -> float | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _actor_uuid_or_401(admin: dict) -> UUID:
    try:
        return UUID(str(admin.get("sub") or ""))
    except ValueError:
        raise HTTPException(status_code=401, detail="Некорректный токен")


def _uuid_or_400(raw: str | None, field: str) -> UUID:
    if not raw:
        raise HTTPException(status_code=400, detail=f'Поле "{field}" обязательно')
    try:
        return UUID(str(raw))
    except ValueError:
        raise HTTPException(status_code=400, detail=f'Некорректное поле "{field}"')


def _normalize_status(raw: str | None) -> str:
    value = str(raw or STATUS_WAITING).strip().upper()
    if value not in ALLOWED_STATUSES:
        raise HTTPException(status_code=400, detail="Некорректный статус счета")
    return value


def _normalize_currency(raw: str | None) -> str:
    value = str(raw or "RUB").strip().upper()[:3]
    return value or "RUB"


def _amount_or_400(raw) -> float:
    value = _to_float(raw)
    if value is None:
        raise HTTPException(status_code=400, detail='Поле "amount" обязательно и должно быть числом')
    if value < 0:
        raise HTTPException(status_code=400, detail='Поле "amount" не может быть отрицательным')
    return round(value, 2)


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _invoice_number(db: Session) -> str:
    prefix = _now_utc().strftime("%Y%m%d")
    candidate = f"INV-{prefix}-{uuid4().hex[:8].upper()}"
    exists = db.query(Invoice.id).filter(Invoice.invoice_number == candidate).first()
    if exists is None:
        return candidate
    return f"INV-{prefix}-{uuid4().hex[:12].upper()}"


def _parse_requisites(raw) -> dict:
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return dict(raw)
    text = str(raw).strip()
    if not text:
        return {}
    try:
        data = json.loads(text)
    except Exception:
        raise HTTPException(status_code=400, detail='Поле "payer_details" должно быть JSON-объектом')
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail='Поле "payer_details" должно быть JSON-объектом')
    return data


def _ensure_lawyer_owns_request_or_403(role: str, actor_id: UUID, req: Request) -> None:
    if role != "LAWYER":
        return
    assigned = str(req.assigned_lawyer_id or "").strip()
    if not assigned or assigned != str(actor_id):
        raise HTTPException(status_code=403, detail="Юрист видит и изменяет только свои счета")


def _serialize_invoice(
    row: Invoice,
    request_track: str | None,
    issuer_name: str | None,
    *,
    include_payer_details: bool = False,
) -> dict:
    payload = {
        "id": str(row.id),
        "invoice_number": row.invoice_number,
        "request_id": str(row.request_id),
        "client_id": str(row.client_id) if row.client_id else None,
        "request_track_number": request_track,
        "status": row.status,
        "status_label": STATUS_LABELS.get(str(row.status or "").upper(), row.status),
        "amount": _to_float(row.amount),
        "currency": row.currency,
        "payer_display_name": row.payer_display_name,
        "issued_by_admin_user_id": str(row.issued_by_admin_user_id) if row.issued_by_admin_user_id else None,
        "issued_by_name": issuer_name,
        "issued_by_role": row.issued_by_role,
        "issued_at": _to_iso(row.issued_at),
        "paid_at": _to_iso(row.paid_at),
        "created_at": _to_iso(row.created_at),
        "updated_at": _to_iso(row.updated_at),
        "responsible": row.responsible,
        "pdf_url": f"/api/admin/invoices/{row.id}/pdf",
    }
    if include_payer_details:
        payload["payer_details"] = decrypt_requisites(row.payer_details_encrypted)
    return payload


def _apply_paid_flags(req: Request, invoice: Invoice, *, admin_id: UUID | None) -> None:
    req.invoice_amount = invoice.amount
    req.paid_at = invoice.paid_at
    req.paid_by_admin_id = str(admin_id) if admin_id else None


def _request_from_payload_or_404(db: Session, payload: dict) -> Request:
    request_id_raw = payload.get("request_id")
    track_number_raw = str(payload.get("request_track_number") or "").strip().upper()

    if request_id_raw:
        request_id = _uuid_or_400(request_id_raw, "request_id")
        req = db.get(Request, request_id)
        if req is None:
            raise HTTPException(status_code=404, detail="Заявка не найдена")
        return req

    if track_number_raw:
        req = db.query(Request).filter(Request.track_number == track_number_raw).first()
        if req is None:
            raise HTTPException(status_code=404, detail="Заявка не найдена")
        return req

    raise HTTPException(status_code=400, detail='Поле "request_id" или "request_track_number" обязательно')


def _commit_or_400(db: Session, detail: str) -> None:
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail=detail)


@router.post("/query")
def query_invoices(
    uq: UniversalQuery,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_role("ADMIN", "LAWYER")),
):
    role = str(admin.get("role") or "").upper()
    actor_id = _actor_uuid_or_401(admin)

    query = db.query(Invoice)
    if role == "LAWYER":
        query = query.join(Request, Request.id == Invoice.request_id).filter(Request.assigned_lawyer_id == str(actor_id))
    query = apply_universal_query(query, Invoice, uq)

    total = query.count()
    rows = query.offset(uq.page.offset).limit(uq.page.limit).all()

    request_ids = {row.request_id for row in rows}
    requests = db.query(Request.id, Request.track_number).filter(Request.id.in_(request_ids)).all() if request_ids else []
    request_map = {str(row_id): track for row_id, track in requests}

    issuer_ids = {row.issued_by_admin_user_id for row in rows if row.issued_by_admin_user_id}
    users = db.query(AdminUser.id, AdminUser.name, AdminUser.email).filter(AdminUser.id.in_(issuer_ids)).all() if issuer_ids else []
    issuer_map = {str(user_id): (name or email or str(user_id)) for user_id, name, email in users}

    data = [
        _serialize_invoice(
            row,
            request_track=request_map.get(str(row.request_id)),
            issuer_name=issuer_map.get(str(row.issued_by_admin_user_id)) if row.issued_by_admin_user_id else None,
        )
        for row in rows
    ]
    return {"rows": data, "total": int(total)}


@router.get("/{invoice_id}")
def get_invoice(
    invoice_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_role("ADMIN", "LAWYER")),
):
    role = str(admin.get("role") or "").upper()
    actor_id = _actor_uuid_or_401(admin)

    invoice = db.get(Invoice, _uuid_or_400(invoice_id, "invoice_id"))
    if invoice is None:
        raise HTTPException(status_code=404, detail="Счет не найден")

    req = db.get(Request, invoice.request_id)
    if req is None:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    _ensure_lawyer_owns_request_or_403(role, actor_id, req)

    issuer = db.get(AdminUser, invoice.issued_by_admin_user_id) if invoice.issued_by_admin_user_id else None
    return _serialize_invoice(
        invoice,
        request_track=req.track_number,
        issuer_name=issuer.name if issuer else None,
        include_payer_details=True,
    )


@router.post("", status_code=201)
def create_invoice(
    payload: dict,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_role("ADMIN", "LAWYER")),
):
    role = str(admin.get("role") or "").upper()
    actor_id = _actor_uuid_or_401(admin)
    actor_email = str(admin.get("email") or "").strip() or "Администратор системы"

    req = _request_from_payload_or_404(db, payload)
    _ensure_lawyer_owns_request_or_403(role, actor_id, req)

    status = _normalize_status(payload.get("status"))
    if role == "LAWYER" and status == STATUS_PAID:
        raise HTTPException(status_code=403, detail='Юрист не может ставить статус "Оплачен"')

    payer_display_name = str(payload.get("payer_display_name") or "").strip()
    if not payer_display_name:
        raise HTTPException(status_code=400, detail='Поле "payer_display_name" обязательно')

    invoice = Invoice(
        request_id=req.id,
        client_id=req.client_id,
        invoice_number=str(payload.get("invoice_number") or "").strip() or _invoice_number(db),
        status=status,
        amount=_amount_or_400(payload.get("amount")),
        currency=_normalize_currency(payload.get("currency")),
        payer_display_name=payer_display_name,
        payer_details_encrypted=encrypt_requisites(_parse_requisites(payload.get("payer_details"))),
        issued_by_admin_user_id=actor_id,
        issued_by_role=role,
        issued_at=_now_utc(),
        paid_at=None,
        responsible=actor_email,
    )

    req.invoice_amount = invoice.amount
    req.responsible = actor_email

    if status == STATUS_PAID:
        invoice.paid_at = _now_utc()
        _apply_paid_flags(req, invoice, admin_id=actor_id if role == "ADMIN" else None)

    db.add(invoice)
    db.add(req)
    _commit_or_400(db, "Счет с таким номером уже существует")
    db.refresh(invoice)

    issuer = db.get(AdminUser, invoice.issued_by_admin_user_id) if invoice.issued_by_admin_user_id else None
    return _serialize_invoice(invoice, request_track=req.track_number, issuer_name=issuer.name if issuer else None)


@router.patch("/{invoice_id}")
def update_invoice(
    invoice_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_role("ADMIN", "LAWYER")),
):
    role = str(admin.get("role") or "").upper()
    actor_id = _actor_uuid_or_401(admin)
    actor_email = str(admin.get("email") or "").strip() or "Администратор системы"

    invoice = db.get(Invoice, _uuid_or_400(invoice_id, "invoice_id"))
    if invoice is None:
        raise HTTPException(status_code=404, detail="Счет не найден")

    req = db.get(Request, invoice.request_id)
    if req is None:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    _ensure_lawyer_owns_request_or_403(role, actor_id, req)

    prev_status = str(invoice.status or "").upper()
    prev_paid_at = invoice.paid_at

    if "amount" in payload:
        invoice.amount = _amount_or_400(payload.get("amount"))
        req.invoice_amount = invoice.amount
        if prev_status == STATUS_PAID:
            req.paid_at = invoice.paid_at
    if "currency" in payload:
        invoice.currency = _normalize_currency(payload.get("currency"))
    if "payer_display_name" in payload:
        name = str(payload.get("payer_display_name") or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail='Поле "payer_display_name" не может быть пустым')
        invoice.payer_display_name = name
    if "payer_details" in payload:
        invoice.payer_details_encrypted = encrypt_requisites(_parse_requisites(payload.get("payer_details")))
    if "invoice_number" in payload and str(payload.get("invoice_number") or "").strip():
        invoice.invoice_number = str(payload.get("invoice_number") or "").strip()

    if "status" in payload:
        next_status = _normalize_status(payload.get("status"))
        if role == "LAWYER" and next_status == STATUS_PAID:
            raise HTTPException(status_code=403, detail='Юрист не может ставить статус "Оплачен"')
        if role == "LAWYER" and prev_status == STATUS_PAID and next_status != STATUS_PAID:
            raise HTTPException(status_code=403, detail="Юрист не может менять статус уже оплаченного счета")

        invoice.status = next_status
        if next_status == STATUS_PAID:
            if role != "ADMIN":
                raise HTTPException(status_code=403, detail='Юрист не может ставить статус "Оплачен"')
            invoice.paid_at = _now_utc()
            _apply_paid_flags(req, invoice, admin_id=actor_id)
        else:
            invoice.paid_at = None
            req.invoice_amount = invoice.amount
            if prev_paid_at is not None and req.paid_at == prev_paid_at:
                req.paid_at = None
                req.paid_by_admin_id = None

    invoice.responsible = actor_email
    req.responsible = actor_email

    db.add(invoice)
    db.add(req)
    _commit_or_400(db, "Счет с таким номером уже существует")
    db.refresh(invoice)

    issuer = db.get(AdminUser, invoice.issued_by_admin_user_id) if invoice.issued_by_admin_user_id else None
    return _serialize_invoice(invoice, request_track=req.track_number, issuer_name=issuer.name if issuer else None)


@router.delete("/{invoice_id}")
def delete_invoice(
    invoice_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_role("ADMIN")),
):
    actor_email = str(admin.get("email") or "").strip() or "Администратор системы"

    invoice = db.get(Invoice, _uuid_or_400(invoice_id, "invoice_id"))
    if invoice is None:
        raise HTTPException(status_code=404, detail="Счет не найден")

    req = db.get(Request, invoice.request_id)
    if req is not None:
        if invoice.paid_at is not None and req.paid_at == invoice.paid_at:
            req.paid_at = None
            req.paid_by_admin_id = None
        req.responsible = actor_email
        db.add(req)

    db.delete(invoice)
    db.commit()
    return {"status": "удалено", "id": invoice_id, "responsible": actor_email}


@router.get("/{invoice_id}/pdf")
def download_invoice_pdf(
    invoice_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_role("ADMIN", "LAWYER")),
):
    role = str(admin.get("role") or "").upper()
    actor_id = _actor_uuid_or_401(admin)

    invoice = db.get(Invoice, _uuid_or_400(invoice_id, "invoice_id"))
    if invoice is None:
        raise HTTPException(status_code=404, detail="Счет не найден")

    req = db.get(Request, invoice.request_id)
    if req is None:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    _ensure_lawyer_owns_request_or_403(role, actor_id, req)

    issuer = db.get(AdminUser, invoice.issued_by_admin_user_id) if invoice.issued_by_admin_user_id else None
    requisites = decrypt_requisites(invoice.payer_details_encrypted)
    pdf_bytes = build_invoice_pdf_bytes(
        invoice_number=invoice.invoice_number,
        amount=_to_float(invoice.amount) or 0.0,
        currency=invoice.currency,
        status=STATUS_LABELS.get(str(invoice.status or "").upper(), invoice.status or "-"),
        issued_at=invoice.issued_at,
        paid_at=invoice.paid_at,
        payer_display_name=invoice.payer_display_name,
        request_track_number=req.track_number,
        issued_by_name=(issuer.name if issuer else None),
        requisites=requisites,
    )

    file_name = f"{invoice.invoice_number}.pdf"
    headers = {"Content-Disposition": f'attachment; filename="{file_name}"'}
    return StreamingResponse(iter([pdf_bytes]), media_type="application/pdf", headers=headers)
