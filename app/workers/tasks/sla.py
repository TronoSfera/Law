from __future__ import annotations

from uuid import UUID

from app.db.session import SessionLocal
from app.models.request import Request
from app.services.notifications import EVENT_SLA_OVERDUE, notify_request_event
from app.services.sla_metrics import compute_sla_snapshot
from app.workers.celery_app import celery_app


def _emit_sla_overdue_notifications(db, overdue_rows: list[dict]) -> dict[str, int]:
    internal_created = 0
    telegram_sent = 0
    for item in overdue_rows:
        request_id_raw = str(item.get("request_id") or "").strip()
        if not request_id_raw:
            continue
        try:
            request_uuid = UUID(request_id_raw)
        except ValueError:
            continue
        req = db.get(Request, request_uuid)
        if req is None:
            continue
        threshold = item.get("threshold_hours")
        spent = item.get("hours_in_status")
        body = f"Просрочка SLA: {spent}ч > {threshold}ч"
        dedupe_prefix = f"sla:{req.id}:{req.status_code}"
        result = notify_request_event(
            db,
            request=req,
            event_type=EVENT_SLA_OVERDUE,
            actor_role="SYSTEM",
            body=body,
            responsible="SLA сервис",
            dedupe_prefix=dedupe_prefix,
        )
        internal_created += int(result.get("internal_created", 0))
        telegram_sent += int(result.get("telegram_sent", 0))
    return {"internal_created": int(internal_created), "telegram_sent": int(telegram_sent)}


@celery_app.task(name="app.workers.tasks.sla.sla_check")
def sla_check():
    db = SessionLocal()
    try:
        snapshot = compute_sla_snapshot(db, include_overdue_requests=True)
        overdue_rows = list(snapshot.get("overdue_requests") or [])
        notify_result = _emit_sla_overdue_notifications(db, overdue_rows)
        if notify_result["internal_created"] > 0:
            db.commit()
        snapshot.pop("overdue_requests", None)
        snapshot["notifications_created"] = int(notify_result["internal_created"])
        snapshot["telegram_sent"] = int(notify_result["telegram_sent"])
        return snapshot
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
