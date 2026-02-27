from __future__ import annotations

import json
import uuid
from typing import Any

from fastapi import HTTPException
from sqlalchemy.inspection import inspect as sa_inspect
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.admin_user import AdminUser
from app.models.client import Client
from app.models.form_field import FormField
from app.models.request import Request
from app.models.request_data_requirement import RequestDataRequirement
from app.models.request_data_template import RequestDataTemplate
from app.models.request_data_template_item import RequestDataTemplateItem
from app.models.status import Status
from app.models.status_group import StatusGroup
from app.models.topic import Topic
from app.models.topic_data_template import TopicDataTemplate
from app.services.billing_flow import normalize_status_kind_or_400

from .access import ALLOWED_ADMIN_ROLES, ALLOWED_REQUEST_DATA_VALUE_TYPES
from .meta import SYSTEM_FIELDS, _columns_map, _protected_input_fields

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
