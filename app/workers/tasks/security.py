from __future__ import annotations

from datetime import datetime, timezone
from datetime import timedelta
from uuid import UUID

from app.db.session import SessionLocal
from app.models.audit_log import AuditLog
from app.models.attachment import Attachment
from app.models.data_retention_policy import DataRetentionPolicy
from app.models.invoice import Invoice
from app.models.message import Message
from app.models.notification import Notification
from app.models.otp_session import OtpSession
from app.models.request import Request
from app.models.request_data_requirement import RequestDataRequirement
from app.models.request_service_request import RequestServiceRequest
from app.models.security_audit_log import SecurityAuditLog
from app.models.status import Status
from app.models.status_history import StatusHistory
from app.workers.celery_app import celery_app


@celery_app.task(name="app.workers.tasks.security.cleanup_expired_otps")
def cleanup_expired_otps():
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    try:
        total = db.query(OtpSession).count()
        deleted = db.query(OtpSession).filter(OtpSession.expires_at <= now).delete(synchronize_session=False)
        db.commit()
        return {"checked": int(total), "deleted": int(deleted)}
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


DEFAULT_RETENTION_POLICIES = {
    "otp_sessions": {"retention_days": 1, "enabled": True, "hard_delete": True, "description": "OTP-сессии"},
    "notifications": {"retention_days": 120, "enabled": True, "hard_delete": True, "description": "Уведомления"},
    "audit_log": {"retention_days": 365, "enabled": True, "hard_delete": True, "description": "Операционный аудит"},
    "security_audit_log": {"retention_days": 365, "enabled": True, "hard_delete": True, "description": "Security аудит"},
    "requests": {"retention_days": 3650, "enabled": False, "hard_delete": True, "description": "Терминальные заявки"},
}


def _ensure_default_retention_policies(db) -> None:
    existing = {str(row.entity or "").strip().lower() for row in db.query(DataRetentionPolicy.entity).all()}
    for entity, config in DEFAULT_RETENTION_POLICIES.items():
        if entity in existing:
            continue
        db.add(
            DataRetentionPolicy(
                entity=entity,
                retention_days=int(config["retention_days"]),
                enabled=bool(config["enabled"]),
                hard_delete=bool(config["hard_delete"]),
                description=str(config["description"]),
                responsible="Администратор системы",
            )
        )
    db.flush()


def _policy_map(db) -> dict[str, DataRetentionPolicy]:
    return {
        str(row.entity or "").strip().lower(): row
        for row in db.query(DataRetentionPolicy).all()
        if str(row.entity or "").strip()
    }


def _cutoff(now: datetime, retention_days: int) -> datetime:
    days = max(int(retention_days or 0), 1)
    return now - timedelta(days=days)


def _delete_by_created_at(db, model, *, cutoff: datetime) -> int:
    return int(
        db.query(model)
        .filter(model.created_at.isnot(None), model.created_at < cutoff)
        .delete(synchronize_session=False)
        or 0
    )


def _terminal_status_codes(db) -> set[str]:
    rows = db.query(Status.code).filter(Status.is_terminal.is_(True)).all()
    codes = {str(code or "").strip().upper() for (code,) in rows if code}
    if not codes:
        return {"DONE", "CLOSED", "RESOLVED", "CANCELED"}
    return codes


def _purge_terminal_requests(db, *, cutoff: datetime) -> dict[str, int]:
    terminal_codes = _terminal_status_codes(db)
    rows = (
        db.query(Request.id)
        .filter(
            Request.status_code.in_(terminal_codes),  # type: ignore[arg-type]
            Request.updated_at.isnot(None),
            Request.updated_at < cutoff,
        )
        .all()
    )
    request_ids: list[UUID] = [row_id for (row_id,) in rows if row_id]
    if not request_ids:
        return {
            "requests": 0,
            "messages": 0,
            "attachments": 0,
            "status_history": 0,
            "notifications": 0,
            "request_data_requirements": 0,
            "request_service_requests": 0,
            "invoices": 0,
        }

    request_ids_str = [str(item) for item in request_ids]
    deleted_messages = int(db.query(Message).filter(Message.request_id.in_(request_ids)).delete(synchronize_session=False) or 0)
    deleted_attachments = int(
        db.query(Attachment).filter(Attachment.request_id.in_(request_ids)).delete(synchronize_session=False) or 0
    )
    deleted_history = int(
        db.query(StatusHistory).filter(StatusHistory.request_id.in_(request_ids)).delete(synchronize_session=False) or 0
    )
    deleted_notifications = int(
        db.query(Notification).filter(Notification.request_id.in_(request_ids)).delete(synchronize_session=False) or 0
    )
    deleted_req_data = int(
        db.query(RequestDataRequirement)
        .filter(RequestDataRequirement.request_id.in_(request_ids))
        .delete(synchronize_session=False)
        or 0
    )
    deleted_service_requests = int(
        db.query(RequestServiceRequest)
        .filter(RequestServiceRequest.request_id.in_(request_ids_str))
        .delete(synchronize_session=False)
        or 0
    )
    deleted_invoices = int(db.query(Invoice).filter(Invoice.request_id.in_(request_ids)).delete(synchronize_session=False) or 0)
    deleted_requests = int(db.query(Request).filter(Request.id.in_(request_ids)).delete(synchronize_session=False) or 0)
    return {
        "requests": deleted_requests,
        "messages": deleted_messages,
        "attachments": deleted_attachments,
        "status_history": deleted_history,
        "notifications": deleted_notifications,
        "request_data_requirements": deleted_req_data,
        "request_service_requests": deleted_service_requests,
        "invoices": deleted_invoices,
    }


@celery_app.task(name="app.workers.tasks.security.cleanup_pii_retention")
def cleanup_pii_retention():
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    try:
        _ensure_default_retention_policies(db)
        policies = _policy_map(db)

        deleted: dict[str, int] = {}

        otp_policy = policies.get("otp_sessions")
        if otp_policy and otp_policy.enabled:
            cutoff = _cutoff(now, otp_policy.retention_days)
            deleted["otp_sessions"] = int(
                db.query(OtpSession)
                .filter(OtpSession.created_at.isnot(None), OtpSession.created_at < cutoff)
                .delete(synchronize_session=False)
                or 0
            )

        notifications_policy = policies.get("notifications")
        if notifications_policy and notifications_policy.enabled:
            deleted["notifications"] = _delete_by_created_at(
                db,
                Notification,
                cutoff=_cutoff(now, notifications_policy.retention_days),
            )

        audit_policy = policies.get("audit_log")
        if audit_policy and audit_policy.enabled:
            deleted["audit_log"] = _delete_by_created_at(
                db,
                AuditLog,
                cutoff=_cutoff(now, audit_policy.retention_days),
            )

        sec_audit_policy = policies.get("security_audit_log")
        if sec_audit_policy and sec_audit_policy.enabled:
            deleted["security_audit_log"] = _delete_by_created_at(
                db,
                SecurityAuditLog,
                cutoff=_cutoff(now, sec_audit_policy.retention_days),
            )

        requests_policy = policies.get("requests")
        if requests_policy and requests_policy.enabled:
            deleted.update(
                {
                    f"requests_{key}": value
                    for key, value in _purge_terminal_requests(
                        db,
                        cutoff=_cutoff(now, requests_policy.retention_days),
                    ).items()
                }
            )

        db.commit()
        return {"deleted": deleted, "policies": len(policies)}
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
