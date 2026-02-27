from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.models.request import Request
from app.models.request_service_request import RequestServiceRequest
from app.schemas.admin import RequestServiceRequestPatch

from .permissions import ensure_lawyer_can_view_request_or_403, request_uuid_or_400

SERVICE_REQUEST_TYPES = {"CURATOR_CONTACT", "LAWYER_CHANGE_REQUEST"}
SERVICE_REQUEST_STATUSES = {"NEW", "IN_PROGRESS", "RESOLVED", "REJECTED"}


def _parse_service_request_uuid_or_400(service_request_id: str) -> UUID:
    try:
        return UUID(str(service_request_id))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Некорректный идентификатор запроса") from exc


def _service_request_for_id_or_404(db: Session, service_request_id: str) -> RequestServiceRequest:
    row = db.get(RequestServiceRequest, _parse_service_request_uuid_or_400(service_request_id))
    if row is None:
        raise HTTPException(status_code=404, detail="Запрос не найден")
    return row


def _resolve_responsible(admin: dict) -> str:
    return str(admin.get("email") or "").strip() or "Администратор системы"


def _actor_id_or_none(admin: dict) -> str | None:
    raw = str(admin.get("sub") or "").strip()
    if not raw:
        return None
    try:
        UUID(raw)
        return raw
    except ValueError:
        return None


def _actor_uuid_or_none(admin: dict) -> UUID | None:
    raw = str(admin.get("sub") or "").strip()
    if not raw:
        return None
    try:
        return UUID(raw)
    except ValueError:
        return None


def _ensure_lawyer_can_view_service_request_or_403(admin: dict, row: RequestServiceRequest) -> None:
    role = str(admin.get("role") or "").upper()
    if role != "LAWYER":
        return
    actor = str(admin.get("sub") or "").strip()
    row_type = str(row.type or "").strip().upper()
    assigned = str(row.assigned_lawyer_id or "").strip()
    if row_type != "CURATOR_CONTACT" or not actor or not assigned or assigned != actor:
        raise HTTPException(status_code=403, detail="Недостаточно прав")


def _serialize_service_request(row: RequestServiceRequest) -> dict:
    return {
        "id": str(row.id),
        "request_id": str(row.request_id),
        "client_id": str(row.client_id) if row.client_id else None,
        "assigned_lawyer_id": str(row.assigned_lawyer_id) if row.assigned_lawyer_id else None,
        "resolved_by_admin_id": str(row.resolved_by_admin_id) if row.resolved_by_admin_id else None,
        "type": str(row.type or ""),
        "status": str(row.status or "NEW"),
        "body": str(row.body or ""),
        "created_by_client": bool(row.created_by_client),
        "admin_unread": bool(row.admin_unread),
        "lawyer_unread": bool(row.lawyer_unread),
        "admin_read_at": row.admin_read_at.isoformat() if row.admin_read_at else None,
        "lawyer_read_at": row.lawyer_read_at.isoformat() if row.lawyer_read_at else None,
        "resolved_at": row.resolved_at.isoformat() if row.resolved_at else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def list_request_service_requests_service(request_id: str, db: Session, admin: dict) -> dict:
    request_uuid = request_uuid_or_400(request_id)
    req = db.get(Request, request_uuid)
    if req is None:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    ensure_lawyer_can_view_request_or_403(admin, req)

    role = str(admin.get("role") or "").upper()
    query = db.query(RequestServiceRequest).filter(RequestServiceRequest.request_id == str(req.id))
    if role == "LAWYER":
        actor_id = _actor_id_or_none(admin)
        if actor_id is None:
            raise HTTPException(status_code=401, detail="Некорректный токен")
        query = query.filter(
            RequestServiceRequest.type == "CURATOR_CONTACT",
            RequestServiceRequest.assigned_lawyer_id == actor_id,
        )
    rows = query.order_by(RequestServiceRequest.created_at.desc(), RequestServiceRequest.id.desc()).all()
    return {"rows": [_serialize_service_request(row) for row in rows], "total": len(rows)}


def mark_service_request_read_service(service_request_id: str, db: Session, admin: dict) -> dict:
    row = _service_request_for_id_or_404(db, service_request_id)
    role = str(admin.get("role") or "").upper()
    _ensure_lawyer_can_view_service_request_or_403(admin, row)

    now = datetime.now(timezone.utc)
    changed = False
    responsible = _resolve_responsible(admin)
    actor_uuid = _actor_uuid_or_none(admin)
    action = None
    if role == "LAWYER":
        if row.lawyer_unread:
            row.lawyer_unread = False
            row.lawyer_read_at = now
            action = "READ_MARK_LAWYER"
            changed = True
    else:
        if row.admin_unread:
            row.admin_unread = False
            row.admin_read_at = now
            action = "READ_MARK_ADMIN"
            changed = True

    if changed:
        row.responsible = responsible
        db.add(row)
        db.add(
            AuditLog(
                actor_admin_id=actor_uuid,
                entity="request_service_requests",
                entity_id=str(row.id),
                action=str(action or "READ_MARK"),
                diff={"status": str(row.status or "NEW")},
                responsible=responsible,
            )
        )
        db.commit()
        db.refresh(row)
    return {"status": "ok", "changed": int(changed), "row": _serialize_service_request(row)}


def update_service_request_status_service(service_request_id: str, payload: RequestServiceRequestPatch, db: Session, admin: dict) -> dict:
    row = _service_request_for_id_or_404(db, service_request_id)
    next_status = str(payload.status or "").strip().upper()
    if next_status not in SERVICE_REQUEST_STATUSES:
        raise HTTPException(status_code=400, detail="Некорректный статус запроса")

    previous_status = str(row.status or "NEW")
    if next_status == previous_status:
        return {"status": "ok", "changed": 0, "row": _serialize_service_request(row)}

    now = datetime.now(timezone.utc)
    responsible = _resolve_responsible(admin)
    actor_id = _actor_id_or_none(admin)
    actor_uuid = _actor_uuid_or_none(admin)

    row.status = next_status
    if next_status in {"RESOLVED", "REJECTED"}:
        row.resolved_at = now
        row.resolved_by_admin_id = actor_id
    row.responsible = responsible
    db.add(row)
    db.add(
        AuditLog(
            actor_admin_id=actor_uuid,
            entity="request_service_requests",
            entity_id=str(row.id),
            action="STATUS_UPDATE",
            diff={"before": {"status": previous_status}, "after": {"status": next_status}},
            responsible=responsible,
        )
    )
    db.commit()
    db.refresh(row)
    return {"status": "ok", "changed": 1, "row": _serialize_service_request(row)}
