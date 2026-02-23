from __future__ import annotations

import importlib
import pkgutil
import uuid
from datetime import date, datetime
from decimal import Decimal
from functools import lru_cache
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.inspection import inspect as sa_inspect
from sqlalchemy.orm import Session

import app.models as models_pkg
from app.core.deps import get_current_admin
from app.core.security import hash_password
from app.db.session import Base, get_db
from app.models.admin_user import AdminUser
from app.models.audit_log import AuditLog
from app.models.form_field import FormField
from app.models.request_data_requirement import RequestDataRequirement
from app.models.attachment import Attachment
from app.models.message import Message
from app.models.request import Request
from app.models.status import Status
from app.models.topic_data_template import TopicDataTemplate
from app.models.topic_required_field import TopicRequiredField
from app.models.topic import Topic
from app.schemas.universal import UniversalQuery
from app.services.notifications import (
    EVENT_ATTACHMENT as NOTIFICATION_EVENT_ATTACHMENT,
    EVENT_MESSAGE as NOTIFICATION_EVENT_MESSAGE,
    EVENT_STATUS as NOTIFICATION_EVENT_STATUS,
    mark_admin_notifications_read,
    notify_request_event,
)
from app.services.request_read_markers import (
    EVENT_ATTACHMENT,
    EVENT_MESSAGE,
    EVENT_STATUS,
    clear_unread_for_lawyer,
    mark_unread_for_client,
    mark_unread_for_lawyer,
)
from app.services.request_status import apply_status_change_effects
from app.services.status_flow import transition_allowed_for_topic
from app.services.request_templates import validate_required_topic_fields_or_400
from app.services.universal_query import apply_universal_query

router = APIRouter()

CRUD_ACTIONS = {"query", "read", "create", "update", "delete"}
SYSTEM_FIELDS = {
    "id",
    "created_at",
    "updated_at",
    "responsible",
    "client_has_unread_updates",
    "client_unread_event_type",
    "lawyer_has_unread_updates",
    "lawyer_unread_event_type",
}
ALLOWED_ADMIN_ROLES = {"ADMIN", "LAWYER"}

# Per-table RBAC: table -> role -> actions.
# If a table is missing here, fallback rules are used.
TABLE_ROLE_ACTIONS: dict[str, dict[str, set[str]]] = {
    "requests": {
        "ADMIN": set(CRUD_ACTIONS),
        "LAWYER": set(CRUD_ACTIONS),
    },
    "quotes": {"ADMIN": set(CRUD_ACTIONS)},
    "topics": {"ADMIN": set(CRUD_ACTIONS)},
    "statuses": {"ADMIN": set(CRUD_ACTIONS)},
    "form_fields": {"ADMIN": set(CRUD_ACTIONS)},
    "audit_log": {"ADMIN": {"query", "read"}},
    "otp_sessions": {"ADMIN": {"query", "read"}},
    "admin_users": {"ADMIN": set(CRUD_ACTIONS)},
    "admin_user_topics": {"ADMIN": set(CRUD_ACTIONS)},
    "topic_status_transitions": {"ADMIN": set(CRUD_ACTIONS)},
    "topic_required_fields": {"ADMIN": set(CRUD_ACTIONS)},
    "topic_data_templates": {"ADMIN": set(CRUD_ACTIONS)},
    "request_data_requirements": {"ADMIN": set(CRUD_ACTIONS)},
    "notifications": {"ADMIN": {"query", "read", "update"}},
}

DEFAULT_ROLE_ACTIONS: dict[str, set[str]] = {
    "ADMIN": set(CRUD_ACTIONS),
}


def _normalize_table_name(table_name: str) -> str:
    raw = (table_name or "").strip().replace("-", "_")
    if not raw:
        return ""
    chars: list[str] = []
    for index, ch in enumerate(raw):
        if ch.isupper() and index > 0 and raw[index - 1].isalnum() and raw[index - 1] != "_":
            chars.append("_")
        chars.append(ch.lower())
    return "".join(chars)


@lru_cache(maxsize=1)
def _table_model_map() -> dict[str, type]:
    for module in pkgutil.iter_modules(models_pkg.__path__):
        if module.name.startswith("_"):
            continue
        importlib.import_module(f"{models_pkg.__name__}.{module.name}")
    return {
        mapper.class_.__tablename__: mapper.class_
        for mapper in Base.registry.mappers
        if getattr(mapper.class_, "__tablename__", None)
    }


def _resolve_table_model(table_name: str) -> tuple[str, type]:
    normalized = _normalize_table_name(table_name)
    model = _table_model_map().get(normalized)
    if model is None:
        raise HTTPException(status_code=404, detail="Таблица не найдена")
    return normalized, model


def _allowed_actions(role: str, table_name: str) -> set[str]:
    per_table = TABLE_ROLE_ACTIONS.get(table_name)
    if per_table is not None:
        return set(per_table.get(role, set()))
    return set(DEFAULT_ROLE_ACTIONS.get(role, set()))


def _require_table_action(admin: dict, table_name: str, action: str) -> None:
    role = str(admin.get("role") or "").upper()
    allowed = _allowed_actions(role, table_name)
    if action not in allowed:
        raise HTTPException(status_code=403, detail="Недостаточно прав")


def _is_lawyer(admin: dict) -> bool:
    return str(admin.get("role") or "").upper() == "LAWYER"


def _serialize_value(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _serialize_value(val) for key, val in value.items()}
    if isinstance(value, list):
        return [_serialize_value(item) for item in value]
    if isinstance(value, tuple):
        return [_serialize_value(item) for item in value]
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, Decimal):
        return float(value)
    return value


def _row_to_dict(row: Any) -> dict[str, Any]:
    mapper = sa_inspect(type(row))
    return {column.key: _serialize_value(getattr(row, column.key)) for column in mapper.columns}


def _columns_map(model: type) -> dict[str, Any]:
    mapper = sa_inspect(model)
    return {column.key: column for column in mapper.columns}


def _hidden_response_fields(table_name: str) -> set[str]:
    if table_name == "admin_users":
        return {"password_hash"}
    return set()


def _protected_input_fields(table_name: str) -> set[str]:
    if table_name == "admin_users":
        return {"password_hash"}
    return set()


def _sanitize_payload(
    model: type,
    table_name: str,
    payload: dict[str, Any],
    *,
    is_update: bool,
    allow_protected_fields: set[str] | None = None,
) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Тело запроса должно быть JSON-объектом")

    columns = _columns_map(model)
    allowed_hidden = set(allow_protected_fields or set())
    mutable_columns = {
        name
        for name in columns.keys()
        if name not in SYSTEM_FIELDS and (name not in _protected_input_fields(table_name) or name in allowed_hidden)
    }

    unknown_fields = sorted(set(payload.keys()) - mutable_columns)
    if unknown_fields:
        raise HTTPException(status_code=400, detail="Неизвестные поля: " + ", ".join(unknown_fields))

    cleaned: dict[str, Any] = {}
    for key, value in payload.items():
        column = columns[key]
        if value is None and not column.nullable:
            raise HTTPException(status_code=400, detail=f'Поле "{key}" не может быть null')
        cleaned[key] = value

    if is_update:
        if not cleaned:
            raise HTTPException(status_code=400, detail="Нет полей для обновления")
        return cleaned

    required_missing: list[str] = []
    for name, column in columns.items():
        if name in SYSTEM_FIELDS:
            continue
        if column.nullable:
            continue
        if column.default is not None or column.server_default is not None:
            continue
        if name not in cleaned:
            required_missing.append(name)
    if required_missing:
        raise HTTPException(status_code=400, detail="Отсутствуют обязательные поля: " + ", ".join(sorted(required_missing)))

    return cleaned


def _pk_value(model: type, row_id: str) -> Any:
    pk = sa_inspect(model).primary_key
    if len(pk) != 1:
        raise HTTPException(status_code=400, detail="Поддерживаются только таблицы с одним первичным ключом")
    pk_column = pk[0]
    try:
        python_type = pk_column.type.python_type
    except Exception:
        python_type = str
    if python_type is uuid.UUID:
        try:
            return uuid.UUID(str(row_id))
        except ValueError:
            raise HTTPException(status_code=400, detail="Некорректный идентификатор")
    return row_id


def _load_row_or_404(db: Session, model: type, row_id: str):
    entity = db.get(model, _pk_value(model, row_id))
    if entity is None:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    return entity


def _prepare_create_payload(table_name: str, payload: dict[str, Any]) -> dict[str, Any]:
    data = dict(payload)
    if table_name == "requests":
        track_number = str(data.get("track_number") or "").strip()
        data["track_number"] = track_number or f"TRK-{uuid.uuid4().hex[:10].upper()}"
        if data.get("extra_fields") is None:
            data["extra_fields"] = {}
    return data


def _normalize_optional_string(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None


def _apply_admin_user_fields_for_create(payload: dict[str, Any]) -> dict[str, Any]:
    data = dict(payload)
    if "password_hash" in data:
        raise HTTPException(status_code=400, detail='Поле "password_hash" недоступно для записи')
    raw_password = str(data.pop("password", "")).strip()
    if not raw_password:
        raise HTTPException(status_code=400, detail="Пароль обязателен")
    role = str(data.get("role") or "").strip().upper()
    if role not in ALLOWED_ADMIN_ROLES:
        raise HTTPException(status_code=400, detail="Некорректная роль")
    email = str(data.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email обязателен")
    data["email"] = email
    data["role"] = role
    data["avatar_url"] = _normalize_optional_string(data.get("avatar_url"))
    data["primary_topic_code"] = _normalize_optional_string(data.get("primary_topic_code"))
    data["password_hash"] = hash_password(raw_password)
    return data


def _apply_admin_user_fields_for_update(payload: dict[str, Any]) -> dict[str, Any]:
    data = dict(payload)
    if "password_hash" in data:
        raise HTTPException(status_code=400, detail='Поле "password_hash" недоступно для записи')
    if "password" in data:
        raw_password = str(data.pop("password") or "").strip()
        if not raw_password:
            raise HTTPException(status_code=400, detail="Пароль не может быть пустым")
        data["password_hash"] = hash_password(raw_password)
    if "role" in data:
        role = str(data.get("role") or "").strip().upper()
        if role not in ALLOWED_ADMIN_ROLES:
            raise HTTPException(status_code=400, detail="Некорректная роль")
        data["role"] = role
    if "email" in data:
        email = str(data.get("email") or "").strip().lower()
        if not email:
            raise HTTPException(status_code=400, detail="Email не может быть пустым")
        data["email"] = email
    if "avatar_url" in data:
        data["avatar_url"] = _normalize_optional_string(data.get("avatar_url"))
    if "primary_topic_code" in data:
        data["primary_topic_code"] = _normalize_optional_string(data.get("primary_topic_code"))
    return data


def _parse_uuid_or_400(value: Any, field_name: str) -> uuid.UUID:
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail=f'Поле "{field_name}" должно быть UUID')


def _apply_admin_user_topics_fields(db: Session, payload: dict[str, Any]) -> dict[str, Any]:
    data = dict(payload)
    if "admin_user_id" in data:
        user_id = _parse_uuid_or_400(data.get("admin_user_id"), "admin_user_id")
        user = db.get(AdminUser, user_id)
        if user is None:
            raise HTTPException(status_code=400, detail="Пользователь не найден")
        if str(user.role or "").upper() != "LAWYER":
            raise HTTPException(status_code=400, detail="Дополнительные темы доступны только для юриста")
        data["admin_user_id"] = user_id
    if "topic_code" in data:
        topic_code = str(data.get("topic_code") or "").strip()
        if not topic_code:
            raise HTTPException(status_code=400, detail='Поле "topic_code" не может быть пустым')
        topic_exists = db.query(Topic.id).filter(Topic.code == topic_code).first()
        if topic_exists is None:
            raise HTTPException(status_code=400, detail="Тема не найдена")
        data["topic_code"] = topic_code
    return data


def _ensure_topic_exists_or_400(db: Session, topic_code: str) -> None:
    exists = db.query(Topic.id).filter(Topic.code == topic_code).first()
    if exists is None:
        raise HTTPException(status_code=400, detail="Тема не найдена")


def _ensure_form_field_exists_or_400(db: Session, field_key: str) -> None:
    exists = db.query(FormField.id).filter(FormField.key == field_key).first()
    if exists is None:
        raise HTTPException(status_code=400, detail="Поле формы не найдено")


def _ensure_status_exists_or_400(db: Session, status_code: str) -> None:
    exists = db.query(Status.id).filter(Status.code == status_code).first()
    if exists is None:
        raise HTTPException(status_code=400, detail="Статус не найден")


def _as_positive_int_or_400(value: Any, field_name: str) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail=f'Поле "{field_name}" должно быть целым числом')
    if number <= 0:
        raise HTTPException(status_code=400, detail=f'Поле "{field_name}" должно быть больше 0')
    return number


def _apply_topic_required_fields_fields(db: Session, payload: dict[str, Any]) -> dict[str, Any]:
    data = dict(payload)
    if "topic_code" in data:
        topic_code = str(data.get("topic_code") or "").strip()
        if not topic_code:
            raise HTTPException(status_code=400, detail='Поле "topic_code" не может быть пустым')
        _ensure_topic_exists_or_400(db, topic_code)
        data["topic_code"] = topic_code
    if "field_key" in data:
        field_key = str(data.get("field_key") or "").strip()
        if not field_key:
            raise HTTPException(status_code=400, detail='Поле "field_key" не может быть пустым')
        _ensure_form_field_exists_or_400(db, field_key)
        data["field_key"] = field_key
    return data


def _apply_topic_data_templates_fields(db: Session, payload: dict[str, Any]) -> dict[str, Any]:
    data = dict(payload)
    if "topic_code" in data:
        topic_code = str(data.get("topic_code") or "").strip()
        if not topic_code:
            raise HTTPException(status_code=400, detail='Поле "topic_code" не может быть пустым')
        _ensure_topic_exists_or_400(db, topic_code)
        data["topic_code"] = topic_code
    if "key" in data:
        key = str(data.get("key") or "").strip()
        if not key:
            raise HTTPException(status_code=400, detail='Поле "key" не может быть пустым')
        data["key"] = key
    return data


def _apply_request_data_requirements_fields(db: Session, payload: dict[str, Any]) -> dict[str, Any]:
    data = dict(payload)
    if "request_id" in data:
        request_id = _parse_uuid_or_400(data.get("request_id"), "request_id")
        request = db.get(Request, request_id)
        if request is None:
            raise HTTPException(status_code=400, detail="Заявка не найдена")
        data["request_id"] = request_id
    if "topic_template_id" in data and data.get("topic_template_id") is not None:
        template_id = _parse_uuid_or_400(data.get("topic_template_id"), "topic_template_id")
        template = db.get(TopicDataTemplate, template_id)
        if template is None:
            raise HTTPException(status_code=400, detail="Шаблон темы не найден")
        data["topic_template_id"] = template_id
    if "key" in data:
        key = str(data.get("key") or "").strip()
        if not key:
            raise HTTPException(status_code=400, detail='Поле "key" не может быть пустым')
        data["key"] = key
    return data


def _apply_topic_status_transitions_fields(db: Session, payload: dict[str, Any]) -> dict[str, Any]:
    data = dict(payload)
    topic_code = None
    from_status = None
    to_status = None

    if "topic_code" in data:
        topic_code = str(data.get("topic_code") or "").strip()
        if not topic_code:
            raise HTTPException(status_code=400, detail='Поле "topic_code" не может быть пустым')
        _ensure_topic_exists_or_400(db, topic_code)
        data["topic_code"] = topic_code
    if "from_status" in data:
        from_status = str(data.get("from_status") or "").strip()
        if not from_status:
            raise HTTPException(status_code=400, detail='Поле "from_status" не может быть пустым')
        _ensure_status_exists_or_400(db, from_status)
        data["from_status"] = from_status
    if "to_status" in data:
        to_status = str(data.get("to_status") or "").strip()
        if not to_status:
            raise HTTPException(status_code=400, detail='Поле "to_status" не может быть пустым')
        _ensure_status_exists_or_400(db, to_status)
        data["to_status"] = to_status

    if from_status and to_status and from_status == to_status:
        raise HTTPException(status_code=400, detail='Поля "from_status" и "to_status" не должны совпадать')

    if "sla_hours" in data:
        raw = data.get("sla_hours")
        if raw is None or str(raw).strip() == "":
            data["sla_hours"] = None
        else:
            data["sla_hours"] = _as_positive_int_or_400(raw, "sla_hours")

    return data


_RU_TO_LATIN = {
    "а": "a",
    "б": "b",
    "в": "v",
    "г": "g",
    "д": "d",
    "е": "e",
    "ё": "e",
    "ж": "zh",
    "з": "z",
    "и": "i",
    "й": "y",
    "к": "k",
    "л": "l",
    "м": "m",
    "н": "n",
    "о": "o",
    "п": "p",
    "р": "r",
    "с": "s",
    "т": "t",
    "у": "u",
    "ф": "f",
    "х": "h",
    "ц": "ts",
    "ч": "ch",
    "ш": "sh",
    "щ": "sch",
    "ъ": "",
    "ы": "y",
    "ь": "",
    "э": "e",
    "ю": "yu",
    "я": "ya",
}


def _slugify(value: str, fallback: str) -> str:
    raw = str(value or "").strip().lower()
    if not raw:
        return fallback
    latin = "".join(_RU_TO_LATIN.get(ch, ch) for ch in raw)
    out: list[str] = []
    prev_dash = False
    for ch in latin:
        if ("a" <= ch <= "z") or ("0" <= ch <= "9"):
            out.append(ch)
            prev_dash = False
            continue
        if not prev_dash:
            out.append("-")
            prev_dash = True
    slug = "".join(out).strip("-")
    return slug or fallback


def _make_unique_value(db: Session, model: type, field_name: str, base_value: str) -> str:
    columns = _columns_map(model)
    column = columns[field_name]
    max_len = getattr(column.type, "length", None)
    base = base_value.strip("-") or field_name
    if max_len:
        base = base[:max_len]

    field = getattr(model, field_name)
    if not db.query(model).filter(field == base).first():
        return base

    idx = 2
    while True:
        suffix = f"-{idx}"
        candidate = base
        if max_len and len(candidate) + len(suffix) > max_len:
            candidate = candidate[: max_len - len(suffix)]
        candidate = (candidate + suffix).strip("-")
        if not db.query(model).filter(field == candidate).first():
            return candidate
        idx += 1


def _apply_auto_fields_for_create(db: Session, model: type, table_name: str, payload: dict[str, Any]) -> dict[str, Any]:
    data = dict(payload)
    if table_name == "topics" and not str(data.get("code") or "").strip():
        base = _slugify(str(data.get("name") or ""), "topic")
        data["code"] = _make_unique_value(db, model, "code", base)
    if table_name == "statuses" and not str(data.get("code") or "").strip():
        base = _slugify(str(data.get("name") or ""), "status")
        data["code"] = _make_unique_value(db, model, "code", base)
    if table_name == "form_fields" and not str(data.get("key") or "").strip():
        base = _slugify(str(data.get("label") or ""), "field")
        data["key"] = _make_unique_value(db, model, "key", base)
    if table_name == "admin_users":
        data = _apply_admin_user_fields_for_create(data)
    return data


def _resolve_responsible(admin: dict | None) -> str:
    if not admin:
        return "Администратор системы"
    email = str(admin.get("email") or "").strip()
    return email or "Администратор системы"


def _strip_hidden_fields(table_name: str, payload: dict[str, Any]) -> dict[str, Any]:
    hidden = _hidden_response_fields(table_name)
    if not hidden:
        return payload
    return {k: v for k, v in payload.items() if k not in hidden}


def _actor_uuid(admin: dict) -> uuid.UUID | None:
    sub = admin.get("sub")
    if not sub:
        return None
    try:
        return uuid.UUID(str(sub))
    except ValueError:
        return None


def _append_audit(db: Session, admin: dict, table_name: str, entity_id: str, action: str, diff: dict[str, Any]) -> None:
    db.add(
        AuditLog(
            actor_admin_id=_actor_uuid(admin),
            entity=table_name,
            entity_id=str(entity_id),
            action=action,
            diff=diff,
        )
    )


def _integrity_error(detail: str = "Нарушение ограничений данных") -> HTTPException:
    return HTTPException(status_code=400, detail=detail)


def _actor_role(admin: dict) -> str:
    role = str(admin.get("role") or "").strip().upper()
    return role or "ADMIN"


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


@router.post("/{table_name}/query")
def query_table(
    table_name: str,
    uq: UniversalQuery,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    normalized, model = _resolve_table_model(table_name)
    _require_table_action(admin, normalized, "query")
    query = apply_universal_query(db.query(model), model, uq)
    total = query.count()
    rows = query.offset(uq.page.offset).limit(uq.page.limit).all()
    return {"rows": [_strip_hidden_fields(normalized, _row_to_dict(row)) for row in rows], "total": total}


@router.get("/{table_name}/{row_id}")
def get_row(
    table_name: str,
    row_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    normalized, model = _resolve_table_model(table_name)
    _require_table_action(admin, normalized, "read")
    row = _load_row_or_404(db, model, row_id)
    if normalized == "requests":
        req = row if isinstance(row, Request) else None
        if req is not None:
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
    return _strip_hidden_fields(normalized, _row_to_dict(row))


@router.post("/{table_name}", status_code=201)
def create_row(
    table_name: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    normalized, model = _resolve_table_model(table_name)
    _require_table_action(admin, normalized, "create")
    if normalized == "requests" and _is_lawyer(admin):
        assigned_lawyer_id = payload.get("assigned_lawyer_id") if isinstance(payload, dict) else None
        if str(assigned_lawyer_id or "").strip():
            raise HTTPException(status_code=403, detail='Юрист не может назначать заявку при создании')

    prepared = _prepare_create_payload(normalized, payload)
    if normalized == "requests":
        validate_required_topic_fields_or_400(db, prepared.get("topic_code"), prepared.get("extra_fields"))
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
    if normalized == "request_data_requirements":
        clean_payload = _apply_request_data_requirements_fields(db, clean_payload)
    if normalized == "topic_status_transitions":
        clean_payload = _apply_topic_status_transitions_fields(db, clean_payload)
    if "responsible" in _columns_map(model):
        clean_payload["responsible"] = _resolve_responsible(admin)
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


@router.patch("/{table_name}/{row_id}")
def update_row(
    table_name: str,
    row_id: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    normalized, model = _resolve_table_model(table_name)
    _require_table_action(admin, normalized, "update")
    if normalized == "requests" and _is_lawyer(admin) and isinstance(payload, dict) and "assigned_lawyer_id" in payload:
        raise HTTPException(status_code=403, detail='Назначение доступно только через действие "Взять в работу"')
    row = _load_row_or_404(db, model, row_id)
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
    if normalized == "request_data_requirements":
        clean_payload = _apply_request_data_requirements_fields(db, clean_payload)
    if normalized == "topic_status_transitions":
        clean_payload = _apply_topic_status_transitions_fields(db, clean_payload)
    before = _row_to_dict(row)
    if normalized == "topic_status_transitions":
        next_from = str(clean_payload.get("from_status", before.get("from_status") or "")).strip()
        next_to = str(clean_payload.get("to_status", before.get("to_status") or "")).strip()
        if next_from and next_to and next_from == next_to:
            raise HTTPException(status_code=400, detail='Поля "from_status" и "to_status" не должны совпадать')
    if normalized == "requests" and "status_code" in clean_payload:
        before_status = str(before.get("status_code") or "")
        after_status = str(clean_payload.get("status_code") or "")
        topic_code = str(before.get("topic_code") or "").strip() or None
        if not transition_allowed_for_topic(db, topic_code, before_status, after_status):
            raise HTTPException(
                status_code=400,
                detail="Переход статуса не разрешен для выбранной темы",
            )
        if before_status != after_status and isinstance(row, Request):
            mark_unread_for_client(row, EVENT_STATUS)
            apply_status_change_effects(
                db,
                row,
                from_status=before_status,
                to_status=after_status,
                admin=admin,
                responsible=_resolve_responsible(admin),
            )
            notify_request_event(
                db,
                request=row,
                event_type=NOTIFICATION_EVENT_STATUS,
                actor_role=_actor_role(admin),
                actor_admin_user_id=admin.get("sub"),
                body=f"{before_status} -> {after_status}",
                responsible=_resolve_responsible(admin),
            )
    for key, value in clean_payload.items():
        setattr(row, key, value)

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


@router.delete("/{table_name}/{row_id}")
def delete_row(
    table_name: str,
    row_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    normalized, model = _resolve_table_model(table_name)
    _require_table_action(admin, normalized, "delete")
    if normalized == "admin_users" and str(admin.get("sub") or "") == str(row_id):
        raise HTTPException(status_code=400, detail="Нельзя удалить собственную учетную запись")
    row = _load_row_or_404(db, model, row_id)
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
