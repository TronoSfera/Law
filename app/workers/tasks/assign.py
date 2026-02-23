from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import func

from app.db.session import SessionLocal
from app.models.admin_user import AdminUser
from app.models.admin_user_topic import AdminUserTopic
from app.models.audit_log import AuditLog
from app.models.request import Request
from app.models.status import Status
from app.workers.celery_app import celery_app

DEFAULT_TERMINAL_STATUS_CODES = {"RESOLVED", "CLOSED", "REJECTED"}


def _terminal_status_codes(db) -> set[str]:
    rows = db.query(Status.code).filter(Status.is_terminal.is_(True)).all()
    codes = {str(code).strip() for (code,) in rows if code}
    return codes or set(DEFAULT_TERMINAL_STATUS_CODES)


@celery_app.task(name="app.workers.tasks.assign.auto_assign_unclaimed")
def auto_assign_unclaimed():
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=24)
    checked = 0
    assigned = 0

    db = SessionLocal()
    try:
        terminal_codes = _terminal_status_codes(db)
        active_load_rows = (
            db.query(Request.assigned_lawyer_id, func.count(Request.id))
            .filter(Request.assigned_lawyer_id.is_not(None))
            .filter(Request.status_code.notin_(terminal_codes))
            .group_by(Request.assigned_lawyer_id)
            .all()
        )
        lawyer_load: dict[str, int] = {str(lawyer_id): int(count) for lawyer_id, count in active_load_rows if lawyer_id}

        active_lawyers = (
            db.query(AdminUser.id, AdminUser.primary_topic_code, AdminUser.default_rate)
            .filter(AdminUser.role == "LAWYER", AdminUser.is_active.is_(True))
            .all()
        )
        active_lawyer_ids = {str(lawyer_id) for lawyer_id, _, _ in active_lawyers if lawyer_id}
        lawyer_default_rate: dict[str, float | None] = {
            str(lawyer_id): default_rate for lawyer_id, _, default_rate in active_lawyers if lawyer_id
        }

        primary_by_topic: dict[str, list[str]] = {}
        for lawyer_id, primary_topic_code, _ in active_lawyers:
            topic_code = str(primary_topic_code or "").strip()
            if not topic_code:
                continue
            primary_by_topic.setdefault(topic_code, []).append(str(lawyer_id))

        additional_by_topic: dict[str, set[str]] = {}
        additional_rows = (
            db.query(AdminUserTopic.topic_code, AdminUserTopic.admin_user_id)
            .join(AdminUser, AdminUser.id == AdminUserTopic.admin_user_id)
            .filter(AdminUser.role == "LAWYER", AdminUser.is_active.is_(True))
            .all()
        )
        for topic_code_raw, lawyer_id in additional_rows:
            topic_code = str(topic_code_raw or "").strip()
            lawyer_key = str(lawyer_id or "").strip()
            if not topic_code or not lawyer_key or lawyer_key not in active_lawyer_ids:
                continue
            additional_by_topic.setdefault(topic_code, set()).add(lawyer_key)

        queue = (
            db.query(Request)
            .filter(
                Request.assigned_lawyer_id.is_(None),
                Request.created_at <= cutoff,
                Request.topic_code.is_not(None),
            )
            .order_by(Request.created_at.asc())
            .all()
        )

        checked = len(queue)

        for req in queue:
            topic_code = str(req.topic_code or "").strip()
            if not topic_code:
                continue
            primary_candidates = primary_by_topic.get(topic_code) or []
            if primary_candidates:
                candidates = primary_candidates
                assignment_basis = "primary_topic"
            else:
                candidates = sorted(additional_by_topic.get(topic_code) or [])
                assignment_basis = "additional_topic"
            if not candidates:
                continue
            selected = min(candidates, key=lambda lawyer_id: (lawyer_load.get(lawyer_id, 0), lawyer_id))
            req.assigned_lawyer_id = selected
            if req.effective_rate is None:
                req.effective_rate = lawyer_default_rate.get(selected)
            req.updated_at = now
            req.responsible = "Администратор системы"
            lawyer_load[selected] = lawyer_load.get(selected, 0) + 1
            assigned += 1
            db.add(
                AuditLog(
                    actor_admin_id=None,
                    entity="requests",
                    entity_id=str(req.id),
                    action="AUTO_ASSIGN",
                    diff={"topic_code": topic_code, "assigned_lawyer_id": selected, "basis": assignment_basis},
                )
            )

        db.commit()
        return {"checked": checked, "assigned": assigned}
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
