from __future__ import annotations

import importlib
import json
import pkgutil
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from functools import lru_cache
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.inspection import inspect as sa_inspect
from sqlalchemy.orm import Session
from sqlalchemy.sql.sqltypes import Boolean, Date, DateTime, Float, Integer, JSON, Numeric

import app.models as models_pkg
from app.core.deps import get_current_admin
from app.core.security import hash_password
from app.db.session import Base, get_db
from app.models.admin_user import AdminUser
from app.models.audit_log import AuditLog
from app.models.form_field import FormField
from app.models.client import Client
from app.models.table_availability import TableAvailability
from app.models.request_data_requirement import RequestDataRequirement
from app.models.request_data_template import RequestDataTemplate
from app.models.request_data_template_item import RequestDataTemplateItem
from app.models.attachment import Attachment
from app.models.message import Message
from app.models.request import Request
from app.models.status import Status
from app.models.status_group import StatusGroup
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
from app.services.status_transition_requirements import validate_transition_requirements_or_400
from app.services.billing_flow import apply_billing_transition_effects, normalize_status_kind_or_400
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
REQUEST_FINANCIAL_FIELDS = {"effective_rate", "invoice_amount", "paid_at", "paid_by_admin_id"}
REQUEST_CALCULATED_FIELDS = {"invoice_amount", "paid_at", "paid_by_admin_id", "total_attachments_bytes"}
INVOICE_CALCULATED_FIELDS = {"issued_by_admin_user_id", "issued_by_role", "issued_at", "paid_at"}
ALLOWED_ADMIN_ROLES = {"ADMIN", "LAWYER"}
ALLOWED_REQUEST_DATA_VALUE_TYPES = {"string", "text", "date", "number", "file"}

# Per-table RBAC: table -> role -> actions.
# If a table is missing here, fallback rules are used.
TABLE_ROLE_ACTIONS: dict[str, dict[str, set[str]]] = {
    "requests": {
        "ADMIN": set(CRUD_ACTIONS),
        "LAWYER": set(CRUD_ACTIONS),
    },
    "messages": {
        "ADMIN": set(CRUD_ACTIONS),
        "LAWYER": {"query", "read", "create"},
    },
    "attachments": {
        "ADMIN": set(CRUD_ACTIONS),
        "LAWYER": {"query", "read"},
    },
    "quotes": {"ADMIN": set(CRUD_ACTIONS)},
    "topics": {"ADMIN": set(CRUD_ACTIONS)},
    "statuses": {"ADMIN": set(CRUD_ACTIONS)},
    "status_groups": {"ADMIN": set(CRUD_ACTIONS)},
    "form_fields": {"ADMIN": set(CRUD_ACTIONS)},
    "clients": {"ADMIN": set(CRUD_ACTIONS)},
    "table_availability": {"ADMIN": set(CRUD_ACTIONS)},
    "audit_log": {"ADMIN": {"query", "read"}},
    "security_audit_log": {"ADMIN": {"query", "read"}},
    "otp_sessions": {"ADMIN": {"query", "read"}},
    "admin_users": {"ADMIN": set(CRUD_ACTIONS)},
    "admin_user_topics": {"ADMIN": set(CRUD_ACTIONS)},
    "landing_featured_staff": {"ADMIN": set(CRUD_ACTIONS)},
    "topic_status_transitions": {"ADMIN": set(CRUD_ACTIONS)},
    "topic_required_fields": {"ADMIN": set(CRUD_ACTIONS)},
    "topic_data_templates": {"ADMIN": set(CRUD_ACTIONS)},
    "request_data_templates": {"ADMIN": set(CRUD_ACTIONS)},
    "request_data_template_items": {"ADMIN": set(CRUD_ACTIONS)},
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


def _lawyer_actor_id_or_401(admin: dict) -> str:
    actor_id = str(admin.get("sub") or "").strip()
    if not actor_id:
        raise HTTPException(status_code=401, detail="Некорректный токен")
    return actor_id


def _ensure_lawyer_can_view_request_or_403(admin: dict, req: Request) -> None:
    if not _is_lawyer(admin):
        return
    actor_id = _lawyer_actor_id_or_401(admin)
    assigned = str(req.assigned_lawyer_id or "").strip()
    if assigned and assigned != actor_id:
        raise HTTPException(status_code=403, detail="Юрист может видеть только свои и неназначенные заявки")


def _ensure_lawyer_can_manage_request_or_403(admin: dict, req: Request) -> None:
    if not _is_lawyer(admin):
        return
    actor_id = _lawyer_actor_id_or_401(admin)
    assigned = str(req.assigned_lawyer_id or "").strip()
    if not assigned or assigned != actor_id:
        raise HTTPException(status_code=403, detail="Юрист может работать только со своими назначенными заявками")


def _request_for_related_row_or_404(db: Session, row: Any) -> Request:
    request_id = getattr(row, "request_id", None)
    if request_id is None:
        raise HTTPException(status_code=400, detail="Связанная заявка не найдена")
    req = db.get(Request, request_id)
    if req is None:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    return req


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


def _column_kind(column: Any) -> str:
    col_type = column.type
    if isinstance(col_type, Boolean):
        return "boolean"
    if isinstance(col_type, (Integer, Numeric, Float)):
        return "number"
    if isinstance(col_type, DateTime):
        return "datetime"
    if isinstance(col_type, Date):
        return "date"
    if isinstance(col_type, JSON):
        return "json"
    try:
        python_type = col_type.python_type
    except Exception:
        python_type = None
    if python_type is uuid.UUID:
        return "uuid"
    return "text"


def _table_label(table_name: str) -> str:
    normalized = _normalize_table_name(table_name)
    if not normalized:
        return "Таблица"

    explicit_labels = {
        "requests": "Заявки",
        "invoices": "Счета",
        "quotes": "Цитаты",
        "topics": "Темы",
        "statuses": "Статусы",
        "status_groups": "Группы статусов",
        "form_fields": "Поля формы",
        "clients": "Клиенты",
        "table_availability": "Доступность таблиц",
        "topic_required_fields": "Обязательные поля темы",
        "topic_data_templates": "Дополнительные данные",
        "request_data_templates": "Шаблоны доп. данных",
        "request_data_template_items": "Набор данных шаблона",
        "topic_status_transitions": "Переходы статусов темы",
        "admin_users": "Пользователи",
        "admin_user_topics": "Дополнительные темы юристов",
        "landing_featured_staff": "Карусель сотрудников лендинга",
        "attachments": "Вложения",
        "messages": "Сообщения",
        "audit_log": "Журнал аудита",
        "security_audit_log": "Журнал безопасности файлов",
        "status_history": "История статусов",
        "request_data_requirements": "Требования данных заявки",
        "otp_sessions": "OTP-сессии",
        "notifications": "Уведомления",
    }
    if normalized in explicit_labels:
        return explicit_labels[normalized]

    return _humanize_identifier_ru(normalized)


def _humanize_identifier_ru(identifier: str) -> str:
    normalized = _normalize_table_name(identifier)
    if not normalized:
        return "Таблица"

    token_labels = {
        "request": "заявка",
        "requests": "заявки",
        "invoice": "счет",
        "invoices": "счета",
        "topic": "тема",
        "topics": "темы",
        "status": "статус",
        "statuses": "статусы",
        "transition": "переход",
        "transitions": "переходы",
        "required": "обязательные",
        "form": "формы",
        "field": "поле",
        "fields": "поля",
        "template": "шаблон",
        "templates": "шаблоны",
        "data": "данных",
        "requirement": "требование",
        "requirements": "требования",
        "admin": "админ",
        "user": "пользователь",
        "users": "пользователи",
        "quote": "цитата",
        "quotes": "цитаты",
        "message": "сообщение",
        "messages": "сообщения",
        "attachment": "вложение",
        "attachments": "вложения",
        "notification": "уведомление",
        "notifications": "уведомления",
        "audit": "аудита",
        "security": "безопасности",
        "log": "журнал",
        "history": "история",
        "otp": "OTP",
        "session": "сессия",
        "sessions": "сессии",
        "id": "ID",
    }
    words = [token_labels.get(token, token) for token in normalized.split("_") if token]
    if not words:
        return "Таблица"
    phrase = " ".join(words).strip()
    return phrase[:1].upper() + phrase[1:] if phrase else "Таблица"


def _column_label(table_name: str, column_name: str) -> str:
    normalized_table = _normalize_table_name(table_name)
    normalized_column = _normalize_table_name(column_name)
    if not normalized_column:
        return "Поле"

    table_overrides = {
        ("invoices", "request_id"): "ID заявки",
        ("invoices", "issued_by_admin_user_id"): "ID сотрудника",
        ("request_data_requirements", "request_id"): "ID заявки",
    }
    if (normalized_table, normalized_column) in table_overrides:
        return table_overrides[(normalized_table, normalized_column)]

    explicit = {
        "id": "ID",
        "code": "Код",
        "key": "Ключ",
        "name": "Название",
        "label": "Метка",
        "caption": "Подпись",
        "value_type": "Тип значения",
        "document_name": "Документ",
        "request_data_template_id": "Шаблон",
        "request_data_template_item_id": "Элемент шаблона",
        "text": "Текст",
        "description": "Описание",
        "request_message_id": "ID сообщения запроса",
        "field_type": "Тип поля",
        "value_text": "Данные",
        "author": "Автор",
        "source": "Источник",
        "email": "Email",
        "role": "Роль",
        "kind": "Тип",
        "status_group_id": "Группа",
        "status": "Статус",
        "status_code": "Статус",
        "topic_code": "Тема",
        "from_status": "Из статуса",
        "to_status": "В статус",
        "track_number": "Номер заявки",
        "invoice_number": "Номер счета",
        "invoice_template": "Шаблон счета",
        "amount": "Сумма",
        "currency": "Валюта",
        "client_name": "Клиент",
        "client_id": "Клиент (ID)",
        "client_phone": "Телефон",
        "payer_display_name": "Плательщик",
        "payer_details_encrypted": "Реквизиты (шифр.)",
        "issued_at": "Дата формирования",
        "paid_at": "Дата оплаты",
        "created_at": "Дата создания",
        "updated_at": "Дата обновления",
        "responsible": "Ответственный",
        "sort_order": "Порядок",
        "pinned": "Закреплен",
        "is_active": "Активен",
        "enabled": "Активен",
        "required": "Обязательное",
        "nullable": "Может быть пустым",
        "is_terminal": "Терминальный",
        "request_id": "ID заявки",
        "admin_user_id": "ID пользователя",
        "assigned_lawyer_id": "Назначенный юрист",
        "issued_by_admin_user_id": "ID сотрудника",
        "primary_topic_code": "Профильная тема",
        "default_rate": "Ставка по умолчанию",
        "effective_rate": "Ставка (фикс.)",
        "request_cost": "Стоимость заявки",
        "salary_percent": "Процент зарплаты",
        "invoice_amount": "Сумма счета",
        "paid_by_admin_id": "Оплату подтвердил",
        "extra_fields": "Доп. поля",
        "total_attachments_bytes": "Размер вложений (байт)",
        "type": "Тип",
        "options": "Опции",
        "field_key": "Поле формы",
        "sla_hours": "SLA (часы)",
        "required_data_keys": "Обязательные данные шага",
        "required_mime_types": "Обязательные файлы шага",
        "avatar_url": "Аватар",
        "file_name": "Имя файла",
        "mime_type": "MIME-тип",
        "size_bytes": "Размер (байт)",
        "s3_key": "Ключ S3",
        "author_type": "Автор",
        "is_fulfilled": "Выполнено",
        "requested_by_admin_user_id": "Запросил сотрудник",
        "fulfilled_at": "Дата выполнения",
        "title": "Заголовок",
        "body": "Текст",
        "event_type": "Тип события",
        "is_read": "Прочитано",
        "read_at": "Дата прочтения",
        "notified_at": "Дата уведомления",
        "otp_code": "OTP-код",
        "phone": "Телефон",
        "verified_at": "Подтверждено",
        "expires_at": "Истекает",
        "action": "Действие",
        "entity": "Сущность",
        "entity_id": "ID сущности",
        "actor_admin_id": "ID автора",
        "actor_role": "Роль субъекта",
        "actor_subject": "Субъект",
        "actor_ip": "IP адрес",
        "allowed": "Разрешено",
        "reason": "Причина",
        "diff": "Изменения",
        "details": "Детали",
        "table_name": "Таблица",
    }
    if normalized_column in explicit:
        return explicit[normalized_column]

    return _humanize_identifier_ru(normalized_column)


def _pluralize_identifier(base: str) -> list[str]:
    token = _normalize_table_name(base)
    if not token:
        return []
    candidates = [token]
    if token.endswith("y"):
        candidates.append(token[:-1] + "ies")
    candidates.append(token + "s")
    return list(dict.fromkeys(candidates))


def _reference_override(table_name: str, column_name: str) -> tuple[str, str] | None:
    normalized_table = _normalize_table_name(table_name)
    normalized_column = _normalize_table_name(column_name)
    explicit: dict[tuple[str, str], tuple[str, str]] = {
        ("requests", "assigned_lawyer_id"): ("admin_users", "id"),
        ("requests", "paid_by_admin_id"): ("admin_users", "id"),
        ("requests", "topic_code"): ("topics", "code"),
        ("requests", "status_code"): ("statuses", "code"),
        ("statuses", "status_group_id"): ("status_groups", "id"),
        ("topic_required_fields", "topic_code"): ("topics", "code"),
        ("topic_required_fields", "field_key"): ("form_fields", "key"),
        ("topic_data_templates", "topic_code"): ("topics", "code"),
        ("request_data_templates", "topic_code"): ("topics", "code"),
        ("request_data_templates", "created_by_admin_id"): ("admin_users", "id"),
        ("request_data_template_items", "request_data_template_id"): ("request_data_templates", "id"),
        ("request_data_template_items", "topic_data_template_id"): ("topic_data_templates", "id"),
        ("topic_status_transitions", "topic_code"): ("topics", "code"),
        ("topic_status_transitions", "from_status"): ("statuses", "code"),
        ("topic_status_transitions", "to_status"): ("statuses", "code"),
        ("admin_users", "primary_topic_code"): ("topics", "code"),
        ("admin_user_topics", "admin_user_id"): ("admin_users", "id"),
        ("admin_user_topics", "topic_code"): ("topics", "code"),
        ("landing_featured_staff", "admin_user_id"): ("admin_users", "id"),
        ("request_data_requirements", "request_id"): ("requests", "id"),
        ("request_data_requirements", "topic_template_id"): ("topic_data_templates", "id"),
        ("request_data_requirements", "created_by_admin_id"): ("admin_users", "id"),
        ("messages", "request_id"): ("requests", "id"),
        ("attachments", "request_id"): ("requests", "id"),
        ("attachments", "message_id"): ("messages", "id"),
        ("invoices", "request_id"): ("requests", "id"),
        ("invoices", "client_id"): ("clients", "id"),
        ("invoices", "issued_by_admin_user_id"): ("admin_users", "id"),
        ("notifications", "recipient_admin_user_id"): ("admin_users", "id"),
        ("status_history", "request_id"): ("requests", "id"),
        ("status_history", "changed_by_admin_id"): ("admin_users", "id"),
        ("audit_log", "actor_admin_id"): ("admin_users", "id"),
    }
    if (normalized_table, normalized_column) in explicit:
        return explicit[(normalized_table, normalized_column)]
    return None


def _detect_reference_for_column(table_name: str, column_name: str) -> tuple[str, str] | None:
    override = _reference_override(table_name, column_name)
    if override is not None:
        return override

    normalized = _normalize_table_name(column_name)
    table_models = _table_model_map()

    if normalized.endswith("_id") and normalized not in {"id"}:
        base = normalized[:-3]
        for candidate in _pluralize_identifier(base):
            if candidate in table_models:
                return candidate, "id"
        if base.endswith("_admin_user"):
            return "admin_users", "id"
        if base.endswith("_lawyer"):
            return "admin_users", "id"

    if normalized.endswith("_code"):
        base = normalized[:-5]
        for candidate in _pluralize_identifier(base):
            if candidate in table_models:
                return candidate, "code"

    return None


def _reference_label_field(table_name: str, value_field: str) -> str:
    explicit = {
        "admin_users": "name",
        "clients": "full_name",
        "requests": "track_number",
        "topics": "name",
        "statuses": "name",
        "status_groups": "name",
        "form_fields": "label",
        "topic_data_templates": "label",
        "request_data_templates": "name",
        "request_data_template_items": "label",
        "invoices": "invoice_number",
        "messages": "body",
        "attachments": "file_name",
    }
    if table_name in explicit:
        return explicit[table_name]

    _, model = _resolve_table_model(table_name)
    mapper = sa_inspect(model)
    hidden = _hidden_response_fields(table_name)
    blocked = {"id", value_field, "created_at", "updated_at", "responsible"}
    for column in mapper.columns:
        name = str(column.key)
        if name in hidden or name in blocked:
            continue
        return name
    return value_field


def _reference_meta_for_column(table_name: str, column_name: str) -> dict[str, str] | None:
    detected = _detect_reference_for_column(table_name, column_name)
    if detected is None:
        return None
    ref_table, value_field = detected
    try:
        label_field = _reference_label_field(ref_table, value_field)
    except HTTPException:
        return None
    return {
        "table": ref_table,
        "value_field": value_field,
        "label_field": label_field,
    }


def _default_sort_for_table(model: type) -> list[dict[str, str]]:
    columns = _columns_map(model)
    if "sort_order" in columns:
        return [{"field": "sort_order", "dir": "asc"}]
    if "created_at" in columns:
        return [{"field": "created_at", "dir": "desc"}]
    pk = sa_inspect(model).primary_key
    if pk:
        return [{"field": pk[0].key, "dir": "asc"}]
    return []


def _table_columns_meta(table_name: str, model: type) -> list[dict[str, Any]]:
    mapper = sa_inspect(model)
    hidden = _hidden_response_fields(table_name)
    protected = _protected_input_fields(table_name)
    primary_keys = {column.key for column in mapper.primary_key}
    out: list[dict[str, Any]] = []
    for column in mapper.columns:
        name = column.key
        if name in hidden:
            continue
        kind = _column_kind(column)
        has_default = column.default is not None or column.server_default is not None or name in primary_keys
        editable = name not in SYSTEM_FIELDS and name not in protected and name not in primary_keys
        item = {
            "name": name,
            "label": _column_label(table_name, name),
            "kind": kind,
            "nullable": bool(column.nullable),
            "editable": bool(editable),
            "sortable": True,
            "filterable": kind != "json",
            "required_on_create": not bool(column.nullable) and not bool(has_default) and bool(editable),
            "has_default": bool(has_default),
            "is_primary_key": name in primary_keys,
        }
        reference = _reference_meta_for_column(table_name, name)
        if reference is not None:
            item["reference"] = reference
        out.append(item)
    return out


def _hidden_response_fields(table_name: str) -> set[str]:
    if table_name == "admin_users":
        return {"password_hash"}
    return set()


def _protected_input_fields(table_name: str) -> set[str]:
    if table_name == "admin_users":
        return {"password_hash"}
    if table_name == "requests":
        return {"client_id", *REQUEST_CALCULATED_FIELDS}
    if table_name == "invoices":
        return {"client_id", *INVOICE_CALCULATED_FIELDS}
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


def _normalize_client_phone(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    allowed = {"+", "(", ")", "-", " "}
    return "".join(ch for ch in text if ch.isdigit() or ch in allowed).strip()


def _upsert_client_or_400(db: Session, *, full_name: Any, phone: Any, responsible: str) -> Client:
    normalized_phone = _normalize_client_phone(phone)
    if not normalized_phone:
        raise HTTPException(status_code=400, detail='Поле "client_phone" обязательно')
    normalized_name = str(full_name or "").strip() or "Клиент"

    row = db.query(Client).filter(Client.phone == normalized_phone).first()
    if row is None:
        row = Client(
            full_name=normalized_name,
            phone=normalized_phone,
            responsible=responsible or "Администратор системы",
        )
        db.add(row)
        db.flush()
        return row

    changed = False
    if normalized_name and row.full_name != normalized_name:
        row.full_name = normalized_name
        changed = True
    if responsible and row.responsible != responsible:
        row.responsible = responsible
        changed = True
    if changed:
        db.add(row)
        db.flush()
    return row


def _request_for_uuid_or_400(db: Session, raw_request_id: Any) -> Request:
    request_uuid = _parse_uuid_or_400(raw_request_id, "request_id")
    req = db.get(Request, request_uuid)
    if req is None:
        raise HTTPException(status_code=400, detail="Заявка не найдена")
    return req


def _active_lawyer_or_400(db: Session, lawyer_id: Any) -> AdminUser:
    lawyer_uuid = _parse_uuid_or_400(lawyer_id, "assigned_lawyer_id")
    lawyer = db.get(AdminUser, lawyer_uuid)
    if lawyer is None or str(lawyer.role or "").upper() != "LAWYER" or not bool(lawyer.is_active):
        raise HTTPException(status_code=400, detail="Можно назначить только активного юриста")
    return lawyer


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
    if "phone" in data:
        data["phone"] = _normalize_optional_string(_normalize_client_phone(data.get("phone")))
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
    if "phone" in data:
        data["phone"] = _normalize_optional_string(_normalize_client_phone(data.get("phone")))
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


def _normalize_string_list_or_400(value: Any, field_name: str) -> list[str] | None:
    if value is None:
        return None

    source = value
    if isinstance(source, str):
        text = source.strip()
        if not text:
            return None
        if text.startswith("["):
            try:
                source = json.loads(text)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail=f'Поле "{field_name}" должно быть JSON-массивом строк')
        else:
            source = [chunk.strip() for chunk in text.replace("\n", ",").split(",")]

    if not isinstance(source, (list, tuple, set)):
        raise HTTPException(status_code=400, detail=f'Поле "{field_name}" должно быть массивом строк')

    out: list[str] = []
    seen: set[str] = set()
    for item in source:
        text = str(item or "").strip()
        if not text:
            continue
        lowered = text.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        out.append(text)
    return out


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
    if "value_type" in data:
        value_type = str(data.get("value_type") or "").strip().lower()
        if value_type not in ALLOWED_REQUEST_DATA_VALUE_TYPES:
            raise HTTPException(status_code=400, detail='Поле "value_type" должно быть одним из: string, text, date, number, file')
        data["value_type"] = value_type
    if "document_name" in data:
        data["document_name"] = _normalize_optional_string(data.get("document_name"))
    return data


def _apply_request_data_templates_fields(db: Session, payload: dict[str, Any]) -> dict[str, Any]:
    data = dict(payload)
    if "topic_code" in data:
      topic_code = str(data.get("topic_code") or "").strip()
      if not topic_code:
          raise HTTPException(status_code=400, detail='Поле "topic_code" не может быть пустым')
      _ensure_topic_exists_or_400(db, topic_code)
      data["topic_code"] = topic_code
    if "name" in data:
      name = str(data.get("name") or "").strip()
      if not name:
          raise HTTPException(status_code=400, detail='Поле "name" не может быть пустым')
      data["name"] = name
    if "description" in data:
      data["description"] = _normalize_optional_string(data.get("description"))
    if "created_by_admin_id" in data and data.get("created_by_admin_id") is not None:
      admin_id = _parse_uuid_or_400(data.get("created_by_admin_id"), "created_by_admin_id")
      admin_user = db.get(AdminUser, admin_id)
      if admin_user is None:
          raise HTTPException(status_code=400, detail="Пользователь не найден")
      data["created_by_admin_id"] = admin_id
    return data


def _apply_request_data_template_items_fields(db: Session, payload: dict[str, Any]) -> dict[str, Any]:
    data = dict(payload)
    template = None
    if "request_data_template_id" in data:
      template_id = _parse_uuid_or_400(data.get("request_data_template_id"), "request_data_template_id")
      template = db.get(RequestDataTemplate, template_id)
      if template is None:
          raise HTTPException(status_code=400, detail="Шаблон не найден")
      data["request_data_template_id"] = template_id
    if "topic_data_template_id" in data and data.get("topic_data_template_id") is not None:
      catalog_id = _parse_uuid_or_400(data.get("topic_data_template_id"), "topic_data_template_id")
      catalog = db.get(TopicDataTemplate, catalog_id)
      if catalog is None:
          raise HTTPException(status_code=400, detail="Поле доп. данных не найдено")
      data["topic_data_template_id"] = catalog_id
      if "key" not in data or not str(data.get("key") or "").strip():
          data["key"] = str(catalog.key or "").strip()
      if "label" not in data or not str(data.get("label") or "").strip():
          data["label"] = str(catalog.label or catalog.key or "").strip()
      if "value_type" not in data or not str(data.get("value_type") or "").strip():
          data["value_type"] = str(catalog.value_type or "string")
      if template is not None and str(template.topic_code or "").strip() and str(catalog.topic_code or "").strip():
          if str(template.topic_code) != str(catalog.topic_code):
              raise HTTPException(status_code=400, detail="Поле не соответствует теме шаблона")
    if "key" in data:
      key = str(data.get("key") or "").strip()
      if not key:
          raise HTTPException(status_code=400, detail='Поле "key" не может быть пустым')
      data["key"] = key[:80]
    if "label" in data:
      label = str(data.get("label") or "").strip()
      if not label:
          raise HTTPException(status_code=400, detail='Поле "label" не может быть пустым')
      data["label"] = label
    if "value_type" in data:
      value_type = str(data.get("value_type") or "").strip().lower()
      if value_type not in ALLOWED_REQUEST_DATA_VALUE_TYPES:
          raise HTTPException(status_code=400, detail='Поле "value_type" должно быть одним из: string, text, date, number, file')
      data["value_type"] = value_type
    if "sort_order" in data:
      raw = data.get("sort_order")
      if raw is None or str(raw).strip() == "":
          data["sort_order"] = 0
      else:
          try:
              data["sort_order"] = int(raw)
          except (TypeError, ValueError):
              raise HTTPException(status_code=400, detail='Поле "sort_order" должно быть целым числом')
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
    if "request_message_id" in data and data.get("request_message_id") is not None:
        data["request_message_id"] = _parse_uuid_or_400(data.get("request_message_id"), "request_message_id")
    if "key" in data:
        key = str(data.get("key") or "").strip()
        if not key:
            raise HTTPException(status_code=400, detail='Поле "key" не может быть пустым')
        data["key"] = key
    if "field_type" in data:
        field_type = str(data.get("field_type") or "").strip().lower()
        if field_type not in ALLOWED_REQUEST_DATA_VALUE_TYPES:
            raise HTTPException(status_code=400, detail='Поле "field_type" должно быть одним из: string, text, date, number, file')
        data["field_type"] = field_type
    if "document_name" in data:
        data["document_name"] = _normalize_optional_string(data.get("document_name"))
    if "value_text" in data:
        data["value_text"] = _normalize_optional_string(data.get("value_text"))
    if "sort_order" in data:
        raw_sort = data.get("sort_order")
        if raw_sort is None or str(raw_sort).strip() == "":
            data["sort_order"] = 0
        else:
            try:
                data["sort_order"] = int(raw_sort)
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail='Поле "sort_order" должно быть целым числом')
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
    if "required_data_keys" in data:
        data["required_data_keys"] = _normalize_string_list_or_400(data.get("required_data_keys"), "required_data_keys")
    if "required_mime_types" in data:
        data["required_mime_types"] = _normalize_string_list_or_400(data.get("required_mime_types"), "required_mime_types")

    return data


def _apply_status_fields(db: Session, payload: dict[str, Any]) -> dict[str, Any]:
    data = dict(payload)
    if "kind" in data:
        data["kind"] = normalize_status_kind_or_400(data.get("kind"))
    if "status_group_id" in data:
        raw_group = data.get("status_group_id")
        if raw_group is None or str(raw_group).strip() == "":
            data["status_group_id"] = None
        else:
            group_id = _parse_uuid_or_400(raw_group, "status_group_id")
            group = db.get(StatusGroup, group_id)
            if group is None:
                raise HTTPException(status_code=400, detail="Группа статусов не найдена")
            data["status_group_id"] = group_id
    if "invoice_template" in data:
        text = str(data.get("invoice_template") or "").strip()
        data["invoice_template"] = text or None
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


def _table_section(table_name: str) -> str:
    if table_name in {"requests", "invoices"}:
        return "main"
    if table_name == "table_availability":
        return "system"
    return "dictionary"


def _table_availability_map(db: Session) -> dict[str, TableAvailability]:
    rows = db.query(TableAvailability).all()
    return {str(row.table_name): row for row in rows if row and row.table_name}


def _table_is_active(table_name: str, availability: dict[str, TableAvailability]) -> bool:
    row = availability.get(table_name)
    if row is None:
        return True
    return bool(row.is_active)


def _meta_tables_payload(
    db: Session,
    *,
    role: str,
    include_inactive_dictionaries: bool,
) -> list[dict[str, Any]]:
    table_models = _table_model_map()
    availability = _table_availability_map(db)
    rows: list[dict[str, Any]] = []
    for table_name in sorted(table_models.keys()):
        model = table_models[table_name]
        section = _table_section(table_name)
        is_active = _table_is_active(table_name, availability)
        if section == "dictionary" and not include_inactive_dictionaries and not is_active:
            continue
        actions = sorted(_allowed_actions(role, table_name))
        rows.append(
            {
                "key": table_name,
                "table": table_name,
                "label": _table_label(table_name),
                "section": section,
                "is_active": is_active,
                "actions": actions,
                "query_endpoint": f"/api/admin/crud/{table_name}/query",
                "create_endpoint": f"/api/admin/crud/{table_name}",
                "update_endpoint_template": f"/api/admin/crud/{table_name}" + "/{id}",
                "delete_endpoint_template": f"/api/admin/crud/{table_name}" + "/{id}",
                "default_sort": _default_sort_for_table(model),
                "columns": _table_columns_meta(table_name, model),
            }
        )
    return rows


class TableAvailabilityUpdatePayload(BaseModel):
    is_active: bool


@router.get("/meta/tables")
def list_tables_meta(db: Session = Depends(get_db), admin: dict = Depends(get_current_admin)):
    role = str(admin.get("role") or "").upper()
    if role != "ADMIN":
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    return {"tables": _meta_tables_payload(db, role=role, include_inactive_dictionaries=False)}


@router.get("/meta/available-tables")
def list_available_tables(db: Session = Depends(get_db), admin: dict = Depends(get_current_admin)):
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


@router.patch("/meta/available-tables/{table_name}")
def update_available_table(
    table_name: str,
    payload: TableAvailabilityUpdatePayload,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    role = str(admin.get("role") or "").upper()
    if role != "ADMIN":
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    normalized, _ = _resolve_table_model(table_name)
    row = db.query(TableAvailability).filter(TableAvailability.table_name == normalized).first()
    responsible = _resolve_responsible(admin)
    is_active = bool(payload.is_active)
    if row is None:
        row = TableAvailability(
            table_name=normalized,
            is_active=is_active,
            responsible=responsible,
        )
        db.add(row)
    else:
        row.is_active = is_active
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


@router.post("/{table_name}/query")
def query_table(
    table_name: str,
    uq: UniversalQuery,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
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
    query = apply_universal_query(base_query, model, uq)
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


@router.post("/{table_name}", status_code=201)
def create_row(
    table_name: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
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
    if normalized == "topic_status_transitions":
        next_from = str(clean_payload.get("from_status", before.get("from_status") or "")).strip()
        next_to = str(clean_payload.get("to_status", before.get("to_status") or "")).strip()
        if next_from and next_to and next_from == next_to:
            raise HTTPException(status_code=400, detail='Поля "from_status" и "to_status" не должны совпадать')
    if normalized == "requests" and "status_code" in clean_payload:
        before_status = str(before.get("status_code") or "")
        after_status = str(clean_payload.get("status_code") or "")
        if before_status != after_status and isinstance(row, Request):
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
