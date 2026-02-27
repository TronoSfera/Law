from __future__ import annotations

import uuid
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog

from .meta import _hidden_response_fields

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
