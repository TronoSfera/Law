from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import require_role
from app.db.session import get_db
from app.models.admin_user import AdminUser
from app.models.audit_log import AuditLog
from app.models.request import Request
from app.models.request_service_request import RequestServiceRequest
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


def _extract_assigned_lawyer_from_audit(diff: dict | None, action: str | None) -> str | None:
    if not isinstance(diff, dict):
        return None
    action_code = str(action or "").upper()
    if action_code == "MANUAL_CLAIM":
        value = diff.get("assigned_lawyer_id")
        return str(value).strip() if value else None
    if action_code == "MANUAL_REASSIGN":
        value = diff.get("to_lawyer_id")
        return str(value).strip() if value else None
    if action_code in {"CREATE", "UPDATE"}:
        after = diff.get("after")
        before = diff.get("before")
        if action_code == "UPDATE":
            if not isinstance(after, dict) or not isinstance(before, dict):
                return None
            prev_value = str(before.get("assigned_lawyer_id") or "").strip()
            next_value = str(after.get("assigned_lawyer_id") or "").strip()
            if not next_value or next_value == prev_value:
                return None
            return next_value
        if isinstance(after, dict):
            value = str(after.get("assigned_lawyer_id") or "").strip()
            return value or None
    return None


@router.get("/overview")
def overview(db: Session = Depends(get_db), admin=Depends(require_role("ADMIN", "LAWYER", "CURATOR"))):
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
    if role == "LAWYER" and actor_uuid is not None:
        service_request_unread_total = int(
            db.query(func.count(RequestServiceRequest.id))
            .filter(
                RequestServiceRequest.type == "CURATOR_CONTACT",
                RequestServiceRequest.assigned_lawyer_id == str(actor_uuid),
                RequestServiceRequest.lawyer_unread.is_(True),
            )
            .scalar()
            or 0
        )
    elif role == "LAWYER":
        service_request_unread_total = 0
    else:
        service_request_unread_total = int(
            db.query(func.count(RequestServiceRequest.id))
            .filter(RequestServiceRequest.admin_unread.is_(True))
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

    monthly_completed_rows = (
        db.query(Request.assigned_lawyer_id, func.count(func.distinct(StatusHistory.request_id)))
        .join(StatusHistory, StatusHistory.request_id == Request.id)
        .filter(Request.assigned_lawyer_id.is_not(None))
        .filter(StatusHistory.created_at >= month_start, StatusHistory.created_at < next_month_start)
        .filter(func.upper(StatusHistory.to_status).in_({str(code).upper() for code in terminal_codes}))
        .group_by(Request.assigned_lawyer_id)
        .all()
    )
    monthly_completed_map = {str(lawyer_id): int(count) for lawyer_id, count in monthly_completed_rows if lawyer_id}

    monthly_assigned_map: dict[str, int] = {}
    audit_rows = (
        db.query(AuditLog.action, AuditLog.diff)
        .filter(AuditLog.entity == "requests")
        .filter(AuditLog.created_at >= month_start, AuditLog.created_at < next_month_start)
        .all()
    )
    for action, diff in audit_rows:
        assigned_to = _extract_assigned_lawyer_from_audit(diff, action)
        if not assigned_to:
            continue
        monthly_assigned_map[assigned_to] = int(monthly_assigned_map.get(assigned_to, 0)) + 1

    monthly_revenue = round(sum(monthly_gross_map.values()), 2)

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
                "monthly_assigned_count": monthly_assigned_map.get(lawyer_id, 0),
                "monthly_completed_count": monthly_completed_map.get(lawyer_id, 0),
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
    next_day_start = datetime(now_utc.year, now_utc.month, now_utc.day, tzinfo=timezone.utc) + timedelta(days=1)
    deadline_alert_query = (
        db.query(func.count(Request.id))
        .filter(Request.important_date_at.is_not(None))
        .filter(Request.important_date_at < next_day_start)
        .filter(Request.status_code.notin_(terminal_codes))
    )
    if role == "LAWYER" and actor_uuid is not None:
        deadline_alert_query = deadline_alert_query.filter(Request.assigned_lawyer_id == str(actor_uuid))
    elif role == "LAWYER":
        deadline_alert_query = deadline_alert_query.filter(Request.id.is_(None))
    deadline_alert_total = int(deadline_alert_query.scalar() or 0)
    return {
        "scope": role if role in {"ADMIN", "LAWYER", "CURATOR"} else "ADMIN",
        "new": int(by_status.get("NEW", 0)),
        "by_status": by_status,
        "assigned_total": assigned_total,
        "active_assigned_total": active_assigned_total,
        "unassigned_total": unassigned_total,
        "my_unread_updates": my_unread_updates,
        "my_unread_by_event": my_unread_by_event,
        "deadline_alert_total": deadline_alert_total,
        "month_revenue": monthly_revenue,
        "month_expenses": round(sum(_to_float(row.get("monthly_salary")) for row in scoped_lawyer_loads), 2)
        if role == "LAWYER"
        else round(sum(_to_float(row.get("monthly_salary")) for row in lawyer_loads), 2),
        "frt_avg_minutes": sla_snapshot.get("frt_avg_minutes"),
        "sla_overdue": sla_snapshot.get("overdue_total", 0),
        "overdue_by_status": sla_snapshot.get("overdue_by_status", {}),
        "overdue_by_transition": sla_snapshot.get("overdue_by_transition", {}),
        "avg_time_in_status_hours": sla_snapshot.get("avg_time_in_status_hours", {}),
        "unread_for_clients": int(unread_for_clients),
        "unread_for_lawyers": int(unread_for_lawyers),
        "service_request_unread_total": int(service_request_unread_total),
        "lawyer_loads": scoped_lawyer_loads,
    }


@router.get("/lawyers/{lawyer_id}/active-requests")
def lawyer_active_requests(
    lawyer_id: str,
    db: Session = Depends(get_db),
    admin=Depends(require_role("ADMIN", "LAWYER")),
):
    actor_role = str(admin.get("role") or "").upper()
    actor_id = str(admin.get("sub") or "").strip()
    if actor_role == "LAWYER" and str(lawyer_id) != actor_id:
        return {"rows": [], "total": 0, "totals": {"amount": 0.0, "salary": 0.0}}

    lawyer = db.query(AdminUser).filter(AdminUser.id == _uuid_or_none(lawyer_id), AdminUser.role == "LAWYER").first()
    if lawyer is None:
        return {"rows": [], "total": 0, "totals": {"amount": 0.0, "salary": 0.0}}

    terminal_codes = _terminal_status_codes(db)
    paid_codes = _paid_status_codes()
    now_utc = datetime.now(timezone.utc)
    month_start, next_month_start = _month_bounds(now_utc)

    salary_percent = _to_float(lawyer.salary_percent)
    paid_by_request_rows = (
        db.query(StatusHistory.request_id, func.count(StatusHistory.id))
        .join(Request, Request.id == StatusHistory.request_id)
        .filter(Request.assigned_lawyer_id == str(lawyer.id))
        .filter(StatusHistory.created_at >= month_start, StatusHistory.created_at < next_month_start)
        .filter(func.upper(StatusHistory.to_status).in_(paid_codes))
        .group_by(StatusHistory.request_id)
        .all()
    )
    paid_events_per_request = {str(req_id): int(count) for req_id, count in paid_by_request_rows if req_id}

    request_rows = (
        db.query(Request)
        .filter(Request.assigned_lawyer_id == str(lawyer.id))
        .filter(Request.status_code.notin_(terminal_codes))
        .order_by(Request.created_at.desc(), Request.track_number.asc())
        .all()
    )

    rows = []
    total_amount = 0.0
    total_salary = 0.0
    for req in request_rows:
        req_id = str(req.id)
        invoice_amount = _to_float(req.invoice_amount)
        paid_events = int(paid_events_per_request.get(req_id, 0))
        month_paid_amount = round(invoice_amount * paid_events, 2)
        month_salary_amount = round(month_paid_amount * salary_percent / 100.0, 2)
        total_amount += month_paid_amount
        total_salary += month_salary_amount
        rows.append(
            {
                "id": req_id,
                "track_number": req.track_number,
                "status_code": req.status_code,
                "client_name": req.client_name,
                "invoice_amount": round(invoice_amount, 2),
                "month_paid_events": paid_events,
                "month_paid_amount": month_paid_amount,
                "month_salary_amount": month_salary_amount,
                "created_at": req.created_at.isoformat() if req.created_at else None,
                "paid_at": req.paid_at.isoformat() if req.paid_at else None,
            }
        )

    return {
        "rows": rows,
        "total": len(rows),
        "totals": {
            "amount": round(total_amount, 2),
            "salary": round(total_salary, 2),
        },
    }
