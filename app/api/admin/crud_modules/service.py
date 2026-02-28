from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.admin_user import AdminUser
from app.models.attachment import Attachment
from app.models.message import Message
from app.models.request import Request
from app.models.request_service_request import RequestServiceRequest
from app.models.table_availability import TableAvailability
from app.schemas.universal import UniversalQuery
from app.services.billing_flow import apply_billing_transition_effects
from app.services.notifications import (
    EVENT_ASSIGNMENT as NOTIFICATION_EVENT_ASSIGNMENT,
    EVENT_ATTACHMENT as NOTIFICATION_EVENT_ATTACHMENT,
    EVENT_MESSAGE as NOTIFICATION_EVENT_MESSAGE,
    EVENT_REASSIGNMENT as NOTIFICATION_EVENT_REASSIGNMENT,
    EVENT_STATUS as NOTIFICATION_EVENT_STATUS,
    mark_admin_notifications_read,
    notify_request_event,
)
from app.services.request_read_markers import (
    EVENT_ASSIGNMENT,
    EVENT_ATTACHMENT,
    EVENT_MESSAGE,
    EVENT_REASSIGNMENT,
    EVENT_STATUS,
    clear_unread_for_lawyer,
    mark_unread_for_client,
    mark_unread_for_lawyer,
)
from app.services.request_status import apply_status_change_effects
from app.services.request_templates import validate_required_topic_fields_or_400
from app.services.status_flow import transition_allowed_for_topic
from app.services.status_transition_requirements import validate_transition_requirements_or_400
from app.services.universal_query import apply_universal_query

from .access import (
    REQUEST_FINANCIAL_FIELDS,
    _ensure_lawyer_can_manage_request_or_403,
    _ensure_lawyer_can_view_request_or_403,
    _is_lawyer,
    _lawyer_actor_id_or_401,
    _request_for_related_row_or_404,
    _require_table_action,
    _resolve_table_model,
)
from .audit import _actor_role, _append_audit, _integrity_error, _resolve_responsible, _strip_hidden_fields
from .meta import (
    _columns_map,
    _meta_tables_payload,
    _row_to_dict,
    _serialize_value,
    _table_availability_map,
)
from .payloads import (
    _active_lawyer_or_400,
    _apply_admin_user_fields_for_update,
    _apply_admin_user_topics_fields,
    _apply_auto_fields_for_create,
    _apply_request_data_requirements_fields,
    _apply_request_data_template_items_fields,
    _apply_request_data_templates_fields,
    _apply_status_fields,
    _apply_topic_data_templates_fields,
    _apply_topic_required_fields_fields,
    _apply_topic_status_transitions_fields,
    _load_row_or_404,
    _parse_uuid_or_400,
    _prepare_create_payload,
    _request_for_uuid_or_400,
    _sanitize_payload,
    _upsert_client_or_400,
)


def _apply_create_side_effects(db: Session, *, table_name: str, row: Any, admin: dict) -> None:
    if table_name == "messages" and isinstance(row, Message):
        req = db.get(Request, row.request_id)
        if req is None:
            return
        author_type = str(row.author_type or "").strip().upper()
        if author_type == "CLIENT":
            mark_unread_for_lawyer(req, EVENT_MESSAGE)
            responsible = "Клиент"
            actor_role = "CLIENT"
            actor_admin_user_id = None
        else:
            mark_unread_for_client(req, EVENT_MESSAGE)
            responsible = _resolve_responsible(admin)
            actor_role = _actor_role(admin)
            actor_admin_user_id = admin.get("sub")
        req.responsible = responsible
        db.add(req)
        notify_request_event(
            db,
            request=req,
            event_type=NOTIFICATION_EVENT_MESSAGE,
            actor_role=actor_role,
            actor_admin_user_id=actor_admin_user_id,
            body=str(row.body or "").strip() or None,
            responsible=responsible,
        )
        return

    if table_name == "attachments" and isinstance(row, Attachment):
        req = db.get(Request, row.request_id)
        if req is None:
            return
        mark_unread_for_client(req, EVENT_ATTACHMENT)
        responsible = _resolve_responsible(admin)
        req.responsible = responsible
        db.add(req)
        notify_request_event(
            db,
            request=req,
            event_type=NOTIFICATION_EVENT_ATTACHMENT,
            actor_role=_actor_role(admin),
            actor_admin_user_id=admin.get("sub"),
            body=f"Файл: {row.file_name}",
            responsible=responsible,
        )
        return

    if table_name == "requests" and isinstance(row, Request):
        assigned = str(row.assigned_lawyer_id or "").strip()
        if not assigned:
            return
        mark_unread_for_client(row, EVENT_ASSIGNMENT)
        mark_unread_for_lawyer(row, EVENT_ASSIGNMENT)
        responsible = _resolve_responsible(admin)
        row.responsible = responsible
        db.add(row)
        notify_request_event(
            db,
            request=row,
            event_type=NOTIFICATION_EVENT_ASSIGNMENT,
            actor_role=_actor_role(admin),
            actor_admin_user_id=admin.get("sub"),
            body=f"Назначен юрист: {assigned}",
            responsible=responsible,
        )


def list_tables_meta_service(db: Session, admin: dict) -> dict[str, Any]:
    role = str(admin.get("role") or "").upper()
    if role != "ADMIN":
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    return {"tables": _meta_tables_payload(db, role=role, include_inactive_dictionaries=False)}


def list_available_tables_service(db: Session, admin: dict) -> dict[str, Any]:
    role = str(admin.get("role") or "").upper()
    if role != "ADMIN":
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    availability = _table_availability_map(db)
    rows = []
    for item in _meta_tables_payload(db, role=role, include_inactive_dictionaries=True):
        table_name = str(item.get("table") or "")
        state = availability.get(table_name)
        rows.append(
            {
                "table": table_name,
                "label": item.get("label"),
                "section": item.get("section"),
                "is_active": bool(item.get("is_active")),
                "responsible": state.responsible if state is not None else None,
                "updated_at": _serialize_value(state.updated_at) if state is not None else None,
            }
        )
    return {"rows": rows, "total": len(rows)}


def update_available_table_service(table_name: str, is_active: bool, db: Session, admin: dict) -> dict[str, Any]:
    role = str(admin.get("role") or "").upper()
    if role != "ADMIN":
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    normalized, _ = _resolve_table_model(table_name)
    row = db.query(TableAvailability).filter(TableAvailability.table_name == normalized).first()
    responsible = _resolve_responsible(admin)
    next_is_active = bool(is_active)
    if row is None:
        row = TableAvailability(
            table_name=normalized,
            is_active=next_is_active,
            responsible=responsible,
        )
        db.add(row)
    else:
        row.is_active = next_is_active
        row.updated_at = datetime.now(timezone.utc)
        row.responsible = responsible
        db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "table": normalized,
        "is_active": bool(row.is_active),
        "responsible": row.responsible,
        "updated_at": _serialize_value(row.updated_at),
    }


def query_table_service(table_name: str, uq: UniversalQuery, db: Session, admin: dict) -> dict[str, Any]:
    normalized, model = _resolve_table_model(table_name)
    _require_table_action(admin, normalized, "query")
    base_query = db.query(model)
    if normalized == "requests" and _is_lawyer(admin):
        actor_id = _lawyer_actor_id_or_401(admin)
        base_query = base_query.filter(
            or_(
                Request.assigned_lawyer_id == actor_id,
                Request.assigned_lawyer_id.is_(None),
            )
        )
    if normalized == "messages" and _is_lawyer(admin):
        actor_id = _lawyer_actor_id_or_401(admin)
        base_query = base_query.join(Request, Request.id == Message.request_id).filter(
            or_(
                Request.assigned_lawyer_id == actor_id,
                Request.assigned_lawyer_id.is_(None),
            )
        )
    if normalized == "attachments" and _is_lawyer(admin):
        actor_id = _lawyer_actor_id_or_401(admin)
        base_query = base_query.join(Request, Request.id == Attachment.request_id).filter(
            or_(
                Request.assigned_lawyer_id == actor_id,
                Request.assigned_lawyer_id.is_(None),
            )
        )
    if normalized == "request_service_requests" and _is_lawyer(admin):
        actor_id = _lawyer_actor_id_or_401(admin)
        base_query = base_query.filter(
            RequestServiceRequest.type == "CURATOR_CONTACT",
            RequestServiceRequest.assigned_lawyer_id == actor_id,
        )
    query = apply_universal_query(base_query, model, uq)
    total = query.count()
    rows = query.offset(uq.page.offset).limit(uq.page.limit).all()
    return {"rows": [_strip_hidden_fields(normalized, _row_to_dict(row)) for row in rows], "total": total}


def get_row_service(table_name: str, row_id: str, db: Session, admin: dict) -> dict[str, Any]:
    normalized, model = _resolve_table_model(table_name)
    _require_table_action(admin, normalized, "read")
    row = _load_row_or_404(db, model, row_id)
    if normalized == "requests":
        req = row if isinstance(row, Request) else None
        if req is not None:
            _ensure_lawyer_can_view_request_or_403(admin, req)
            changed = False
            if _is_lawyer(admin) and clear_unread_for_lawyer(req):
                changed = True
                db.add(req)
            read_count = mark_admin_notifications_read(
                db,
                admin_user_id=admin.get("sub"),
                request_id=req.id,
                responsible=_resolve_responsible(admin),
            )
            if read_count:
                changed = True
            if changed:
                db.commit()
                db.refresh(req)
                row = req
    if normalized == "messages" and isinstance(row, Message):
        req = _request_for_related_row_or_404(db, row)
        _ensure_lawyer_can_view_request_or_403(admin, req)
    if normalized == "attachments" and isinstance(row, Attachment):
        req = _request_for_related_row_or_404(db, row)
        _ensure_lawyer_can_view_request_or_403(admin, req)
    if normalized == "request_service_requests" and _is_lawyer(admin):
        actor_id = _lawyer_actor_id_or_401(admin)
        row_type = str(getattr(row, "type", "") or "").strip().upper()
        assigned = str(getattr(row, "assigned_lawyer_id", "") or "").strip()
        if row_type != "CURATOR_CONTACT" or not assigned or assigned != actor_id:
            raise HTTPException(status_code=403, detail="Недостаточно прав")
    payload = _strip_hidden_fields(normalized, _row_to_dict(row))
    if normalized == "requests" and isinstance(row, Request):
        assigned_lawyer_id = str(row.assigned_lawyer_id or "").strip()
        if assigned_lawyer_id:
            try:
                lawyer_uuid = uuid.UUID(assigned_lawyer_id)
            except ValueError:
                lawyer_uuid = None
            if lawyer_uuid is not None:
                lawyer = db.get(AdminUser, lawyer_uuid)
                if lawyer is not None:
                    payload["assigned_lawyer_name"] = lawyer.name or lawyer.email or assigned_lawyer_id
                    payload["assigned_lawyer_phone"] = _serialize_value(getattr(lawyer, "phone", None))
    return payload


def create_row_service(table_name: str, payload: dict[str, Any], db: Session, admin: dict) -> dict[str, Any]:
    normalized, model = _resolve_table_model(table_name)
    _require_table_action(admin, normalized, "create")
    responsible = _resolve_responsible(admin)
    resolved_request_client_id: uuid.UUID | None = None
    resolved_invoice_client_id: uuid.UUID | None = None
    if normalized == "requests" and _is_lawyer(admin) and isinstance(payload, dict):
        assigned_lawyer_id = payload.get("assigned_lawyer_id")
        if str(assigned_lawyer_id or "").strip():
            raise HTTPException(status_code=403, detail='Юрист не может назначать заявку при создании')
        forbidden_fields = sorted(REQUEST_FINANCIAL_FIELDS.intersection(set(payload.keys())))
        if forbidden_fields:
            raise HTTPException(status_code=403, detail="Юрист не может изменять финансовые поля заявки")

    prepared = _prepare_create_payload(normalized, payload)
    if normalized == "messages":
        request_uuid = _parse_uuid_or_400(prepared.get("request_id"), "request_id")
        req = db.get(Request, request_uuid)
        if req is None:
            raise HTTPException(status_code=404, detail="Заявка не найдена")
        if _is_lawyer(admin):
            _ensure_lawyer_can_manage_request_or_403(admin, req)
            prepared["author_type"] = "LAWYER"
            prepared["author_name"] = str(admin.get("email") or "").strip() or "Юрист"
            prepared["immutable"] = False
        prepared["request_id"] = request_uuid
    if normalized == "requests":
        validate_required_topic_fields_or_400(db, prepared.get("topic_code"), prepared.get("extra_fields"))
        client = _upsert_client_or_400(
            db,
            full_name=prepared.get("client_name"),
            phone=prepared.get("client_phone"),
            responsible=responsible,
        )
        resolved_request_client_id = client.id
        prepared["client_name"] = client.full_name
        prepared["client_phone"] = client.phone
        if not _is_lawyer(admin):
            assigned_raw = prepared.get("assigned_lawyer_id")
            if assigned_raw is None or not str(assigned_raw).strip():
                if "assigned_lawyer_id" in prepared:
                    prepared["assigned_lawyer_id"] = None
            else:
                assigned_lawyer = _active_lawyer_or_400(db, assigned_raw)
                prepared["assigned_lawyer_id"] = str(assigned_lawyer.id)
                if prepared.get("effective_rate") is None:
                    prepared["effective_rate"] = assigned_lawyer.default_rate
    if normalized == "invoices":
        req = _request_for_uuid_or_400(db, prepared.get("request_id"))
        prepared["request_id"] = req.id
        resolved_invoice_client_id = req.client_id
    prepared = _apply_auto_fields_for_create(db, model, normalized, prepared)
    clean_payload = _sanitize_payload(
        model,
        normalized,
        prepared,
        is_update=False,
        allow_protected_fields={"password_hash"} if normalized == "admin_users" else None,
    )
    if normalized == "admin_user_topics":
        clean_payload = _apply_admin_user_topics_fields(db, clean_payload)
    if normalized == "topic_required_fields":
        clean_payload = _apply_topic_required_fields_fields(db, clean_payload)
    if normalized == "topic_data_templates":
        clean_payload = _apply_topic_data_templates_fields(db, clean_payload)
    if normalized == "request_data_templates":
        clean_payload = _apply_request_data_templates_fields(db, clean_payload)
    if normalized == "request_data_template_items":
        clean_payload = _apply_request_data_template_items_fields(db, clean_payload)
    if normalized == "request_data_requirements":
        clean_payload = _apply_request_data_requirements_fields(db, clean_payload)
    if normalized == "topic_status_transitions":
        clean_payload = _apply_topic_status_transitions_fields(db, clean_payload)
    if normalized == "statuses":
        clean_payload = _apply_status_fields(db, clean_payload)
    if normalized == "requests":
        clean_payload["client_id"] = resolved_request_client_id
    if normalized == "invoices":
        clean_payload["client_id"] = resolved_invoice_client_id
    if "responsible" in _columns_map(model):
        clean_payload["responsible"] = responsible
    row = model(**clean_payload)

    try:
        db.add(row)
        db.flush()
        _apply_create_side_effects(db, table_name=normalized, row=row, admin=admin)
        snapshot = _row_to_dict(row)
        _append_audit(db, admin, normalized, str(snapshot.get("id") or ""), "CREATE", {"after": snapshot})
        db.commit()
        db.refresh(row)
    except IntegrityError:
        db.rollback()
        raise _integrity_error()

    return _strip_hidden_fields(normalized, _row_to_dict(row))


def update_row_service(table_name: str, row_id: str, payload: dict[str, Any], db: Session, admin: dict) -> dict[str, Any]:
    normalized, model = _resolve_table_model(table_name)
    _require_table_action(admin, normalized, "update")
    responsible = _resolve_responsible(admin)
    if normalized == "requests" and _is_lawyer(admin) and isinstance(payload, dict):
        if "assigned_lawyer_id" in payload:
            raise HTTPException(status_code=403, detail='Назначение доступно только через действие "Взять в работу"')
        forbidden_fields = sorted(REQUEST_FINANCIAL_FIELDS.intersection(set(payload.keys())))
        if forbidden_fields:
            raise HTTPException(status_code=403, detail="Юрист не может изменять финансовые поля заявки")
    row = _load_row_or_404(db, model, row_id)
    if normalized == "requests" and isinstance(row, Request):
        _ensure_lawyer_can_manage_request_or_403(admin, row)
    if normalized in {"messages", "attachments"} and bool(getattr(row, "immutable", False)):
        raise HTTPException(status_code=400, detail="Запись зафиксирована и недоступна для редактирования")
    prepared = dict(payload)
    if normalized == "admin_users":
        prepared = _apply_admin_user_fields_for_update(prepared)
    clean_payload = _sanitize_payload(
        model,
        normalized,
        prepared,
        is_update=True,
        allow_protected_fields={"password_hash"} if normalized == "admin_users" else None,
    )
    if normalized == "admin_user_topics":
        clean_payload = _apply_admin_user_topics_fields(db, clean_payload)
    if normalized == "topic_required_fields":
        clean_payload = _apply_topic_required_fields_fields(db, clean_payload)
    if normalized == "topic_data_templates":
        clean_payload = _apply_topic_data_templates_fields(db, clean_payload)
    if normalized == "request_data_templates":
        clean_payload = _apply_request_data_templates_fields(db, clean_payload)
    if normalized == "request_data_template_items":
        clean_payload = _apply_request_data_template_items_fields(db, clean_payload)
    if normalized == "request_data_requirements":
        clean_payload = _apply_request_data_requirements_fields(db, clean_payload)
    if normalized == "topic_status_transitions":
        clean_payload = _apply_topic_status_transitions_fields(db, clean_payload)
    if normalized == "statuses":
        clean_payload = _apply_status_fields(db, clean_payload)
    if normalized == "requests" and isinstance(row, Request):
        if {"client_name", "client_phone"}.intersection(set(clean_payload.keys())) or row.client_id is None:
            client = _upsert_client_or_400(
                db,
                full_name=clean_payload.get("client_name", row.client_name),
                phone=clean_payload.get("client_phone", row.client_phone),
                responsible=responsible,
            )
            clean_payload["client_id"] = client.id
            clean_payload["client_name"] = client.full_name
            clean_payload["client_phone"] = client.phone
    if normalized == "invoices":
        if "request_id" in clean_payload:
            req = _request_for_uuid_or_400(db, clean_payload.get("request_id"))
            clean_payload["request_id"] = req.id
            clean_payload["client_id"] = req.client_id
        elif getattr(row, "client_id", None) is None:
            req = db.get(Request, getattr(row, "request_id", None))
            if req is not None:
                clean_payload["client_id"] = req.client_id
    if normalized == "requests" and not _is_lawyer(admin) and "assigned_lawyer_id" in clean_payload:
        assigned_raw = clean_payload.get("assigned_lawyer_id")
        if assigned_raw is None or not str(assigned_raw).strip():
            clean_payload["assigned_lawyer_id"] = None
        else:
            assigned_lawyer = _active_lawyer_or_400(db, assigned_raw)
            clean_payload["assigned_lawyer_id"] = str(assigned_lawyer.id)
            if isinstance(row, Request) and row.effective_rate is None and "effective_rate" not in clean_payload:
                clean_payload["effective_rate"] = assigned_lawyer.default_rate
    if "responsible" in _columns_map(model):
        clean_payload["responsible"] = responsible
    before = _row_to_dict(row)
    before_assigned_lawyer_id = str(before.get("assigned_lawyer_id") or "").strip() if normalized == "requests" else ""
    if normalized == "topic_status_transitions":
        next_from = str(clean_payload.get("from_status", before.get("from_status") or "")).strip()
        next_to = str(clean_payload.get("to_status", before.get("to_status") or "")).strip()
        if next_from and next_to and next_from == next_to:
            raise HTTPException(status_code=400, detail='Поля "from_status" и "to_status" не должны совпадать')
    if normalized == "requests" and "status_code" in clean_payload:
        before_status = str(before.get("status_code") or "")
        after_status = str(clean_payload.get("status_code") or "")
        if before_status != after_status and isinstance(row, Request):
            if not transition_allowed_for_topic(
                db,
                str(row.topic_code or "").strip() or None,
                before_status,
                after_status,
            ):
                raise HTTPException(status_code=400, detail="Переход статуса не разрешен для выбранной темы")
            extra_fields_override = clean_payload.get("extra_fields")
            validate_transition_requirements_or_400(
                db,
                row,
                before_status,
                after_status,
                extra_fields_override=extra_fields_override if isinstance(extra_fields_override, dict) else None,
            )
            if "important_date_at" not in clean_payload or clean_payload.get("important_date_at") is None:
                clean_payload["important_date_at"] = datetime.now(timezone.utc) + timedelta(days=3)
            billing_note = apply_billing_transition_effects(
                db,
                req=row,
                from_status=before_status,
                to_status=after_status,
                admin=admin,
                responsible=responsible,
            )
            mark_unread_for_client(row, EVENT_STATUS)
            apply_status_change_effects(
                db,
                row,
                from_status=before_status,
                to_status=after_status,
                admin=admin,
                important_date_at=clean_payload.get("important_date_at"),
                responsible=responsible,
            )
            notify_request_event(
                db,
                request=row,
                event_type=NOTIFICATION_EVENT_STATUS,
                actor_role=_actor_role(admin),
                actor_admin_user_id=admin.get("sub"),
                body=(
                    f"{before_status} -> {after_status}"
                    + (
                        f"\nВажная дата: {clean_payload.get('important_date_at').isoformat()}"
                        if isinstance(clean_payload.get("important_date_at"), datetime)
                        else ""
                    )
                    + (f"\n{billing_note}" if billing_note else "")
                ),
                responsible=responsible,
            )
    assignment_event_type = None
    assignment_marker_type = None
    assignment_event_body = None
    if normalized == "requests" and not _is_lawyer(admin):
        after_assigned_candidate = clean_payload.get("assigned_lawyer_id", before_assigned_lawyer_id or None)
        after_assigned_lawyer_id = str(after_assigned_candidate or "").strip()
        if after_assigned_lawyer_id and after_assigned_lawyer_id != before_assigned_lawyer_id:
            if before_assigned_lawyer_id:
                assignment_event_type = NOTIFICATION_EVENT_REASSIGNMENT
                assignment_marker_type = EVENT_REASSIGNMENT
                assignment_event_body = f"Переназначено: {before_assigned_lawyer_id} -> {after_assigned_lawyer_id}"
            else:
                assignment_event_type = NOTIFICATION_EVENT_ASSIGNMENT
                assignment_marker_type = EVENT_ASSIGNMENT
                assignment_event_body = f"Назначен юрист: {after_assigned_lawyer_id}"
    for key, value in clean_payload.items():
        setattr(row, key, value)
    if assignment_event_type and assignment_marker_type and isinstance(row, Request):
        mark_unread_for_client(row, assignment_marker_type)
        mark_unread_for_lawyer(row, assignment_marker_type)
        notify_request_event(
            db,
            request=row,
            event_type=assignment_event_type,
            actor_role=_actor_role(admin),
            actor_admin_user_id=admin.get("sub"),
            body=assignment_event_body,
            responsible=responsible,
        )

    try:
        db.add(row)
        db.flush()
        after = _row_to_dict(row)
        _append_audit(db, admin, normalized, str(after.get("id") or row_id), "UPDATE", {"before": before, "after": after})
        db.commit()
        db.refresh(row)
    except IntegrityError:
        db.rollback()
        raise _integrity_error()

    return _strip_hidden_fields(normalized, _row_to_dict(row))


def delete_row_service(table_name: str, row_id: str, db: Session, admin: dict) -> dict[str, Any]:
    normalized, model = _resolve_table_model(table_name)
    _require_table_action(admin, normalized, "delete")
    if normalized == "admin_users" and str(admin.get("sub") or "") == str(row_id):
        raise HTTPException(status_code=400, detail="Нельзя удалить собственную учетную запись")
    row = _load_row_or_404(db, model, row_id)
    if normalized == "requests" and isinstance(row, Request):
        _ensure_lawyer_can_manage_request_or_403(admin, row)
    if normalized in {"messages", "attachments"} and bool(getattr(row, "immutable", False)):
        raise HTTPException(status_code=400, detail="Запись зафиксирована и недоступна для удаления")

    before = _row_to_dict(row)
    entity_id = str(before.get("id") or row_id)

    try:
        db.delete(row)
        _append_audit(db, admin, normalized, entity_id, "DELETE", {"before": before})
        db.commit()
    except IntegrityError:
        db.rollback()
        raise _integrity_error("Невозможно удалить запись из-за ограничений связанных данных")

    return {"status": "удалено", "id": entity_id}
