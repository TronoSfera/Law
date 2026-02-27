from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.request import Request
from app.models.request_data_requirement import RequestDataRequirement
from app.models.topic_data_template import TopicDataTemplate
from app.schemas.admin import RequestDataRequirementCreate, RequestDataRequirementPatch
from app.services.request_status import actor_admin_uuid

from .permissions import ensure_lawyer_can_manage_request_or_403, request_uuid_or_400


def request_data_requirement_row(row: RequestDataRequirement) -> dict[str, Any]:
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


def get_request_data_template_service(request_id: str, db: Session, admin: dict) -> dict[str, Any]:
    request_uuid = request_uuid_or_400(request_id)
    req = db.get(Request, request_uuid)
    if req is None:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    ensure_lawyer_can_manage_request_or_403(admin, req)

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
        "request_items": [request_data_requirement_row(row) for row in request_items],
    }


def sync_request_data_template_from_topic_service(request_id: str, db: Session, admin: dict) -> dict[str, Any]:
    request_uuid = request_uuid_or_400(request_id)
    req = db.get(Request, request_uuid)
    if req is None:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    ensure_lawyer_can_manage_request_or_403(admin, req)
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


def create_request_data_requirement_service(
    request_id: str,
    payload: RequestDataRequirementCreate,
    db: Session,
    admin: dict,
) -> dict[str, Any]:
    request_uuid = request_uuid_or_400(request_id)
    req = db.get(Request, request_uuid)
    if req is None:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    ensure_lawyer_can_manage_request_or_403(admin, req)

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
    return request_data_requirement_row(row)


def update_request_data_requirement_service(
    request_id: str,
    item_id: str,
    payload: RequestDataRequirementPatch,
    db: Session,
    admin: dict,
) -> dict[str, Any]:
    request_uuid = request_uuid_or_400(request_id)
    req = db.get(Request, request_uuid)
    if req is None:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    ensure_lawyer_can_manage_request_or_403(admin, req)

    item_uuid = request_uuid_or_400(item_id)
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
    return request_data_requirement_row(row)


def delete_request_data_requirement_service(request_id: str, item_id: str, db: Session, admin: dict) -> dict[str, Any]:
    request_uuid = request_uuid_or_400(request_id)
    req = db.get(Request, request_uuid)
    if req is None:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    ensure_lawyer_can_manage_request_or_403(admin, req)

    item_uuid = request_uuid_or_400(item_id)
    row = db.get(RequestDataRequirement, item_uuid)
    if row is None or row.request_id != req.id:
        raise HTTPException(status_code=404, detail="Элемент шаблона заявки не найден")
    db.delete(row)
    db.commit()
    return {"status": "удалено", "id": str(row.id)}
