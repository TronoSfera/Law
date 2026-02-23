from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import require_role
from app.db.session import get_db
from app.models.admin_user import AdminUser
from app.models.request import Request
from app.models.status import Status
from app.models.status_history import StatusHistory
from app.services.sla_metrics import compute_sla_snapshot

router = APIRouter()

DEFAULT_TERMINAL_STATUS_CODES = {"RESOLVED", "CLOSED", "REJECTED"}
PAID_STATUS_CODES = {"PAID", "ОПЛАЧЕНО"}


def _terminal_status_codes(db: Session) -> set[str]:
    rows = db.query(Status.code).filter(Status.is_terminal.is_(True)).all()
    codes = {str(code).strip() for (code,) in rows if code}
    return codes or set(DEFAULT_TERMINAL_STATUS_CODES)


def _paid_status_codes() -> set[str]:
    return set(PAID_STATUS_CODES)


def _month_bounds(now_utc: datetime) -> tuple[datetime, datetime]:
    start = datetime(now_utc.year, now_utc.month, 1, tzinfo=timezone.utc)
    if now_utc.month == 12:
        end = datetime(now_utc.year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end = datetime(now_utc.year, now_utc.month + 1, 1, tzinfo=timezone.utc)
    return start, end


def _to_float(value) -> float:
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _uuid_or_none(value: str | None) -> UUID | None:
    try:
        return UUID(str(value or ""))
    except ValueError:
        return None


@router.get("/overview")
def overview(db: Session = Depends(get_db), admin=Depends(require_role("ADMIN", "LAWYER"))):
    role = str(admin.get("role") or "").upper()
    actor_id = str(admin.get("sub") or "").strip()
    actor_uuid = _uuid_or_none(actor_id)

    terminal_codes = _terminal_status_codes(db)
    paid_codes = _paid_status_codes()
    now_utc = datetime.now(timezone.utc)
    month_start, next_month_start = _month_bounds(now_utc)

    unread_for_clients = (
        db.query(func.count(Request.id))
        .filter(Request.client_has_unread_updates.is_(True))
        .scalar()
        or 0
    )
    unread_for_lawyers = (
        db.query(func.count(Request.id))
        .filter(Request.lawyer_has_unread_updates.is_(True))
        .scalar()
        or 0
    )

    active_load_rows = (
        db.query(Request.assigned_lawyer_id, func.count(Request.id))
        .filter(Request.assigned_lawyer_id.is_not(None))
        .filter(Request.status_code.notin_(terminal_codes))
        .group_by(Request.assigned_lawyer_id)
        .all()
    )
    total_load_rows = (
        db.query(Request.assigned_lawyer_id, func.count(Request.id))
        .filter(Request.assigned_lawyer_id.is_not(None))
        .group_by(Request.assigned_lawyer_id)
        .all()
    )
    active_amount_rows = (
        db.query(Request.assigned_lawyer_id, func.coalesce(func.sum(func.coalesce(Request.invoice_amount, 0)), 0))
        .filter(Request.assigned_lawyer_id.is_not(None))
        .filter(Request.status_code.notin_(terminal_codes))
        .group_by(Request.assigned_lawyer_id)
        .all()
    )
    paid_rows = (
        db.query(
            Request.assigned_lawyer_id,
            func.count(StatusHistory.id),
            func.coalesce(func.sum(func.coalesce(Request.invoice_amount, 0)), 0),
        )
        .join(StatusHistory, StatusHistory.request_id == Request.id)
        .filter(Request.assigned_lawyer_id.is_not(None))
        .filter(StatusHistory.created_at >= month_start, StatusHistory.created_at < next_month_start)
        .filter(func.upper(StatusHistory.to_status).in_(paid_codes))
        .group_by(Request.assigned_lawyer_id)
        .all()
    )

    active_load_map = {str(lawyer_id): int(count) for lawyer_id, count in active_load_rows if lawyer_id}
    total_load_map = {str(lawyer_id): int(count) for lawyer_id, count in total_load_rows if lawyer_id}
    active_amount_map = {str(lawyer_id): _to_float(amount) for lawyer_id, amount in active_amount_rows if lawyer_id}
    paid_events_map = {str(lawyer_id): int(events) for lawyer_id, events, _ in paid_rows if lawyer_id}
    monthly_gross_map = {str(lawyer_id): _to_float(gross) for lawyer_id, _, gross in paid_rows if lawyer_id}

    lawyers = (
        db.query(AdminUser)
        .filter(AdminUser.role == "LAWYER", AdminUser.is_active.is_(True))
        .all()
    )
    lawyer_loads = []
    for lawyer in lawyers:
        lawyer_id = str(lawyer.id)
        salary_percent = _to_float(lawyer.salary_percent)
        monthly_paid_gross = monthly_gross_map.get(lawyer_id, 0.0)
        monthly_salary = monthly_paid_gross * salary_percent / 100.0
        lawyer_loads.append(
            {
                "lawyer_id": lawyer_id,
                "name": lawyer.name,
                "email": lawyer.email,
                "avatar_url": lawyer.avatar_url,
                "primary_topic_code": lawyer.primary_topic_code,
                "default_rate": _to_float(lawyer.default_rate),
                "salary_percent": salary_percent,
                "active_load": active_load_map.get(lawyer_id, 0),
                "total_assigned": total_load_map.get(lawyer_id, 0),
                "active_amount": round(active_amount_map.get(lawyer_id, 0.0), 2),
                "monthly_paid_events": paid_events_map.get(lawyer_id, 0),
                "monthly_paid_gross": round(monthly_paid_gross, 2),
                "monthly_salary": round(monthly_salary, 2),
            }
        )
    lawyer_loads.sort(key=lambda row: (-row["active_load"], row["name"] or "", row["email"] or ""))

    if role == "LAWYER" and actor_uuid is not None:
        scoped_by_status_rows = (
            db.query(Request.status_code, func.count(Request.id))
            .filter(Request.assigned_lawyer_id == str(actor_uuid))
            .group_by(Request.status_code)
            .all()
        )
        by_status = {status: int(count) for status, count in scoped_by_status_rows}
        assigned_total = int(sum(by_status.values()))
        active_assigned_total = int(
            db.query(func.count(Request.id))
            .filter(Request.assigned_lawyer_id == str(actor_uuid))
            .filter(Request.status_code.notin_(terminal_codes))
            .scalar()
            or 0
        )
        unassigned_total = int(db.query(func.count(Request.id)).filter(Request.assigned_lawyer_id.is_(None)).scalar() or 0)
        my_unread_updates = int(
            db.query(func.count(Request.id))
            .filter(
                Request.assigned_lawyer_id == str(actor_uuid),
                Request.lawyer_has_unread_updates.is_(True),
            )
            .scalar()
            or 0
        )
        my_unread_by_event_rows = (
            db.query(Request.lawyer_unread_event_type, func.count(Request.id))
            .filter(
                Request.assigned_lawyer_id == str(actor_uuid),
                Request.lawyer_has_unread_updates.is_(True),
                Request.lawyer_unread_event_type.is_not(None),
            )
            .group_by(Request.lawyer_unread_event_type)
            .all()
        )
        my_unread_by_event = {str(event_type): int(count) for event_type, count in my_unread_by_event_rows if event_type}
        scoped_lawyer_loads = [row for row in lawyer_loads if str(row["lawyer_id"]) == str(actor_uuid)]
    elif role == "LAWYER":
        by_status = {}
        assigned_total = 0
        active_assigned_total = 0
        unassigned_total = int(db.query(func.count(Request.id)).filter(Request.assigned_lawyer_id.is_(None)).scalar() or 0)
        my_unread_updates = 0
        my_unread_by_event = {}
        scoped_lawyer_loads = []
    else:
        scoped_by_status_rows = db.query(Request.status_code, func.count(Request.id)).group_by(Request.status_code).all()
        by_status = {status: int(count) for status, count in scoped_by_status_rows}
        assigned_total = int(
            db.query(func.count(Request.id))
            .filter(Request.assigned_lawyer_id.is_not(None))
            .scalar()
            or 0
        )
        active_assigned_total = int(
            db.query(func.count(Request.id))
            .filter(Request.assigned_lawyer_id.is_not(None))
            .filter(Request.status_code.notin_(terminal_codes))
            .scalar()
            or 0
        )
        unassigned_total = int(db.query(func.count(Request.id)).filter(Request.assigned_lawyer_id.is_(None)).scalar() or 0)
        my_unread_updates = 0
        my_unread_by_event = {}
        scoped_lawyer_loads = lawyer_loads

    sla_snapshot = compute_sla_snapshot(db)
    return {
        "scope": role if role in {"ADMIN", "LAWYER"} else "ADMIN",
        "new": int(by_status.get("NEW", 0)),
        "by_status": by_status,
        "assigned_total": assigned_total,
        "active_assigned_total": active_assigned_total,
        "unassigned_total": unassigned_total,
        "my_unread_updates": my_unread_updates,
        "my_unread_by_event": my_unread_by_event,
        "frt_avg_minutes": sla_snapshot.get("frt_avg_minutes"),
        "sla_overdue": sla_snapshot.get("overdue_total", 0),
        "overdue_by_status": sla_snapshot.get("overdue_by_status", {}),
        "overdue_by_transition": sla_snapshot.get("overdue_by_transition", {}),
        "avg_time_in_status_hours": sla_snapshot.get("avg_time_in_status_hours", {}),
        "unread_for_clients": int(unread_for_clients),
        "unread_for_lawyers": int(unread_for_lawyers),
        "lawyer_loads": scoped_lawyer_loads,
    }
