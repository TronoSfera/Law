from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy.inspection import inspect as sa_inspect
from sqlalchemy.orm import Session
from sqlalchemy.sql.sqltypes import Boolean, Date, DateTime, Float, Integer, JSON, Numeric

from app.models.table_availability import TableAvailability

from .access import (
    REQUEST_CALCULATED_FIELDS,
    INVOICE_CALCULATED_FIELDS,
    SYSTEM_FIELDS,
    _allowed_actions,
    _normalize_table_name,
    _resolve_table_model,
    _table_model_map,
)

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
        "request_service_requests": "Запросы",
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
        "created_by_client": "Создан клиентом",
        "admin_unread": "Не прочитано администратором",
        "lawyer_unread": "Не прочитано юристом",
        "admin_read_at": "Прочитано администратором",
        "lawyer_read_at": "Прочитано юристом",
        "resolved_at": "Дата обработки",
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
        "resolved_by_admin_id": "Обработал",
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
        ("request_service_requests", "request_id"): ("requests", "id"),
        ("request_service_requests", "client_id"): ("clients", "id"),
        ("request_service_requests", "assigned_lawyer_id"): ("admin_users", "id"),
        ("request_service_requests", "resolved_by_admin_id"): ("admin_users", "id"),
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

def _table_section(table_name: str) -> str:
    if table_name in {"requests", "invoices", "request_service_requests"}:
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
