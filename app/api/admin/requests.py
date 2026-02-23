from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import case, or_, update

from app.db.session import get_db
from app.core.deps import require_role
from app.schemas.universal import UniversalQuery
from app.schemas.admin import (
    RequestAdminCreate,
    RequestAdminPatch,
    RequestDataRequirementCreate,
    RequestDataRequirementPatch,
    RequestReassign,
)
from app.models.admin_user import AdminUser
from app.models.audit_log import AuditLog
from app.models.request_data_requirement import RequestDataRequirement
from app.models.request import Request
from app.models.topic_data_template import TopicDataTemplate
from app.services.notifications import (
    EVENT_STATUS as NOTIFICATION_EVENT_STATUS,
    mark_admin_notifications_read,
    notify_request_event,
)
from app.services.request_read_markers import EVENT_STATUS, clear_unread_for_lawyer, mark_unread_for_client
from app.services.request_status import actor_admin_uuid, apply_status_change_effects
from app.services.status_flow import transition_allowed_for_topic
from app.services.request_templates import validate_required_topic_fields_or_400
from app.services.billing_flow import apply_billing_transition_effects
from app.services.universal_query import apply_universal_query

router = APIRouter()
REQUEST_FINANCIAL_FIELDS = {"effective_rate", "invoice_amount", "paid_at", "paid_by_admin_id"}


def _request_uuid_or_400(request_id: str) -> UUID:
    try:
        return UUID(str(request_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Некорректный идентификатор заявки")


def _active_lawyer_or_400(db: Session, lawyer_id: str) -> AdminUser:
    try:
        lawyer_uuid = UUID(str(lawyer_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Некорректный идентификатор юриста")
    lawyer = db.get(AdminUser, lawyer_uuid)
    if not lawyer or str(lawyer.role or "").upper() != "LAWYER" or not bool(lawyer.is_active):
        raise HTTPException(status_code=400, detail="Можно назначить только активного юриста")
    return lawyer


def _ensure_lawyer_can_manage_request_or_403(admin: dict, req: Request) -> None:
    role = str(admin.get("role") or "").upper()
    if role != "LAWYER":
        return
    actor = str(admin.get("sub") or "").strip()
    if not actor:
        raise HTTPException(status_code=401, detail="Некорректный токен")
    assigned = str(req.assigned_lawyer_id or "").strip()
    if not actor or not assigned or actor != assigned:
        raise HTTPException(status_code=403, detail="Юрист может работать только со своими назначенными заявками")


def _ensure_lawyer_can_view_request_or_403(admin: dict, req: Request) -> None:
    role = str(admin.get("role") or "").upper()
    if role != "LAWYER":
        return
    actor = str(admin.get("sub") or "").strip()
    if not actor:
        raise HTTPException(status_code=401, detail="Некорректный токен")
    assigned = str(req.assigned_lawyer_id or "").strip()
    if assigned and actor != assigned:
        raise HTTPException(status_code=403, detail="Юрист может видеть только свои и неназначенные заявки")


def _request_data_requirement_row(row: RequestDataRequirement) -> dict:
    return {
        "id": str(row.id),
        "request_id": str(row.request_id),
        "topic_template_id": str(row.topic_template_id) if row.topic_template_id else None,
        "key": row.key,
        "label": row.label,
        "description": row.description,
        "required": bool(row.required),
        "created_by_admin_id": str(row.created_by_admin_id) if row.created_by_admin_id else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }

@router.post("/query")
def query_requests(uq: UniversalQuery, db: Session = Depends(get_db), admin=Depends(require_role("ADMIN","LAWYER"))):
    base_query = db.query(Request)
    role = str(admin.get("role") or "").upper()
    if role == "LAWYER":
        actor = str(admin.get("sub") or "").strip()
        if not actor:
            raise HTTPException(status_code=401, detail="Некорректный токен")
        base_query = base_query.filter(
            or_(
                Request.assigned_lawyer_id == actor,
                Request.assigned_lawyer_id.is_(None),
            )
        )

    q = apply_universal_query(base_query, Request, uq)
    total = q.count()
    rows = q.offset(uq.page.offset).limit(uq.page.limit).all()
    return {
        "rows": [
            {
                "id": str(r.id),
                "track_number": r.track_number,
                "status_code": r.status_code,
                "client_name": r.client_name,
                "client_phone": r.client_phone,
                "topic_code": r.topic_code,
                "effective_rate": float(r.effective_rate) if r.effective_rate is not None else None,
                "invoice_amount": float(r.invoice_amount) if r.invoice_amount is not None else None,
                "paid_at": r.paid_at.isoformat() if r.paid_at else None,
                "paid_by_admin_id": r.paid_by_admin_id,
                "client_has_unread_updates": r.client_has_unread_updates,
                "client_unread_event_type": r.client_unread_event_type,
                "lawyer_has_unread_updates": r.lawyer_has_unread_updates,
                "lawyer_unread_event_type": r.lawyer_unread_event_type,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            }
            for r in rows
        ],
        "total": total,
    }


@router.post("", status_code=201)
def create_request(payload: RequestAdminCreate, db: Session = Depends(get_db), admin=Depends(require_role("ADMIN", "LAWYER"))):
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
    assigned_lawyer_id = str(payload.assigned_lawyer_id or "").strip() or None
    effective_rate = payload.effective_rate
    if assigned_lawyer_id:
        assigned_lawyer = _active_lawyer_or_400(db, assigned_lawyer_id)
        assigned_lawyer_id = str(assigned_lawyer.id)
        if effective_rate is None:
            effective_rate = assigned_lawyer.default_rate
    row = Request(
        track_number=track,
        client_name=payload.client_name,
        client_phone=payload.client_phone,
        topic_code=payload.topic_code,
        status_code=payload.status_code,
        description=payload.description,
        extra_fields=payload.extra_fields,
        assigned_lawyer_id=assigned_lawyer_id,
        effective_rate=effective_rate,
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
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Заявка с таким номером уже существует")
    return {"id": str(row.id), "track_number": row.track_number}


@router.patch("/{request_id}")
def update_request(
    request_id: str,
    payload: RequestAdminPatch,
    db: Session = Depends(get_db),
    admin=Depends(require_role("ADMIN", "LAWYER")),
):
    request_uuid = _request_uuid_or_400(request_id)
    row = db.get(Request, request_uuid)
    if not row:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    _ensure_lawyer_can_manage_request_or_403(admin, row)
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
            assigned_lawyer = _active_lawyer_or_400(db, str(assigned_raw))
            changes["assigned_lawyer_id"] = str(assigned_lawyer.id)
            if row.effective_rate is None and "effective_rate" not in changes:
                changes["effective_rate"] = assigned_lawyer.default_rate
    old_status = str(row.status_code or "")
    responsible = str(admin.get("email") or "").strip() or "Администратор системы"
    for key, value in changes.items():
        setattr(row, key, value)
    if "status_code" in changes and str(changes.get("status_code") or "") != old_status:
        next_status = str(changes.get("status_code") or "")
        if not transition_allowed_for_topic(
            db,
            str(row.topic_code or "").strip() or None,
            old_status,
            next_status,
        ):
            raise HTTPException(status_code=400, detail="Переход статуса не разрешен для выбранной темы")
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
            body=(f"{old_status} -> {next_status}" + (f"\n{billing_note}" if billing_note else "")),
            responsible=responsible,
        )
    try:
        db.add(row)
        db.commit()
        db.refresh(row)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Заявка с таким номером уже существует")
    return {"status": "обновлено", "id": str(row.id), "track_number": row.track_number}


@router.delete("/{request_id}")
def delete_request(request_id: str, db: Session = Depends(get_db), admin=Depends(require_role("ADMIN", "LAWYER"))):
    request_uuid = _request_uuid_or_400(request_id)
    row = db.get(Request, request_uuid)
    if not row:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    _ensure_lawyer_can_manage_request_or_403(admin, row)
    db.delete(row)
    db.commit()
    return {"status": "удалено"}

@router.get("/{request_id}")
def get_request(request_id: str, db: Session = Depends(get_db), admin=Depends(require_role("ADMIN","LAWYER"))):
    request_uuid = _request_uuid_or_400(request_id)
    req = db.get(Request, request_uuid)
    if not req:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    _ensure_lawyer_can_view_request_or_403(admin, req)
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
        "client_name": req.client_name,
        "client_phone": req.client_phone,
        "topic_code": req.topic_code,
        "status_code": req.status_code,
        "description": req.description,
        "extra_fields": req.extra_fields,
        "assigned_lawyer_id": req.assigned_lawyer_id,
        "effective_rate": float(req.effective_rate) if req.effective_rate is not None else None,
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


@router.post("/{request_id}/claim")
def claim_request(request_id: str, db: Session = Depends(get_db), admin=Depends(require_role("LAWYER"))):
    request_uuid = _request_uuid_or_400(request_id)

    lawyer_sub = str(admin.get("sub") or "").strip()
    if not lawyer_sub:
        raise HTTPException(status_code=401, detail="Некорректный токен")
    try:
        lawyer_uuid = UUID(lawyer_sub)
    except ValueError:
        raise HTTPException(status_code=401, detail="Некорректный токен")

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


@router.post("/{request_id}/reassign")
def reassign_request(
    request_id: str,
    payload: RequestReassign,
    db: Session = Depends(get_db),
    admin=Depends(require_role("ADMIN")),
):
    request_uuid = _request_uuid_or_400(request_id)

    try:
        lawyer_uuid = UUID(str(payload.lawyer_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Некорректный идентификатор юриста")

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


@router.get("/{request_id}/data-template")
def get_request_data_template(
    request_id: str,
    db: Session = Depends(get_db),
    admin=Depends(require_role("ADMIN", "LAWYER")),
):
    request_uuid = _request_uuid_or_400(request_id)
    req = db.get(Request, request_uuid)
    if req is None:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    _ensure_lawyer_can_manage_request_or_403(admin, req)

    topic_items = (
        db.query(TopicDataTemplate)
        .filter(
            TopicDataTemplate.topic_code == str(req.topic_code or ""),
            TopicDataTemplate.enabled.is_(True),
        )
        .order_by(TopicDataTemplate.sort_order.asc(), TopicDataTemplate.key.asc())
        .all()
    )
    request_items = (
        db.query(RequestDataRequirement)
        .filter(RequestDataRequirement.request_id == req.id)
        .order_by(RequestDataRequirement.created_at.asc(), RequestDataRequirement.key.asc())
        .all()
    )
    return {
        "request_id": str(req.id),
        "topic_code": req.topic_code,
        "topic_items": [
            {
                "id": str(row.id),
                "key": row.key,
                "label": row.label,
                "description": row.description,
                "required": bool(row.required),
                "sort_order": row.sort_order,
            }
            for row in topic_items
        ],
        "request_items": [_request_data_requirement_row(row) for row in request_items],
    }


@router.post("/{request_id}/data-template/sync")
def sync_request_data_template_from_topic(
    request_id: str,
    db: Session = Depends(get_db),
    admin=Depends(require_role("ADMIN", "LAWYER")),
):
    request_uuid = _request_uuid_or_400(request_id)
    req = db.get(Request, request_uuid)
    if req is None:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    _ensure_lawyer_can_manage_request_or_403(admin, req)
    topic_code = str(req.topic_code or "").strip()
    if not topic_code:
        return {"status": "ok", "created": 0, "request_id": str(req.id)}

    topic_items = (
        db.query(TopicDataTemplate)
        .filter(
            TopicDataTemplate.topic_code == topic_code,
            TopicDataTemplate.enabled.is_(True),
        )
        .order_by(TopicDataTemplate.sort_order.asc(), TopicDataTemplate.key.asc())
        .all()
    )
    existing_keys = {
        str(key).strip()
        for (key,) in db.query(RequestDataRequirement.key).filter(RequestDataRequirement.request_id == req.id).all()
        if key
    }
    responsible = str(admin.get("email") or "").strip() or "Администратор системы"
    actor_id = actor_admin_uuid(admin)

    created = 0
    for template in topic_items:
        key = str(template.key or "").strip()
        if not key or key in existing_keys:
            continue
        db.add(
            RequestDataRequirement(
                request_id=req.id,
                topic_template_id=template.id,
                key=key,
                label=template.label,
                description=template.description,
                required=bool(template.required),
                created_by_admin_id=actor_id,
                responsible=responsible,
            )
        )
        existing_keys.add(key)
        created += 1

    db.commit()
    return {"status": "ok", "created": created, "request_id": str(req.id)}


@router.post("/{request_id}/data-template/items", status_code=201)
def create_request_data_requirement(
    request_id: str,
    payload: RequestDataRequirementCreate,
    db: Session = Depends(get_db),
    admin=Depends(require_role("ADMIN", "LAWYER")),
):
    request_uuid = _request_uuid_or_400(request_id)
    req = db.get(Request, request_uuid)
    if req is None:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    _ensure_lawyer_can_manage_request_or_403(admin, req)

    key = str(payload.key or "").strip()
    label = str(payload.label or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail='Поле "key" обязательно')
    if not label:
        raise HTTPException(status_code=400, detail='Поле "label" обязательно')

    exists = (
        db.query(RequestDataRequirement.id)
        .filter(RequestDataRequirement.request_id == req.id, RequestDataRequirement.key == key)
        .first()
    )
    if exists is not None:
        raise HTTPException(status_code=400, detail="Элемент с таким key уже существует в шаблоне заявки")

    row = RequestDataRequirement(
        request_id=req.id,
        topic_template_id=None,
        key=key,
        label=label,
        description=payload.description,
        required=bool(payload.required),
        created_by_admin_id=actor_admin_uuid(admin),
        responsible=str(admin.get("email") or "").strip() or "Администратор системы",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _request_data_requirement_row(row)


@router.patch("/{request_id}/data-template/items/{item_id}")
def update_request_data_requirement(
    request_id: str,
    item_id: str,
    payload: RequestDataRequirementPatch,
    db: Session = Depends(get_db),
    admin=Depends(require_role("ADMIN", "LAWYER")),
):
    request_uuid = _request_uuid_or_400(request_id)
    req = db.get(Request, request_uuid)
    if req is None:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    _ensure_lawyer_can_manage_request_or_403(admin, req)

    item_uuid = _request_uuid_or_400(item_id)
    row = db.get(RequestDataRequirement, item_uuid)
    if row is None or row.request_id != req.id:
        raise HTTPException(status_code=404, detail="Элемент шаблона заявки не найден")

    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="Нет полей для обновления")
    if "key" in changes:
        key = str(changes.get("key") or "").strip()
        if not key:
            raise HTTPException(status_code=400, detail='Поле "key" не может быть пустым')
        duplicate = (
            db.query(RequestDataRequirement.id)
            .filter(
                RequestDataRequirement.request_id == req.id,
                RequestDataRequirement.key == key,
                RequestDataRequirement.id != row.id,
            )
            .first()
        )
        if duplicate is not None:
            raise HTTPException(status_code=400, detail="Элемент с таким key уже существует в шаблоне заявки")
        row.key = key
    if "label" in changes:
        label = str(changes.get("label") or "").strip()
        if not label:
            raise HTTPException(status_code=400, detail='Поле "label" не может быть пустым')
        row.label = label
    if "description" in changes:
        row.description = changes.get("description")
    if "required" in changes:
        row.required = bool(changes.get("required"))
    row.responsible = str(admin.get("email") or "").strip() or "Администратор системы"

    db.add(row)
    db.commit()
    db.refresh(row)
    return _request_data_requirement_row(row)


@router.delete("/{request_id}/data-template/items/{item_id}")
def delete_request_data_requirement(
    request_id: str,
    item_id: str,
    db: Session = Depends(get_db),
    admin=Depends(require_role("ADMIN", "LAWYER")),
):
    request_uuid = _request_uuid_or_400(request_id)
    req = db.get(Request, request_uuid)
    if req is None:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    _ensure_lawyer_can_manage_request_or_403(admin, req)

    item_uuid = _request_uuid_or_400(item_id)
    row = db.get(RequestDataRequirement, item_uuid)
    if row is None or row.request_id != req.id:
        raise HTTPException(status_code=404, detail="Элемент шаблона заявки не найден")
    db.delete(row)
    db.commit()
    return {"status": "удалено", "id": str(row.id)}
