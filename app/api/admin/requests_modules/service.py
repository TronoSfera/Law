from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import case, func, or_, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.admin_user import AdminUser
from app.models.audit_log import AuditLog
from app.models.request import Request
from app.models.request_service_request import RequestServiceRequest
from app.schemas.admin import RequestAdminCreate, RequestAdminPatch
from app.schemas.universal import UniversalQuery
from app.services.billing_flow import apply_billing_transition_effects
from app.services.notifications import (
    EVENT_STATUS as NOTIFICATION_EVENT_STATUS,
    mark_admin_notifications_read,
    notify_request_event,
)
from app.services.request_read_markers import EVENT_STATUS, clear_unread_for_lawyer, mark_unread_for_client
from app.services.request_status import apply_status_change_effects
from app.services.request_templates import validate_required_topic_fields_or_400
from app.services.status_flow import transition_allowed_for_topic
from app.services.status_transition_requirements import validate_transition_requirements_or_400
from app.services.universal_query import apply_universal_query

from .common import normalize_important_date_or_default
from .permissions import (
    REQUEST_FINANCIAL_FIELDS,
    active_lawyer_or_400,
    client_for_request_payload_or_400,
    ensure_lawyer_can_manage_request_or_403,
    ensure_lawyer_can_view_request_or_403,
    request_uuid_or_400,
)
from .status_flow import apply_request_special_filters, split_request_special_filters


def query_requests_service(uq: UniversalQuery, db: Session, admin: dict) -> dict[str, Any]:
    base_query = db.query(Request)
    role = str(admin.get("role") or "").upper()
    actor = str(admin.get("sub") or "").strip()
    if role == "LAWYER":
        if not actor:
            raise HTTPException(status_code=401, detail="Некорректный токен")
        base_query = base_query.filter(
            or_(
                Request.assigned_lawyer_id == actor,
                Request.assigned_lawyer_id.is_(None),
            )
        )

    regular_uq, special_filters = split_request_special_filters(uq)
    base_query = apply_request_special_filters(
        base_query,
        db=db,
        role=role,
        actor_id=actor,
        special_filters=special_filters,
    )
    q = apply_universal_query(base_query, Request, regular_uq)
    total = q.count()
    rows = q.offset(uq.page.offset).limit(uq.page.limit).all()
    row_ids = [str(row.id) for row in rows if row and row.id]

    unread_service_requests_by_request: dict[str, int] = {}
    if row_ids:
        unread_query = (
            db.query(RequestServiceRequest.request_id, func.count(RequestServiceRequest.id))
            .filter(RequestServiceRequest.request_id.in_(row_ids))
        )
        if role == "LAWYER":
            unread_query = unread_query.filter(
                RequestServiceRequest.type == "CURATOR_CONTACT",
                RequestServiceRequest.assigned_lawyer_id == actor,
                RequestServiceRequest.lawyer_unread.is_(True),
            )
        else:
            unread_query = unread_query.filter(RequestServiceRequest.admin_unread.is_(True))
        unread_rows = unread_query.group_by(RequestServiceRequest.request_id).all()
        unread_service_requests_by_request = {str(request_id): int(count or 0) for request_id, count in unread_rows if request_id}

    return {
        "rows": [
            {
                "id": str(r.id),
                "track_number": r.track_number,
                "client_id": str(r.client_id) if r.client_id else None,
                "status_code": r.status_code,
                "client_name": r.client_name,
                "client_phone": r.client_phone,
                "topic_code": r.topic_code,
                "important_date_at": r.important_date_at.isoformat() if r.important_date_at else None,
                "effective_rate": float(r.effective_rate) if r.effective_rate is not None else None,
                "request_cost": float(r.request_cost) if r.request_cost is not None else None,
                "invoice_amount": float(r.invoice_amount) if r.invoice_amount is not None else None,
                "paid_at": r.paid_at.isoformat() if r.paid_at else None,
                "paid_by_admin_id": r.paid_by_admin_id,
                "client_has_unread_updates": r.client_has_unread_updates,
                "client_unread_event_type": r.client_unread_event_type,
                "lawyer_has_unread_updates": r.lawyer_has_unread_updates,
                "lawyer_unread_event_type": r.lawyer_unread_event_type,
                "service_requests_unread_count": int(unread_service_requests_by_request.get(str(r.id), 0)),
                "has_service_requests_unread": bool(unread_service_requests_by_request.get(str(r.id), 0)),
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            }
            for r in rows
        ],
        "total": total,
    }


def create_request_service(payload: RequestAdminCreate, db: Session, admin: dict) -> dict[str, Any]:
    actor_role = str(admin.get("role") or "").upper()
    if actor_role == "LAWYER" and str(payload.assigned_lawyer_id or "").strip():
        raise HTTPException(status_code=403, detail="Юрист не может назначать заявку при создании")
    if actor_role == "LAWYER":
        forbidden_fields = sorted(REQUEST_FINANCIAL_FIELDS.intersection(set(payload.model_fields_set)))
        if forbidden_fields:
            raise HTTPException(status_code=403, detail="Юрист не может изменять финансовые поля заявки")
    validate_required_topic_fields_or_400(db, payload.topic_code, payload.extra_fields)
    track = payload.track_number or f"TRK-{uuid4().hex[:10].upper()}"
    responsible = str(admin.get("email") or "").strip() or "Администратор системы"
    client = client_for_request_payload_or_400(
        db,
        client_id=payload.client_id,
        client_name=payload.client_name,
        client_phone=payload.client_phone,
        responsible=responsible,
    )
    assigned_lawyer_id = str(payload.assigned_lawyer_id or "").strip() or None
    effective_rate = payload.effective_rate
    if assigned_lawyer_id:
        assigned_lawyer = active_lawyer_or_400(db, assigned_lawyer_id)
        assigned_lawyer_id = str(assigned_lawyer.id)
        if effective_rate is None:
            effective_rate = assigned_lawyer.default_rate
    row = Request(
        track_number=track,
        client_id=client.id,
        client_name=client.full_name,
        client_phone=client.phone,
        topic_code=payload.topic_code,
        status_code=payload.status_code,
        important_date_at=payload.important_date_at,
        description=payload.description,
        extra_fields=payload.extra_fields,
        assigned_lawyer_id=assigned_lawyer_id,
        effective_rate=effective_rate,
        request_cost=payload.request_cost,
        invoice_amount=payload.invoice_amount,
        paid_at=payload.paid_at,
        paid_by_admin_id=payload.paid_by_admin_id,
        total_attachments_bytes=payload.total_attachments_bytes,
        responsible=responsible,
    )
    try:
        db.add(row)
        db.commit()
        db.refresh(row)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Заявка с таким номером уже существует") from exc
    return {"id": str(row.id), "track_number": row.track_number}


def update_request_service(request_id: str, payload: RequestAdminPatch, db: Session, admin: dict) -> dict[str, Any]:
    request_uuid = request_uuid_or_400(request_id)
    row = db.get(Request, request_uuid)
    if not row:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    ensure_lawyer_can_manage_request_or_403(admin, row)
    changes = payload.model_dump(exclude_unset=True)
    actor_role = str(admin.get("role") or "").upper()
    if actor_role == "LAWYER":
        if "assigned_lawyer_id" in changes:
            raise HTTPException(status_code=403, detail='Назначение доступно только через действие "Взять в работу"')
        forbidden_fields = sorted(REQUEST_FINANCIAL_FIELDS.intersection(set(changes.keys())))
        if forbidden_fields:
            raise HTTPException(status_code=403, detail="Юрист не может изменять финансовые поля заявки")
    if actor_role == "ADMIN" and "assigned_lawyer_id" in changes:
        assigned_raw = changes.get("assigned_lawyer_id")
        if assigned_raw is None or not str(assigned_raw).strip():
            changes["assigned_lawyer_id"] = None
        else:
            assigned_lawyer = active_lawyer_or_400(db, str(assigned_raw))
            changes["assigned_lawyer_id"] = str(assigned_lawyer.id)
            if row.effective_rate is None and "effective_rate" not in changes:
                changes["effective_rate"] = assigned_lawyer.default_rate
    old_status = str(row.status_code or "")
    responsible = str(admin.get("email") or "").strip() or "Администратор системы"
    if {"client_id", "client_name", "client_phone"}.intersection(set(changes.keys())):
        client = client_for_request_payload_or_400(
            db,
            client_id=changes.get("client_id", row.client_id),
            client_name=changes.get("client_name", row.client_name),
            client_phone=changes.get("client_phone", row.client_phone),
            responsible=responsible,
        )
        changes["client_id"] = client.id
        changes["client_name"] = client.full_name
        changes["client_phone"] = client.phone
    status_changed = "status_code" in changes and str(changes.get("status_code") or "") != old_status
    if status_changed and ("important_date_at" not in changes or changes.get("important_date_at") is None):
        changes["important_date_at"] = normalize_important_date_or_default(None)
    if status_changed:
        next_status = str(changes.get("status_code") or "").strip()
        if not transition_allowed_for_topic(
            db,
            str(row.topic_code or "").strip() or None,
            old_status,
            next_status,
        ):
            raise HTTPException(status_code=400, detail="Переход статуса не разрешен для выбранной темы")
        extra_fields_override = changes.get("extra_fields")
        validate_transition_requirements_or_400(
            db,
            row,
            old_status,
            next_status,
            extra_fields_override=extra_fields_override if isinstance(extra_fields_override, dict) else None,
        )
    for key, value in changes.items():
        setattr(row, key, value)
    if status_changed:
        next_status = str(changes.get("status_code") or "")
        important_date_at = row.important_date_at
        billing_note = apply_billing_transition_effects(
            db,
            req=row,
            from_status=old_status,
            to_status=next_status,
            admin=admin,
            responsible=responsible,
        )
        mark_unread_for_client(row, EVENT_STATUS)
        apply_status_change_effects(
            db,
            row,
            from_status=old_status,
            to_status=next_status,
            admin=admin,
            responsible=responsible,
        )
        notify_request_event(
            db,
            request=row,
            event_type=NOTIFICATION_EVENT_STATUS,
            actor_role=str(admin.get("role") or "").upper() or "ADMIN",
            actor_admin_user_id=admin.get("sub"),
            body=(
                f"{old_status} -> {next_status}"
                + (f"\nВажная дата: {important_date_at.isoformat()}" if important_date_at else "")
                + (f"\n{billing_note}" if billing_note else "")
            ),
            responsible=responsible,
        )
    try:
        db.add(row)
        db.commit()
        db.refresh(row)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Заявка с таким номером уже существует") from exc
    return {"status": "обновлено", "id": str(row.id), "track_number": row.track_number}


def delete_request_service(request_id: str, db: Session, admin: dict) -> dict[str, Any]:
    request_uuid = request_uuid_or_400(request_id)
    row = db.get(Request, request_uuid)
    if not row:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    ensure_lawyer_can_manage_request_or_403(admin, row)
    db.delete(row)
    db.commit()
    return {"status": "удалено"}


def get_request_service(request_id: str, db: Session, admin: dict) -> dict[str, Any]:
    request_uuid = request_uuid_or_400(request_id)
    req = db.get(Request, request_uuid)
    if not req:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    ensure_lawyer_can_view_request_or_403(admin, req)
    changed = False
    if str(admin.get("role") or "").upper() == "LAWYER" and clear_unread_for_lawyer(req):
        changed = True
        db.add(req)
    read_count = mark_admin_notifications_read(
        db,
        admin_user_id=admin.get("sub"),
        request_id=req.id,
        responsible=str(admin.get("email") or "").strip() or "Администратор системы",
    )
    if read_count:
        changed = True
    if changed:
        db.commit()
        db.refresh(req)
    return {
        "id": str(req.id),
        "track_number": req.track_number,
        "client_id": str(req.client_id) if req.client_id else None,
        "client_name": req.client_name,
        "client_phone": req.client_phone,
        "topic_code": req.topic_code,
        "status_code": req.status_code,
        "important_date_at": req.important_date_at.isoformat() if req.important_date_at else None,
        "description": req.description,
        "extra_fields": req.extra_fields,
        "assigned_lawyer_id": req.assigned_lawyer_id,
        "effective_rate": float(req.effective_rate) if req.effective_rate is not None else None,
        "request_cost": float(req.request_cost) if req.request_cost is not None else None,
        "invoice_amount": float(req.invoice_amount) if req.invoice_amount is not None else None,
        "paid_at": req.paid_at.isoformat() if req.paid_at else None,
        "paid_by_admin_id": req.paid_by_admin_id,
        "total_attachments_bytes": req.total_attachments_bytes,
        "client_has_unread_updates": req.client_has_unread_updates,
        "client_unread_event_type": req.client_unread_event_type,
        "lawyer_has_unread_updates": req.lawyer_has_unread_updates,
        "lawyer_unread_event_type": req.lawyer_unread_event_type,
        "created_at": req.created_at.isoformat() if req.created_at else None,
        "updated_at": req.updated_at.isoformat() if req.updated_at else None,
    }


def claim_request_service(request_id: str, db: Session, admin: dict) -> dict[str, Any]:
    request_uuid = request_uuid_or_400(request_id)

    lawyer_sub = str(admin.get("sub") or "").strip()
    if not lawyer_sub:
        raise HTTPException(status_code=401, detail="Некорректный токен")
    try:
        lawyer_uuid = UUID(lawyer_sub)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Некорректный токен") from exc

    lawyer = db.get(AdminUser, lawyer_uuid)
    if not lawyer or str(lawyer.role or "").upper() != "LAWYER" or not bool(lawyer.is_active):
        raise HTTPException(status_code=403, detail="Доступно только активному юристу")

    now = datetime.now(timezone.utc)
    responsible = str(admin.get("email") or "").strip() or "Администратор системы"

    stmt = (
        update(Request)
        .where(Request.id == request_uuid, Request.assigned_lawyer_id.is_(None))
        .values(
            assigned_lawyer_id=str(lawyer_uuid),
            effective_rate=case((Request.effective_rate.is_(None), lawyer.default_rate), else_=Request.effective_rate),
            updated_at=now,
            responsible=responsible,
        )
    )

    try:
        updated_rows = db.execute(stmt).rowcount or 0
        if updated_rows == 0:
            existing = db.get(Request, request_uuid)
            if existing is None:
                db.rollback()
                raise HTTPException(status_code=404, detail="Заявка не найдена")
            db.rollback()
            raise HTTPException(status_code=409, detail="Заявка уже назначена")

        db.add(
            AuditLog(
                actor_admin_id=lawyer_uuid,
                entity="requests",
                entity_id=str(request_uuid),
                action="MANUAL_CLAIM",
                diff={"assigned_lawyer_id": str(lawyer_uuid)},
            )
        )
        db.commit()
    except HTTPException:
        raise
    except Exception:
        db.rollback()
        raise

    row = db.get(Request, request_uuid)
    if row is None:
        raise HTTPException(status_code=404, detail="Заявка не найдена")

    return {
        "status": "claimed",
        "id": str(row.id),
        "track_number": row.track_number,
        "assigned_lawyer_id": row.assigned_lawyer_id,
    }


def reassign_request_service(request_id: str, lawyer_id: str, db: Session, admin: dict) -> dict[str, Any]:
    request_uuid = request_uuid_or_400(request_id)

    try:
        lawyer_uuid = UUID(str(lawyer_id))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Некорректный идентификатор юриста") from exc

    target_lawyer = db.get(AdminUser, lawyer_uuid)
    if not target_lawyer or str(target_lawyer.role or "").upper() != "LAWYER" or not bool(target_lawyer.is_active):
        raise HTTPException(status_code=400, detail="Можно переназначить только на активного юриста")

    req = db.get(Request, request_uuid)
    if req is None:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    if req.assigned_lawyer_id is None:
        raise HTTPException(status_code=400, detail="Заявка не назначена")
    if str(req.assigned_lawyer_id) == str(lawyer_uuid):
        raise HTTPException(status_code=400, detail="Заявка уже назначена на выбранного юриста")

    old_assigned = str(req.assigned_lawyer_id)
    now = datetime.now(timezone.utc)
    responsible = str(admin.get("email") or "").strip() or "Администратор системы"
    admin_actor_id = None
    try:
        admin_actor_id = UUID(str(admin.get("sub") or ""))
    except ValueError:
        admin_actor_id = None

    stmt = (
        update(Request)
        .where(Request.id == request_uuid, Request.assigned_lawyer_id == old_assigned)
        .values(
            assigned_lawyer_id=str(lawyer_uuid),
            effective_rate=case((Request.effective_rate.is_(None), target_lawyer.default_rate), else_=Request.effective_rate),
            updated_at=now,
            responsible=responsible,
        )
    )

    try:
        updated_rows = db.execute(stmt).rowcount or 0
        if updated_rows == 0:
            db.rollback()
            raise HTTPException(status_code=409, detail="Заявка уже была переназначена")

        db.add(
            AuditLog(
                actor_admin_id=admin_actor_id,
                entity="requests",
                entity_id=str(request_uuid),
                action="MANUAL_REASSIGN",
                diff={"from_lawyer_id": old_assigned, "to_lawyer_id": str(lawyer_uuid)},
            )
        )
        db.commit()
    except HTTPException:
        raise
    except Exception:
        db.rollback()
        raise

    row = db.get(Request, request_uuid)
    if row is None:
        raise HTTPException(status_code=404, detail="Заявка не найдена")

    return {
        "status": "reassigned",
        "id": str(row.id),
        "track_number": row.track_number,
        "from_lawyer_id": old_assigned,
        "assigned_lawyer_id": row.assigned_lawyer_id,
    }
