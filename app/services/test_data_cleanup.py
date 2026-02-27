from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable
from uuid import UUID

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.admin_user import AdminUser
from app.models.admin_user_topic import AdminUserTopic
from app.models.attachment import Attachment
from app.models.audit_log import AuditLog
from app.models.client import Client
from app.models.invoice import Invoice
from app.models.message import Message
from app.models.notification import Notification
from app.models.otp_session import OtpSession
from app.models.request import Request
from app.models.request_data_requirement import RequestDataRequirement
from app.models.request_data_template import RequestDataTemplate
from app.models.request_data_template_item import RequestDataTemplateItem
from app.models.request_service_request import RequestServiceRequest
from app.models.security_audit_log import SecurityAuditLog
from app.models.status_history import StatusHistory
from app.models.topic import Topic
from app.models.topic_data_template import TopicDataTemplate
from app.services.s3_storage import get_s3_storage


@dataclass
class CleanupSpec:
    track_numbers: list[str] = field(default_factory=list)
    phones: list[str] = field(default_factory=list)
    emails: list[str] = field(default_factory=list)
    include_default_e2e_patterns: bool = True


def _normalize_list(values: Iterable[object] | None) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for raw in values or []:
        text = str(raw or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        out.append(text)
    return out


def _safe_delete_s3_objects(rows: list[Attachment]) -> int:
    if not rows:
        return 0
    deleted = 0
    try:
        storage = get_s3_storage()
        for row in rows:
            key = str(row.s3_key or "").strip()
            if not key:
                continue
            try:
                storage.ensure_bucket()
                storage.client.delete_object(Bucket=storage.bucket, Key=key)
                deleted += 1
            except Exception:
                continue
    except Exception:
        return 0
    return deleted


def cleanup_test_data(db: Session, spec: CleanupSpec | None = None) -> dict[str, int]:
    payload = spec or CleanupSpec()
    track_numbers = _normalize_list(payload.track_numbers)
    phones = _normalize_list(payload.phones)
    emails = [item.lower() for item in _normalize_list(payload.emails)]

    request_query = db.query(Request)
    request_filters = []
    if track_numbers:
        request_filters.append(Request.track_number.in_(track_numbers))
    if phones:
        request_filters.append(Request.client_phone.in_(phones))
    if payload.include_default_e2e_patterns:
        request_filters.extend(
            [
                Request.client_name.ilike("Клиент E2E %"),
                Request.description.ilike("%e2e%"),
                Request.description.ilike("%E2E%"),
            ]
        )
    request_rows = request_query.filter(or_(*request_filters)).all() if request_filters else []
    request_ids = [row.id for row in request_rows]
    request_tracks = [str(row.track_number or "") for row in request_rows]
    client_ids_from_requests = [row.client_id for row in request_rows if row.client_id]

    attachment_rows = db.query(Attachment).filter(Attachment.request_id.in_(request_ids)).all() if request_ids else []
    attachment_ids = [row.id for row in attachment_rows]
    s3_deleted = _safe_delete_s3_objects(attachment_rows)

    deleted_counts: dict[str, int] = {
        "requests": 0,
        "messages": 0,
        "attachments": 0,
        "status_history": 0,
        "invoices": 0,
        "notifications": 0,
        "request_data_requirements": 0,
        "request_service_requests": 0,
        "security_audit_log": 0,
        "audit_log": 0,
        "otp_sessions": 0,
        "clients": 0,
        "admin_users": 0,
        "admin_user_topics": 0,
        "topics": 0,
        "topic_data_templates": 0,
        "request_data_templates": 0,
        "request_data_template_items": 0,
        "s3_objects": s3_deleted,
    }

    if request_ids:
        request_id_strs = {str(item) for item in request_ids}
        deleted_counts["notifications"] += (
            db.query(Notification).filter(Notification.request_id.in_(request_ids)).delete(synchronize_session=False) or 0
        )
        deleted_counts["request_data_requirements"] += (
            db.query(RequestDataRequirement).filter(RequestDataRequirement.request_id.in_(request_ids)).delete(synchronize_session=False) or 0
        )
        deleted_counts["request_service_requests"] += (
            db.query(RequestServiceRequest)
            .filter(RequestServiceRequest.request_id.in_(list(request_id_strs)))
            .delete(synchronize_session=False)
            or 0
        )
        deleted_counts["status_history"] += (
            db.query(StatusHistory).filter(StatusHistory.request_id.in_(request_ids)).delete(synchronize_session=False) or 0
        )
        deleted_counts["invoices"] += (
            db.query(Invoice).filter(Invoice.request_id.in_(request_ids)).delete(synchronize_session=False) or 0
        )
        deleted_counts["messages"] += (
            db.query(Message).filter(Message.request_id.in_(request_ids)).delete(synchronize_session=False) or 0
        )
        deleted_counts["attachments"] += (
            db.query(Attachment).filter(Attachment.request_id.in_(request_ids)).delete(synchronize_session=False) or 0
        )
        deleted_counts["security_audit_log"] += (
            db.query(SecurityAuditLog).filter(SecurityAuditLog.request_id.in_(request_ids)).delete(synchronize_session=False) or 0
        )
        if attachment_ids:
            deleted_counts["security_audit_log"] += (
                db.query(SecurityAuditLog).filter(SecurityAuditLog.attachment_id.in_(attachment_ids)).delete(synchronize_session=False) or 0
            )
        deleted_counts["audit_log"] += (
            db.query(AuditLog)
            .filter(AuditLog.entity == "requests", AuditLog.entity_id.in_(list(request_id_strs)))
            .delete(synchronize_session=False)
            or 0
        )
        deleted_counts["requests"] += (
            db.query(Request).filter(Request.id.in_(request_ids)).delete(synchronize_session=False) or 0
        )

    otp_filters = []
    if phones:
        otp_filters.append(OtpSession.phone.in_(phones))
    if request_tracks:
        otp_filters.append(OtpSession.track_number.in_(request_tracks))
    if otp_filters:
        deleted_counts["otp_sessions"] += db.query(OtpSession).filter(or_(*otp_filters)).delete(synchronize_session=False) or 0

    client_filters = []
    if client_ids_from_requests:
        client_filters.append(Client.id.in_(client_ids_from_requests))
    if phones:
        client_filters.append(Client.phone.in_(phones))
    if payload.include_default_e2e_patterns:
        client_filters.append(Client.full_name.ilike("Клиент E2E %"))
    if client_filters:
        deleted_counts["clients"] += db.query(Client).filter(or_(*client_filters)).delete(synchronize_session=False) or 0

    user_rows: list[AdminUser] = []
    user_filters = []
    if emails:
        user_filters.append(AdminUser.email.in_(emails))
    if payload.include_default_e2e_patterns:
        user_filters.extend([AdminUser.email.ilike("ui-lawyer-%@example.com"), AdminUser.name.ilike("Юрист UI %")])
    if user_filters:
        user_rows = db.query(AdminUser).filter(or_(*user_filters)).all()
    user_ids = [row.id for row in user_rows]
    if user_ids:
        deleted_counts["admin_user_topics"] += (
            db.query(AdminUserTopic).filter(AdminUserTopic.admin_user_id.in_(user_ids)).delete(synchronize_session=False) or 0
        )
        deleted_counts["notifications"] += (
            db.query(Notification).filter(Notification.recipient_admin_user_id.in_(user_ids)).delete(synchronize_session=False) or 0
        )
        deleted_counts["audit_log"] += (
            db.query(AuditLog).filter(AuditLog.actor_admin_id.in_(user_ids)).delete(synchronize_session=False) or 0
        )
        deleted_counts["admin_users"] += (
            db.query(AdminUser).filter(AdminUser.id.in_(user_ids)).delete(synchronize_session=False) or 0
        )

    topic_rows: list[Topic] = []
    topic_filters = []
    if payload.include_default_e2e_patterns:
        topic_filters.append(Topic.name.ilike("Тема UI %"))
    if topic_filters:
        topic_rows = db.query(Topic).filter(or_(*topic_filters)).all()
    topic_codes = [str(row.code or "").strip() for row in topic_rows if str(row.code or "").strip()]
    if topic_codes:
        deleted_counts["topic_data_templates"] += (
            db.query(TopicDataTemplate).filter(TopicDataTemplate.topic_code.in_(topic_codes)).delete(synchronize_session=False) or 0
        )
        template_rows = db.query(RequestDataTemplate).filter(RequestDataTemplate.topic_code.in_(topic_codes)).all()
        template_ids = [row.id for row in template_rows]
        if template_ids:
            deleted_counts["request_data_template_items"] += (
                db.query(RequestDataTemplateItem)
                .filter(RequestDataTemplateItem.request_data_template_id.in_(template_ids))
                .delete(synchronize_session=False)
                or 0
            )
            deleted_counts["request_data_templates"] += (
                db.query(RequestDataTemplate).filter(RequestDataTemplate.id.in_(template_ids)).delete(synchronize_session=False) or 0
            )
        deleted_counts["topics"] += db.query(Topic).filter(Topic.code.in_(topic_codes)).delete(synchronize_session=False) or 0

    if payload.include_default_e2e_patterns:
        deleted_counts["topic_data_templates"] += (
            db.query(TopicDataTemplate)
            .filter(or_(TopicDataTemplate.label.ilike("%E2E%"), TopicDataTemplate.label.ilike("%e2e%")))
            .delete(synchronize_session=False)
            or 0
        )
        template_rows = (
            db.query(RequestDataTemplate)
            .filter(or_(RequestDataTemplate.name.ilike("%E2E%"), RequestDataTemplate.name.ilike("%e2e%")))
            .all()
        )
        template_ids = [row.id for row in template_rows]
        if template_ids:
            deleted_counts["request_data_template_items"] += (
                db.query(RequestDataTemplateItem)
                .filter(RequestDataTemplateItem.request_data_template_id.in_(template_ids))
                .delete(synchronize_session=False)
                or 0
            )
            deleted_counts["request_data_templates"] += (
                db.query(RequestDataTemplate).filter(RequestDataTemplate.id.in_(template_ids)).delete(synchronize_session=False) or 0
            )

    db.commit()
    return deleted_counts
