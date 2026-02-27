from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import require_role
from app.db.session import get_db
from app.models.admin_user import AdminUser
from app.models.attachment import Attachment
from app.models.message import Message
from app.models.request import Request
from app.models.request_data_requirement import RequestDataRequirement
from app.models.request_data_template import RequestDataTemplate
from app.models.request_data_template_item import RequestDataTemplateItem
from app.models.topic_data_template import TopicDataTemplate
from app.services.chat_service import (
    create_admin_or_lawyer_message,
    list_messages_for_request,
    serialize_message,
    serialize_messages_for_request,
)

router = APIRouter()
ALLOWED_VALUE_TYPES = {"string", "text", "date", "number", "file"}


def _request_uuid_or_400(request_id: str) -> UUID:
    try:
        return UUID(str(request_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Некорректный идентификатор заявки")


def _request_for_id_or_404(db: Session, request_id: str) -> Request:
    req = db.get(Request, _request_uuid_or_400(request_id))
    if req is None:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    return req


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


def _ensure_lawyer_can_manage_request_or_403(admin: dict, req: Request) -> None:
    role = str(admin.get("role") or "").upper()
    if role != "LAWYER":
        return
    actor = str(admin.get("sub") or "").strip()
    if not actor:
        raise HTTPException(status_code=401, detail="Некорректный токен")
    assigned = str(req.assigned_lawyer_id or "").strip()
    if not assigned or actor != assigned:
        raise HTTPException(status_code=403, detail="Юрист может работать только со своими назначенными заявками")


def _parse_uuid_or_400(raw: str, field_name: str) -> UUID:
    try:
        return UUID(str(raw))
    except ValueError:
        raise HTTPException(status_code=400, detail=f'Некорректное поле "{field_name}"')


def _slugify_key(raw: str) -> str:
    text = str(raw or "").strip().lower()
    out = []
    dash = False
    for ch in text:
        if ch.isalnum():
            out.append(ch)
            dash = False
            continue
        if not dash:
            out.append("-")
            dash = True
    slug = "".join(out).strip("-")
    return (slug or "data-field")[:80]


def _normalize_value_type(raw: str | None) -> str:
    value = str(raw or "text").strip().lower()
    if value not in ALLOWED_VALUE_TYPES:
        raise HTTPException(status_code=400, detail='Тип поля должен быть одним из: string, text, date, number, file')
    return value


def _serialize_template(row: TopicDataTemplate) -> dict:
    return {
        "id": str(row.id),
        "topic_code": row.topic_code,
        "key": row.key,
        "label": row.label,
        "value_type": str(row.value_type or "text"),
        "document_name": row.document_name,
        "description": row.description,
        "sort_order": int(row.sort_order or 0),
        "enabled": bool(row.enabled),
    }


def _serialize_request_data_template(row: RequestDataTemplate) -> dict:
    return {
        "id": str(row.id),
        "topic_code": row.topic_code,
        "name": row.name,
        "description": row.description,
        "enabled": bool(row.enabled),
        "sort_order": int(row.sort_order or 0),
        "created_by_admin_id": str(row.created_by_admin_id) if row.created_by_admin_id else None,
    }


def _serialize_request_data_template_item(row: RequestDataTemplateItem) -> dict:
    return {
        "id": str(row.id),
        "request_data_template_id": str(row.request_data_template_id),
        "topic_data_template_id": str(row.topic_data_template_id) if row.topic_data_template_id else None,
        "key": row.key,
        "label": row.label,
        "value_type": str(row.value_type or "string"),
        "sort_order": int(row.sort_order or 0),
    }


def _serialize_data_request_items(db: Session, rows: list[RequestDataRequirement]) -> list[dict]:
    attachment_ids: list[UUID] = []
    for row in rows:
        if str(row.field_type or "").lower() != "file":
            continue
        try:
            attachment_ids.append(UUID(str(row.value_text or "").strip()))
        except Exception:
            continue
    attachment_map = {}
    if attachment_ids:
        attachment_rows = db.query(Attachment).filter(Attachment.id.in_(attachment_ids)).all()  # type: ignore[name-defined]
        attachment_map = {str(item.id): item for item in attachment_rows}
    out = []
    for index, row in enumerate(rows, start=1):
        value_text = str(row.value_text or "").strip()
        value_file = None
        if str(row.field_type or "").lower() == "file" and value_text:
            attachment = attachment_map.get(value_text)
            if attachment is not None:
                value_file = {
                    "attachment_id": str(attachment.id),
                    "file_name": attachment.file_name,
                    "mime_type": attachment.mime_type,
                    "size_bytes": int(attachment.size_bytes or 0),
                    "download_url": f"/api/admin/uploads/object/{attachment.id}",
                }
        out.append(
            {
                "id": str(row.id),
                "request_message_id": str(row.request_message_id) if row.request_message_id else None,
                "topic_template_id": str(row.topic_template_id) if row.topic_template_id else None,
                "key": row.key,
                "label": row.label,
                "field_type": str(row.field_type or "text"),
                "document_name": row.document_name,
                "description": row.description,
                "value_text": row.value_text,
                "value_file": value_file,
                "is_filled": bool(value_text),
                "sort_order": int(row.sort_order or 0),
                "index": index,
            }
        )
    return out


@router.get("/requests/{request_id}/messages")
def list_request_messages(
    request_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_role("ADMIN", "LAWYER", "CURATOR")),
):
    req = _request_for_id_or_404(db, request_id)
    _ensure_lawyer_can_view_request_or_403(admin, req)
    rows = list_messages_for_request(db, req.id)
    return {"rows": serialize_messages_for_request(db, req.id, rows), "total": len(rows)}


@router.post("/requests/{request_id}/messages", status_code=201)
def create_request_message(
    request_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_role("ADMIN", "LAWYER", "CURATOR")),
):
    req = _request_for_id_or_404(db, request_id)
    _ensure_lawyer_can_manage_request_or_403(admin, req)
    body = str((payload or {}).get("body") or "").strip()
    role = str(admin.get("role") or "").upper()
    actor_name = str(admin.get("email") or "").strip() or ("Юрист" if role == "LAWYER" else "Администратор")
    actor_admin_user_id = str(admin.get("sub") or "").strip() or None
    if actor_admin_user_id:
        try:
            actor_uuid = UUID(actor_admin_user_id)
        except ValueError:
            actor_uuid = None
        if actor_uuid is not None:
            actor_user = db.get(AdminUser, actor_uuid)
            if actor_user is not None:
                actor_name = str(actor_user.name or actor_user.email or actor_name)
    row = create_admin_or_lawyer_message(
        db,
        request=req,
        body=body,
        actor_role=role,
        actor_name=actor_name,
        actor_admin_user_id=actor_admin_user_id,
    )
    return serialize_message(row)


@router.get("/requests/{request_id}/data-request-templates")
def list_data_request_templates(
    request_id: str,
    document: str | None = None,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_role("ADMIN", "LAWYER", "CURATOR")),
):
    req = _request_for_id_or_404(db, request_id)
    _ensure_lawyer_can_manage_request_or_403(admin, req)
    topic_code = str(req.topic_code or "").strip()
    if not topic_code:
        return {"rows": [], "documents": [], "templates": []}
    query = db.query(TopicDataTemplate).filter(TopicDataTemplate.topic_code == topic_code)
    document_name = str(document or "").strip()
    if document_name:
        query = query.filter(TopicDataTemplate.document_name == document_name)
    rows = (
        query.order_by(
            TopicDataTemplate.document_name.asc().nullsfirst(),
            TopicDataTemplate.sort_order.asc(),
            TopicDataTemplate.label.asc(),
            TopicDataTemplate.key.asc(),
        ).all()
    )
    all_docs_rows = (
        db.query(TopicDataTemplate.document_name)
        .filter(TopicDataTemplate.topic_code == topic_code, TopicDataTemplate.enabled.is_(True))
        .distinct()
        .all()
    )
    documents = sorted({str(row[0]).strip() for row in all_docs_rows if row[0]}, key=lambda x: x.lower())
    template_rows = (
        db.query(RequestDataTemplate)
        .filter(RequestDataTemplate.topic_code == topic_code, RequestDataTemplate.enabled.is_(True))
        .order_by(RequestDataTemplate.sort_order.asc(), RequestDataTemplate.name.asc())
        .all()
    )
    return {
        "rows": [_serialize_template(row) for row in rows if row.enabled],  # legacy catalog payload
        "documents": documents,  # legacy
        "templates": [_serialize_request_data_template(row) for row in template_rows],
    }


@router.get("/requests/{request_id}/data-requests/{message_id}")
def get_data_request_batch(
    request_id: str,
    message_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_role("ADMIN", "LAWYER", "CURATOR")),
):
    req = _request_for_id_or_404(db, request_id)
    _ensure_lawyer_can_view_request_or_403(admin, req)
    msg_uuid = _parse_uuid_or_400(message_id, "message_id")
    message = db.get(Message, msg_uuid)
    if message is None or message.request_id != req.id:
        raise HTTPException(status_code=404, detail="Сообщение запроса не найдено")
    rows = (
        db.query(RequestDataRequirement)
        .filter(
            RequestDataRequirement.request_id == req.id,
            RequestDataRequirement.request_message_id == msg_uuid,
        )
        .order_by(RequestDataRequirement.sort_order.asc(), RequestDataRequirement.created_at.asc(), RequestDataRequirement.id.asc())
        .all()
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Набор данных для сообщения не найден")
    return {
        "message_id": str(message.id),
        "request_id": str(req.id),
        "track_number": req.track_number,
        "document_name": rows[0].document_name if rows else None,
        "items": _serialize_data_request_items(db, rows),
    }


@router.get("/requests/{request_id}/data-request-templates/{template_id}")
def get_data_request_template(
    request_id: str,
    template_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_role("ADMIN", "LAWYER", "CURATOR")),
):
    req = _request_for_id_or_404(db, request_id)
    _ensure_lawyer_can_manage_request_or_403(admin, req)
    template_uuid = _parse_uuid_or_400(template_id, "template_id")
    template = db.get(RequestDataTemplate, template_uuid)
    if template is None:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    if str(template.topic_code or "").strip() != str(req.topic_code or "").strip():
        raise HTTPException(status_code=400, detail="Шаблон не соответствует теме заявки")
    rows = (
        db.query(RequestDataTemplateItem)
        .filter(RequestDataTemplateItem.request_data_template_id == template.id)
        .order_by(RequestDataTemplateItem.sort_order.asc(), RequestDataTemplateItem.created_at.asc(), RequestDataTemplateItem.id.asc())
        .all()
    )
    return {
        "template": _serialize_request_data_template(template),
        "items": [_serialize_request_data_template_item(row) for row in rows],
    }


@router.post("/requests/{request_id}/data-request-templates", status_code=201)
def save_data_request_template(
    request_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_role("ADMIN", "LAWYER", "CURATOR")),
):
    req = _request_for_id_or_404(db, request_id)
    _ensure_lawyer_can_manage_request_or_403(admin, req)
    topic_code = str(req.topic_code or "").strip()
    if not topic_code:
        raise HTTPException(status_code=400, detail="У заявки не указана тема")

    body = payload or {}
    name = str(body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Укажите название шаблона")
    raw_items = body.get("items")
    if not isinstance(raw_items, list) or not raw_items:
        raise HTTPException(status_code=400, detail="Шаблон должен содержать хотя бы одно поле")

    actor_uuid = None
    raw_actor = str(admin.get("sub") or "").strip()
    if raw_actor:
        try:
            actor_uuid = UUID(raw_actor)
        except ValueError:
            actor_uuid = None
    responsible = str(admin.get("email") or "").strip() or "Администратор системы"

    template = None
    template_id_raw = str(body.get("template_id") or "").strip()
    if template_id_raw:
        template = db.get(RequestDataTemplate, _parse_uuid_or_400(template_id_raw, "template_id"))
        if template is None:
            raise HTTPException(status_code=404, detail="Шаблон не найден")
        if str(template.topic_code or "").strip() != topic_code:
            raise HTTPException(status_code=400, detail="Шаблон не соответствует теме заявки")
    else:
        template = (
            db.query(RequestDataTemplate)
            .filter(RequestDataTemplate.topic_code == topic_code, RequestDataTemplate.name == name)
            .first()
        )

    if template is None:
        template = RequestDataTemplate(
            topic_code=topic_code,
            name=name,
            enabled=True,
            sort_order=0,
            created_by_admin_id=actor_uuid,
            responsible=responsible,
        )
        db.add(template)
        db.flush()
    else:
        actor_role = str(admin.get("role") or "").upper()
        if actor_role == "LAWYER":
            owner_id = str(template.created_by_admin_id or "").strip()
            actor_id = str(actor_uuid or "").strip()
            if owner_id and actor_id and owner_id != actor_id:
                raise HTTPException(status_code=403, detail="Юрист может изменять только свои шаблоны")
        template.name = name
        template.responsible = responsible
        db.add(template)
        db.flush()

    touched_keys: set[str] = set()
    normalized_items: list[tuple[int, TopicDataTemplate | None, str, str, str]] = []
    for index, item in enumerate(raw_items):
        if not isinstance(item, dict):
            raise HTTPException(status_code=400, detail="Элемент шаблона должен быть объектом")
        catalog = None
        catalog_id_raw = str(item.get("topic_data_template_id") or item.get("topic_template_id") or "").strip()
        if catalog_id_raw:
            catalog = db.get(TopicDataTemplate, _parse_uuid_or_400(catalog_id_raw, "topic_data_template_id"))
            if catalog is None:
                raise HTTPException(status_code=400, detail="Поле справочника не найдено")
        label = str(item.get("label") or (catalog.label if catalog else "")).strip()
        if not label:
            raise HTTPException(status_code=400, detail="Укажите наименование поля")
        value_type = _normalize_value_type(item.get("value_type") or item.get("field_type") or (catalog.value_type if catalog else None))
        key = str(item.get("key") or (catalog.key if catalog else "")).strip()
        if not key:
            key = _slugify_key(label)
        key = key[:80]
        if key in touched_keys:
            raise HTTPException(status_code=400, detail=f'Поле "{label}" добавлено дважды')
        touched_keys.add(key)

        if catalog is None:
            catalog = (
                db.query(TopicDataTemplate)
                .filter(TopicDataTemplate.topic_code == topic_code, TopicDataTemplate.key == key)
                .first()
            )
            if catalog is None:
                catalog = TopicDataTemplate(
                    topic_code=topic_code,
                    key=key,
                    label=label,
                    value_type=value_type,
                    enabled=True,
                    required=True,
                    sort_order=index,
                    responsible=responsible,
                )
                db.add(catalog)
                db.flush()
            else:
                changed = False
                if str(catalog.label or "") != label:
                    catalog.label = label
                    changed = True
                if str(catalog.value_type or "string") != value_type:
                    catalog.value_type = value_type
                    changed = True
                if changed:
                    catalog.responsible = responsible
                    db.add(catalog)
                    db.flush()
        normalized_items.append((index, catalog, key, label, value_type))

    existing_items = (
        db.query(RequestDataTemplateItem)
        .filter(RequestDataTemplateItem.request_data_template_id == template.id)
        .all()
    )
    by_key = {str(row.key): row for row in existing_items}
    for index, catalog, key, label, value_type in normalized_items:
        row = by_key.get(key)
        if row is None:
            row = RequestDataTemplateItem(
                request_data_template_id=template.id,
                topic_data_template_id=catalog.id if catalog else None,
                key=key,
                label=label,
                value_type=value_type,
                sort_order=index,
                responsible=responsible,
            )
        else:
            row.topic_data_template_id = catalog.id if catalog else None
            row.label = label
            row.value_type = value_type
            row.sort_order = index
            row.responsible = responsible
        db.add(row)
    for row in existing_items:
        if str(row.key) not in touched_keys:
            db.delete(row)

    db.commit()
    db.refresh(template)
    items = (
        db.query(RequestDataTemplateItem)
        .filter(RequestDataTemplateItem.request_data_template_id == template.id)
        .order_by(RequestDataTemplateItem.sort_order.asc(), RequestDataTemplateItem.created_at.asc(), RequestDataTemplateItem.id.asc())
        .all()
    )
    return {"template": _serialize_request_data_template(template), "items": [_serialize_request_data_template_item(row) for row in items]}


@router.post("/requests/{request_id}/data-requests", status_code=201)
def upsert_data_request_batch(
    request_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_role("ADMIN", "LAWYER", "CURATOR")),
):
    req = _request_for_id_or_404(db, request_id)
    _ensure_lawyer_can_manage_request_or_403(admin, req)
    actor_role = str(admin.get("role") or "").strip().upper()

    body = payload or {}
    raw_items = body.get("items")
    if not isinstance(raw_items, list) or not raw_items:
        raise HTTPException(status_code=400, detail="Нужно передать список полей запроса")

    message_id_raw = str(body.get("message_id") or "").strip()
    existing_message = None
    existing_message_rows: list[RequestDataRequirement] = []
    if message_id_raw:
        msg_uuid = _parse_uuid_or_400(message_id_raw, "message_id")
        existing_message = db.get(Message, msg_uuid)
        if existing_message is None or existing_message.request_id != req.id:
            raise HTTPException(status_code=404, detail="Сообщение запроса не найдено")
        existing_message_rows = (
            db.query(RequestDataRequirement)
            .filter(
                RequestDataRequirement.request_id == req.id,
                RequestDataRequirement.request_message_id == existing_message.id,
            )
            .all()
        )
    else:
        role = actor_role
        actor_name = str(admin.get("email") or "").strip() or ("Юрист" if role == "LAWYER" else "Администратор")
        actor_admin_user_id = str(admin.get("sub") or "").strip() or None
        if actor_admin_user_id:
            try:
                actor_uuid = UUID(actor_admin_user_id)
            except ValueError:
                actor_uuid = None
            if actor_uuid is not None:
                actor_user = db.get(AdminUser, actor_uuid)
                if actor_user is not None:
                    actor_name = str(actor_user.name or actor_user.email or actor_name)
        existing_message = create_admin_or_lawyer_message(
            db,
            request=req,
            body="Запрос",
            actor_role=role,
            actor_name=actor_name,
            actor_admin_user_id=actor_admin_user_id,
        )

    message_uuid = existing_message.id
    topic_code = str(req.topic_code or "").strip()
    document_name_default = str(body.get("document_name") or "").strip() or None
    actor_uuid = None
    raw_actor = str(admin.get("sub") or "").strip()
    if raw_actor:
        try:
            actor_uuid = UUID(raw_actor)
        except ValueError:
            actor_uuid = None

    normalized_rows: list[RequestDataRequirement] = []
    touched_keys: set[str] = set()
    for index, item in enumerate(raw_items):
        if not isinstance(item, dict):
            raise HTTPException(status_code=400, detail="Элемент списка полей должен быть объектом")
        template = None
        template_id_raw = str(item.get("topic_template_id") or "").strip()
        if template_id_raw:
            template = db.get(TopicDataTemplate, _parse_uuid_or_400(template_id_raw, "topic_template_id"))
            if template is None:
                raise HTTPException(status_code=400, detail="Шаблон дополнительного поля не найден")

        label = str(item.get("label") or (template.label if template else "")).strip()
        if not label:
            raise HTTPException(status_code=400, detail="Укажите наименование поля")
        field_type = _normalize_value_type(item.get("field_type") or (template.value_type if template else None))
        doc_name = str(item.get("document_name") or (template.document_name if template else "") or (document_name_default or "")).strip() or None
        key = str(item.get("key") or (template.key if template else "")).strip()
        if not key:
            key = _slugify_key(label)
        key = key[:80]
        if key in touched_keys:
            raise HTTPException(status_code=400, detail=f'Поле "{label}" добавлено дважды')
        touched_keys.add(key)

        topic_template_id = None
        if template is not None:
            topic_template_id = template.id
        elif topic_code:
            existing_template = (
                db.query(TopicDataTemplate)
                .filter(TopicDataTemplate.topic_code == topic_code, TopicDataTemplate.key == key)
                .first()
            )
            if existing_template is None:
                existing_template = TopicDataTemplate(
                    topic_code=topic_code,
                    key=key,
                    label=label,
                    value_type=field_type,
                    document_name=doc_name,
                    enabled=True,
                    required=True,
                    sort_order=index,
                    responsible=str(admin.get("email") or "").strip() or "Администратор системы",
                )
                db.add(existing_template)
                db.flush()
            else:
                changed = False
                if str(existing_template.label or "") != label:
                    existing_template.label = label
                    changed = True
                if str(existing_template.value_type or "text") != field_type:
                    existing_template.value_type = field_type
                    changed = True
                if str(existing_template.document_name or "") != str(doc_name or ""):
                    existing_template.document_name = doc_name
                    changed = True
                if changed:
                    db.add(existing_template)
                    db.flush()
            topic_template_id = existing_template.id

        req_row = (
            db.query(RequestDataRequirement)
            .filter(RequestDataRequirement.request_id == req.id, RequestDataRequirement.key == key)
            .first()
        )
        if req_row is None:
            req_row = RequestDataRequirement(
                request_id=req.id,
                request_message_id=message_uuid,
                topic_template_id=topic_template_id,
                key=key,
                label=label,
                field_type=field_type,
                document_name=doc_name,
                required=True,
                sort_order=index,
                created_by_admin_id=actor_uuid,
                responsible=str(admin.get("email") or "").strip() or "Администратор системы",
            )
        else:
            if actor_role == "LAWYER" and str(req_row.value_text or "").strip():
                current_message_id = str(req_row.request_message_id or "")
                incoming_message_id = str(message_uuid or "")
                current_topic_template_id = str(req_row.topic_template_id or "")
                incoming_topic_template_id = str(topic_template_id or "")
                current_doc_name = str(req_row.document_name or "") if req_row.document_name is not None else ""
                incoming_doc_name = str(doc_name or "")
                if (
                    str(req_row.label or "") != label
                    or str(req_row.field_type or "text") != field_type
                    or current_doc_name != incoming_doc_name
                    or current_topic_template_id != incoming_topic_template_id
                    or current_message_id != incoming_message_id
                    or int(req_row.sort_order or 0) != int(index)
                ):
                    raise HTTPException(status_code=403, detail="Юрист не может изменять заполненные клиентом данные")
            req_row.request_message_id = message_uuid
            req_row.topic_template_id = topic_template_id
            req_row.label = label
            req_row.field_type = field_type
            req_row.document_name = doc_name
            req_row.sort_order = index
            req_row.responsible = str(admin.get("email") or "").strip() or "Администратор системы"
        db.add(req_row)
        normalized_rows.append(req_row)

    if message_id_raw:
        if actor_role == "LAWYER":
            for row in existing_message_rows:
                if row.key not in touched_keys and str(row.value_text or "").strip():
                    raise HTTPException(status_code=403, detail="Юрист не может удалять заполненные клиентом данные")
        for row in existing_message_rows:
            if row.key not in touched_keys:
                db.delete(row)

    db.commit()
    fresh_messages = list_messages_for_request(db, req.id)
    serialized = serialize_messages_for_request(db, req.id, fresh_messages)
    payload_row = next((item for item in serialized if str(item.get("id")) == str(message_uuid)), None)
    if payload_row is None:
        raise HTTPException(status_code=500, detail="Не удалось сформировать сообщение запроса")
    return payload_row
