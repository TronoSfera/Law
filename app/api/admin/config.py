from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from uuid import UUID
from app.db.session import get_db
from app.core.deps import require_role
from app.schemas.universal import UniversalQuery
from app.schemas.admin import TopicUpsert, StatusUpsert, FormFieldUpsert
from app.models.topic import Topic
from app.models.status import Status
from app.models.status_group import StatusGroup
from app.models.form_field import FormField
from app.services.universal_query import apply_universal_query

router = APIRouter()


def _topic_row(row: Topic):
    return {"id": str(row.id), "code": row.code, "name": row.name, "enabled": row.enabled, "sort_order": row.sort_order}


def _status_row(row: Status):
    return {
        "id": str(row.id),
        "code": row.code,
        "name": row.name,
        "status_group_id": str(row.status_group_id) if row.status_group_id else None,
        "enabled": row.enabled,
        "sort_order": row.sort_order,
        "is_terminal": row.is_terminal,
        "kind": row.kind,
        "invoice_template": row.invoice_template,
    }


def _form_field_row(row: FormField):
    return {
        "id": str(row.id),
        "key": row.key,
        "label": row.label,
        "type": row.type,
        "required": row.required,
        "enabled": row.enabled,
        "sort_order": row.sort_order,
        "options": row.options,
    }

@router.post("/topics/query")
def query_topics(uq: UniversalQuery, db: Session = Depends(get_db), admin=Depends(require_role("ADMIN"))):
    q = apply_universal_query(db.query(Topic), Topic, uq)
    total = q.count()
    rows = q.offset(uq.page.offset).limit(uq.page.limit).all()
    return {"rows": [_topic_row(r) for r in rows], "total": total}


@router.post("/topics", status_code=201)
def create_topic(payload: TopicUpsert, db: Session = Depends(get_db), admin=Depends(require_role("ADMIN"))):
    responsible = str(admin.get("email") or "").strip() or "Администратор системы"
    row = Topic(**payload.model_dump(), responsible=responsible)
    try:
        db.add(row)
        db.commit()
        db.refresh(row)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Тема с таким кодом уже существует")
    return _topic_row(row)


@router.patch("/topics/{id}")
def update_topic(id: str, payload: TopicUpsert, db: Session = Depends(get_db), admin=Depends(require_role("ADMIN"))):
    row = db.query(Topic).filter(Topic.id == id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Тема не найдена")
    for k, v in payload.model_dump().items():
        setattr(row, k, v)
    try:
        db.add(row)
        db.commit()
        db.refresh(row)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Тема с таким кодом уже существует")
    return _topic_row(row)


@router.delete("/topics/{id}")
def delete_topic(id: str, db: Session = Depends(get_db), admin=Depends(require_role("ADMIN"))):
    row = db.query(Topic).filter(Topic.id == id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Тема не найдена")
    db.delete(row)
    db.commit()
    return {"status": "удалено"}

@router.post("/statuses/query")
def query_statuses(uq: UniversalQuery, db: Session = Depends(get_db), admin=Depends(require_role("ADMIN"))):
    q = apply_universal_query(db.query(Status), Status, uq)
    total = q.count()
    rows = q.offset(uq.page.offset).limit(uq.page.limit).all()
    return {"rows": [_status_row(r) for r in rows], "total": total}


@router.post("/statuses", status_code=201)
def create_status(payload: StatusUpsert, db: Session = Depends(get_db), admin=Depends(require_role("ADMIN"))):
    data = payload.model_dump()
    raw_group = data.get("status_group_id")
    if raw_group:
        try:
            group_id = UUID(str(raw_group))
        except ValueError:
            raise HTTPException(status_code=400, detail="Некорректная группа статусов")
        if db.get(StatusGroup, group_id) is None:
            raise HTTPException(status_code=400, detail="Группа статусов не найдена")
        data["status_group_id"] = group_id
    else:
        data["status_group_id"] = None
    responsible = str(admin.get("email") or "").strip() or "Администратор системы"
    row = Status(**data, responsible=responsible)
    try:
        db.add(row)
        db.commit()
        db.refresh(row)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Статус с таким кодом уже существует")
    return _status_row(row)


@router.patch("/statuses/{id}")
def update_status(id: str, payload: StatusUpsert, db: Session = Depends(get_db), admin=Depends(require_role("ADMIN"))):
    row = db.query(Status).filter(Status.id == id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Статус не найден")
    data = payload.model_dump()
    raw_group = data.get("status_group_id")
    if raw_group:
        try:
            group_id = UUID(str(raw_group))
        except ValueError:
            raise HTTPException(status_code=400, detail="Некорректная группа статусов")
        if db.get(StatusGroup, group_id) is None:
            raise HTTPException(status_code=400, detail="Группа статусов не найдена")
        data["status_group_id"] = group_id
    else:
        data["status_group_id"] = None
    for k, v in data.items():
        setattr(row, k, v)
    try:
        db.add(row)
        db.commit()
        db.refresh(row)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Статус с таким кодом уже существует")
    return _status_row(row)


@router.delete("/statuses/{id}")
def delete_status(id: str, db: Session = Depends(get_db), admin=Depends(require_role("ADMIN"))):
    row = db.query(Status).filter(Status.id == id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Статус не найден")
    db.delete(row)
    db.commit()
    return {"status": "удалено"}

@router.post("/form-fields/query")
def query_form_fields(uq: UniversalQuery, db: Session = Depends(get_db), admin=Depends(require_role("ADMIN"))):
    q = apply_universal_query(db.query(FormField), FormField, uq)
    total = q.count()
    rows = q.offset(uq.page.offset).limit(uq.page.limit).all()
    return {"rows": [_form_field_row(r) for r in rows], "total": total}


@router.post("/form-fields", status_code=201)
def create_form_field(payload: FormFieldUpsert, db: Session = Depends(get_db), admin=Depends(require_role("ADMIN"))):
    responsible = str(admin.get("email") or "").strip() or "Администратор системы"
    row = FormField(**payload.model_dump(), responsible=responsible)
    try:
        db.add(row)
        db.commit()
        db.refresh(row)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Поле формы с таким ключом уже существует")
    return _form_field_row(row)


@router.patch("/form-fields/{id}")
def update_form_field(id: str, payload: FormFieldUpsert, db: Session = Depends(get_db), admin=Depends(require_role("ADMIN"))):
    row = db.query(FormField).filter(FormField.id == id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Поле формы не найдено")
    for k, v in payload.model_dump().items():
        setattr(row, k, v)
    try:
        db.add(row)
        db.commit()
        db.refresh(row)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Поле формы с таким ключом уже существует")
    return _form_field_row(row)


@router.delete("/form-fields/{id}")
def delete_form_field(id: str, db: Session = Depends(get_db), admin=Depends(require_role("ADMIN"))):
    row = db.query(FormField).filter(FormField.id == id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Поле формы не найдено")
    db.delete(row)
    db.commit()
    return {"status": "удалено"}
