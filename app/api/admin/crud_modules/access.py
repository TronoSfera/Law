from __future__ import annotations

import importlib
import pkgutil
from functools import lru_cache
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

import app.models as models_pkg
from app.db.session import Base
from app.models.request import Request

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
ALLOWED_ADMIN_ROLES = {"ADMIN", "LAWYER", "CURATOR"}
ALLOWED_REQUEST_DATA_VALUE_TYPES = {"string", "text", "date", "number", "file"}

# Per-table RBAC: table -> role -> actions.
# If a table is missing here, fallback rules are used.
TABLE_ROLE_ACTIONS: dict[str, dict[str, set[str]]] = {
    "requests": {
        "ADMIN": set(CRUD_ACTIONS),
        "LAWYER": set(CRUD_ACTIONS),
        "CURATOR": {"query", "read"},
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
    "request_service_requests": {
        "ADMIN": set(CRUD_ACTIONS),
        "LAWYER": {"query", "read"},
        "CURATOR": {"query", "read", "update"},
    },
    "notifications": {"ADMIN": {"query", "read", "update"}},
}

DEFAULT_ROLE_ACTIONS: dict[str, set[str]] = {
    "ADMIN": set(CRUD_ACTIONS),
    "CURATOR": {"query", "read"},
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
