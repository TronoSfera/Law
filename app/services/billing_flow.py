from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from string import Formatter
from typing import Any
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import inspect
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models.invoice import Invoice
from app.models.request import Request
from app.models.status import Status
from app.services.invoice_crypto import encrypt_requisites

STATUS_KIND_DEFAULT = "DEFAULT"
STATUS_KIND_INVOICE = "INVOICE"
STATUS_KIND_PAID = "PAID"
ALLOWED_STATUS_KINDS = {STATUS_KIND_DEFAULT, STATUS_KIND_INVOICE, STATUS_KIND_PAID}

INVOICE_STATUS_WAITING = "WAITING_PAYMENT"
INVOICE_STATUS_PAID = "PAID"

FALLBACK_INVOICE_CODES = {"INVOICE", "BILLING", "WAITING_PAYMENT"}
FALLBACK_PAID_CODES = {"PAID", "ОПЛАЧЕНО"}

DEFAULT_INVOICE_TEMPLATE = (
    "Счет по заявке {track_number}. "
    "Клиент: {client_name}. "
    "Тема: {topic_code}. "
    "Сумма: {amount} RUB."
)


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _actor_uuid_or_none(admin: dict[str, Any] | None) -> UUID | None:
    if not admin:
        return None
    try:
        return UUID(str(admin.get("sub") or ""))
    except ValueError:
        return None


def _normalize_kind(raw: str | None) -> str:
    value = str(raw or STATUS_KIND_DEFAULT).strip().upper()
    if value not in ALLOWED_STATUS_KINDS:
        return STATUS_KIND_DEFAULT
    return value


def normalize_status_kind_or_400(raw: str | None) -> str:
    value = str(raw or STATUS_KIND_DEFAULT).strip().upper()
    if value not in ALLOWED_STATUS_KINDS:
        raise HTTPException(status_code=400, detail='Поле "kind" должно быть одним из: DEFAULT, INVOICE, PAID')
    return value


def _table_exists(db: Session, table_name: str) -> bool:
    try:
        bind = db.get_bind()
        if bind is None:
            return False
        return table_name in set(inspect(bind).get_table_names())
    except SQLAlchemyError:
        return False


def _status_kind(db: Session, status_code: str) -> str:
    code = str(status_code or "").strip()
    if not code:
        return STATUS_KIND_DEFAULT
    row = db.query(Status.kind).filter(Status.code == code).first()
    if row and row[0]:
        return _normalize_kind(row[0])
    upper = code.upper()
    if upper in FALLBACK_INVOICE_CODES:
        return STATUS_KIND_INVOICE
    if upper in FALLBACK_PAID_CODES:
        return STATUS_KIND_PAID
    return STATUS_KIND_DEFAULT


def _status_template(db: Session, status_code: str) -> str | None:
    code = str(status_code or "").strip()
    if not code:
        return None
    row = db.query(Status.invoice_template).filter(Status.code == code).first()
    if row is None:
        return None
    value = str(row[0] or "").strip()
    return value or None


def _invoice_number(db: Session) -> str:
    prefix = _now_utc().strftime("%Y%m%d")
    candidate = f"INV-{prefix}-{uuid4().hex[:8].upper()}"
    exists = db.query(Invoice.id).filter(Invoice.invoice_number == candidate).first()
    if exists is None:
        return candidate
    return f"INV-{prefix}-{uuid4().hex[:12].upper()}"


def _safe_render_template(template: str, values: dict[str, Any]) -> str:
    source = str(template or "").strip() or DEFAULT_INVOICE_TEMPLATE
    allowed = {
        "request_id",
        "track_number",
        "client_name",
        "client_phone",
        "topic_code",
        "from_status",
        "to_status",
        "effective_rate",
        "invoice_amount",
        "amount",
    }
    formatter = Formatter()
    out = source
    for _, field_name, _, _ in formatter.parse(source):
        if not field_name:
            continue
        if field_name not in allowed:
            raise HTTPException(status_code=400, detail=f'Шаблон счета содержит недопустимый placeholder: "{field_name}"')
    try:
        out = source.format_map({key: values.get(key) for key in allowed})
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Ошибка рендера шаблона счета: {exc}")
    return out


def _create_waiting_invoice(
    db: Session,
    *,
    req: Request,
    to_status: str,
    from_status: str,
    admin: dict[str, Any] | None,
    responsible: str,
) -> str:
    waiting = (
        db.query(Invoice)
        .filter(Invoice.request_id == req.id, Invoice.status == INVOICE_STATUS_WAITING)
        .order_by(Invoice.issued_at.desc(), Invoice.created_at.desc(), Invoice.id.desc())
        .first()
    )
    if waiting is not None:
        return waiting.invoice_number

    base_amount = _to_float(req.invoice_amount)
    if base_amount is None or base_amount <= 0:
        base_amount = _to_float(req.effective_rate)
    amount = round(float(base_amount or 0.0), 2)

    template = _status_template(db, to_status) or DEFAULT_INVOICE_TEMPLATE
    rendered_template = _safe_render_template(
        template,
        {
            "request_id": str(req.id),
            "track_number": req.track_number,
            "client_name": req.client_name,
            "client_phone": req.client_phone,
            "topic_code": req.topic_code,
            "from_status": from_status,
            "to_status": to_status,
            "effective_rate": _to_float(req.effective_rate),
            "invoice_amount": _to_float(req.invoice_amount),
            "amount": amount,
        },
    )

    actor = _actor_uuid_or_none(admin)
    role = str((admin or {}).get("role") or "").strip().upper() or None
    invoice = Invoice(
        request_id=req.id,
        invoice_number=_invoice_number(db),
        status=INVOICE_STATUS_WAITING,
        amount=amount,
        currency="RUB",
        payer_display_name=str(req.client_name or "").strip() or "Клиент",
        payer_details_encrypted=encrypt_requisites(
            {
                "template_rendered": rendered_template,
                "request_track_number": req.track_number,
                "topic_code": req.topic_code,
            }
        ),
        issued_by_admin_user_id=actor,
        issued_by_role=role,
        issued_at=_now_utc(),
        paid_at=None,
        responsible=responsible,
    )
    db.add(invoice)
    if req.invoice_amount is None:
        req.invoice_amount = amount
    req.responsible = responsible
    db.add(req)
    return invoice.invoice_number


def _mark_waiting_invoice_paid_or_400(
    db: Session,
    *,
    req: Request,
    admin: dict[str, Any] | None,
    responsible: str,
) -> tuple[str, float]:
    actor = _actor_uuid_or_none(admin)
    role = str((admin or {}).get("role") or "").strip().upper()
    if role != "ADMIN":
        raise HTTPException(status_code=403, detail='Статус "Оплачено" может поставить только администратор')

    waiting = (
        db.query(Invoice)
        .filter(Invoice.request_id == req.id, Invoice.status == INVOICE_STATUS_WAITING)
        .order_by(Invoice.issued_at.desc(), Invoice.created_at.desc(), Invoice.id.desc())
        .first()
    )
    if waiting is None:
        raise HTTPException(status_code=400, detail='Для перехода в статус "Оплачено" нужен счет в статусе "Ожидает оплату"')

    waiting.status = INVOICE_STATUS_PAID
    waiting.paid_at = _now_utc()
    waiting.responsible = responsible
    db.add(waiting)

    req.invoice_amount = waiting.amount
    req.paid_at = waiting.paid_at
    req.paid_by_admin_id = str(actor) if actor else None
    req.responsible = responsible
    db.add(req)
    return waiting.invoice_number, round(float(_to_float(waiting.amount) or 0.0), 2)


def apply_billing_transition_effects(
    db: Session,
    *,
    req: Request,
    from_status: str,
    to_status: str,
    admin: dict[str, Any] | None,
    responsible: str,
) -> str | None:
    if not _table_exists(db, "invoices"):
        return None

    from_kind = _status_kind(db, from_status)
    to_kind = _status_kind(db, to_status)

    if to_kind == STATUS_KIND_INVOICE and from_kind != STATUS_KIND_INVOICE:
        number = _create_waiting_invoice(
            db,
            req=req,
            to_status=to_status,
            from_status=from_status,
            admin=admin,
            responsible=responsible,
        )
        return f"Выставлен счет {number}"

    if to_kind == STATUS_KIND_PAID:
        number, amount = _mark_waiting_invoice_paid_or_400(
            db,
            req=req,
            admin=admin,
            responsible=responsible,
        )
        return f"Оплачен счет {number} на сумму {amount:.2f}"

    return None
