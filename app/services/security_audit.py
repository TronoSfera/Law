from __future__ import annotations

import logging
import uuid
from datetime import timedelta
from typing import Any

from sqlalchemy import func, inspect
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models.security_audit_log import SecurityAuditLog
from app.models.common import utcnow

logger = logging.getLogger(__name__)

SUSPICIOUS_DENY_WINDOW_MINUTES = 10
SUSPICIOUS_DENY_THRESHOLD = 5


def _uuid_or_none(raw: str | uuid.UUID | None) -> uuid.UUID | None:
    if raw is None:
        return None
    if isinstance(raw, uuid.UUID):
        return raw
    try:
        return uuid.UUID(str(raw))
    except (TypeError, ValueError):
        return None


def _safe_details(details: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(details, dict):
        return {}
    safe: dict[str, Any] = {}
    for key, value in details.items():
        if value is None or isinstance(value, (str, int, float, bool)):
            safe[str(key)] = value
        else:
            safe[str(key)] = str(value)
    return safe


def _emit_suspicious_denied_download_alert(
    db: Session,
    *,
    actor_role: str,
    actor_subject: str,
    actor_ip: str | None,
) -> None:
    if not actor_subject and not actor_ip:
        return
    since = utcnow() - timedelta(minutes=SUSPICIOUS_DENY_WINDOW_MINUTES)
    query = db.query(func.count(SecurityAuditLog.id)).filter(
        SecurityAuditLog.created_at >= since,
        SecurityAuditLog.action == "DOWNLOAD_OBJECT",
        SecurityAuditLog.allowed.is_(False),
    )
    if actor_subject:
        query = query.filter(SecurityAuditLog.actor_subject == actor_subject)
    elif actor_ip:
        query = query.filter(SecurityAuditLog.actor_ip == actor_ip)
    denied_count = int(query.scalar() or 0)
    if denied_count >= SUSPICIOUS_DENY_THRESHOLD:
        logger.warning(
            "SECURITY_ALERT repeated denied download attempts role=%s subject=%s ip=%s count=%s window_min=%s",
            actor_role,
            actor_subject or "-",
            actor_ip or "-",
            denied_count,
            SUSPICIOUS_DENY_WINDOW_MINUTES,
        )


def record_file_security_event(
    db: Session,
    *,
    actor_role: str,
    actor_subject: str,
    actor_ip: str | None,
    action: str,
    scope: str,
    allowed: bool,
    reason: str | None = None,
    object_key: str | None = None,
    request_id: str | uuid.UUID | None = None,
    attachment_id: str | uuid.UUID | None = None,
    details: dict[str, Any] | None = None,
    responsible: str | None = None,
    persist_now: bool = False,
) -> None:
    # Security telemetry must not block business flow if DB log write fails.
    try:
        bind = db.get_bind()
        if bind is None or not inspect(bind).has_table("security_audit_log"):
            return
        row = SecurityAuditLog(
            actor_role=str(actor_role or "UNKNOWN").upper(),
            actor_subject=str(actor_subject or "").strip(),
            actor_ip=str(actor_ip or "").strip() or None,
            action=str(action or "").strip().upper() or "UNKNOWN",
            scope=str(scope or "").strip().upper() or "UNKNOWN",
            object_key=str(object_key or "").strip() or None,
            request_id=_uuid_or_none(request_id),
            attachment_id=_uuid_or_none(attachment_id),
            allowed=bool(allowed),
            reason=(str(reason)[:400] if reason is not None else None),
            details=_safe_details(details),
            responsible=str(responsible or "Администратор системы").strip() or "Администратор системы",
        )
        db.add(row)
        db.flush()

        if not bool(allowed) and str(action or "").upper() == "DOWNLOAD_OBJECT":
            _emit_suspicious_denied_download_alert(
                db,
                actor_role=row.actor_role,
                actor_subject=row.actor_subject,
                actor_ip=row.actor_ip,
            )

        if persist_now:
            db.commit()
    except SQLAlchemyError:
        if persist_now:
            try:
                db.rollback()
            except Exception:
                logger.debug("security_audit_rollback_failed", exc_info=True)
