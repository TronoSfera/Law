from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.admin_user import AdminUser
from app.models.client import Client
from app.models.request import Request

REQUEST_FINANCIAL_FIELDS = {"effective_rate", "invoice_amount", "paid_at", "paid_by_admin_id"}


def normalize_client_phone(value: object) -> str:
    text = "".join(ch for ch in str(value or "") if ch.isdigit() or ch == "+")
    if not text:
        return ""
    if text.startswith("8") and len(text) == 11:
        text = "+7" + text[1:]
    if not text.startswith("+") and text.isdigit():
        text = "+" + text
    return text


def client_uuid_or_none(value: object) -> UUID | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        return UUID(raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail='Некорректный "client_id"') from exc


def client_for_request_payload_or_400(
    db: Session,
    *,
    client_id: object,
    client_name: object,
    client_phone: object,
    responsible: str,
) -> Client:
    client_uuid = client_uuid_or_none(client_id)
    if client_uuid is not None:
        row = db.get(Client, client_uuid)
        if row is None:
            raise HTTPException(status_code=404, detail="Клиент не найден")
        return row

    normalized_phone = normalize_client_phone(client_phone)
    if not normalized_phone:
        raise HTTPException(status_code=400, detail='Поле "client_phone" обязательно')
    normalized_name = str(client_name or "").strip() or "Клиент"

    row = db.query(Client).filter(Client.phone == normalized_phone).first()
    if row is None:
        row = Client(
            full_name=normalized_name,
            phone=normalized_phone,
            responsible=responsible,
        )
        db.add(row)
        db.flush()
        return row

    changed = False
    if normalized_name and row.full_name != normalized_name:
        row.full_name = normalized_name
        changed = True
    if changed:
        row.responsible = responsible
        db.add(row)
        db.flush()
    return row


def request_uuid_or_400(request_id: str) -> UUID:
    try:
        return UUID(str(request_id))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Некорректный идентификатор заявки") from exc


def active_lawyer_or_400(db: Session, lawyer_id: str) -> AdminUser:
    try:
        lawyer_uuid = UUID(str(lawyer_id))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Некорректный идентификатор юриста") from exc
    lawyer = db.get(AdminUser, lawyer_uuid)
    if not lawyer or str(lawyer.role or "").upper() != "LAWYER" or not bool(lawyer.is_active):
        raise HTTPException(status_code=400, detail="Можно назначить только активного юриста")
    return lawyer


def ensure_lawyer_can_manage_request_or_403(admin: dict, req: Request) -> None:
    role = str(admin.get("role") or "").upper()
    if role != "LAWYER":
        return
    actor = str(admin.get("sub") or "").strip()
    if not actor:
        raise HTTPException(status_code=401, detail="Некорректный токен")
    assigned = str(req.assigned_lawyer_id or "").strip()
    if not actor or not assigned or actor != assigned:
        raise HTTPException(status_code=403, detail="Юрист может работать только со своими назначенными заявками")


def ensure_lawyer_can_view_request_or_403(admin: dict, req: Request) -> None:
    role = str(admin.get("role") or "").upper()
    if role != "LAWYER":
        return
    actor = str(admin.get("sub") or "").strip()
    if not actor:
        raise HTTPException(status_code=401, detail="Некорректный токен")
    assigned = str(req.assigned_lawyer_id or "").strip()
    if assigned and actor != assigned:
        raise HTTPException(status_code=403, detail="Юрист может видеть только свои и неназначенные заявки")
