from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models.message import Message
from app.models.request import Request
from app.models.status import Status
from app.models.status_history import StatusHistory
from app.models.topic_status_transition import TopicStatusTransition

DEFAULT_TERMINAL_STATUS_CODES = {"RESOLVED", "CLOSED", "REJECTED"}
DEFAULT_SLA_HOURS_BY_STATUS = {
    "NEW": 24,
    "IN_PROGRESS": 72,
    "WAITING_CLIENT": 168,
    "WAITING_COURT": 336,
}
DEFAULT_SLA_HOURS = 72


def _terminal_status_codes(db: Session) -> set[str]:
    rows = db.query(Status.code).filter(Status.is_terminal.is_(True)).all()
    codes = {str(code).strip() for (code,) in rows if code}
    return codes or set(DEFAULT_TERMINAL_STATUS_CODES)


def _as_utc(value: datetime | None, fallback: datetime) -> datetime:
    if value is None:
        return fallback
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _load_topic_sla_maps(db: Session) -> tuple[dict[tuple[str, str], int], dict[tuple[str, str, str], int]]:
    rows = (
        db.query(
            TopicStatusTransition.topic_code,
            TopicStatusTransition.from_status,
            TopicStatusTransition.to_status,
            TopicStatusTransition.sla_hours,
        )
        .filter(
            TopicStatusTransition.enabled.is_(True),
            TopicStatusTransition.sla_hours.is_not(None),
            TopicStatusTransition.sla_hours > 0,
        )
        .all()
    )

    outgoing_sla: dict[tuple[str, str], int] = {}
    exact_sla: dict[tuple[str, str, str], int] = {}
    for topic_code, from_status, to_status, sla_hours in rows:
        topic = str(topic_code or "").strip()
        from_code = str(from_status or "").strip()
        to_code = str(to_status or "").strip()
        if not topic or not from_code or not to_code:
            continue
        sla = int(sla_hours or 0)
        if sla <= 0:
            continue
        exact_sla[(topic, from_code, to_code)] = sla
        key = (topic, from_code)
        if key not in outgoing_sla or sla < outgoing_sla[key]:
            outgoing_sla[key] = sla
    return outgoing_sla, exact_sla


def _current_status_started_at(req: Request, request_rows: list[StatusHistory], now_utc: datetime) -> datetime:
    current_status = str(req.status_code or "").strip()
    if current_status and request_rows:
        for row in reversed(request_rows):
            if str(row.to_status or "").strip() == current_status:
                return _as_utc(row.created_at, now_utc)
    return _as_utc(req.updated_at or req.created_at, now_utc)


def compute_sla_snapshot(
    db: Session,
    now: datetime | None = None,
    *,
    include_overdue_requests: bool = False,
) -> dict[str, Any]:
    now_utc = _as_utc(now, datetime.now(timezone.utc))
    terminal_codes = _terminal_status_codes(db)
    active_requests = db.query(Request).filter(Request.status_code.notin_(terminal_codes)).all()

    status_rows = db.query(StatusHistory).order_by(StatusHistory.request_id.asc(), StatusHistory.created_at.asc()).all()
    rows_by_request: dict[str, list[StatusHistory]] = defaultdict(list)
    for row in status_rows:
        rows_by_request[str(row.request_id)].append(row)

    outgoing_sla_map, _ = _load_topic_sla_maps(db)

    overdue_by_status: dict[str, int] = defaultdict(int)
    overdue_by_transition: dict[str, int] = defaultdict(int)
    overdue_requests: list[dict[str, Any]] = []
    for req in active_requests:
        status_code = str(req.status_code or "").strip() or "UNKNOWN"
        topic_code = str(req.topic_code or "").strip()
        threshold_hours = outgoing_sla_map.get(
            (topic_code, status_code),
            int(DEFAULT_SLA_HOURS_BY_STATUS.get(status_code, DEFAULT_SLA_HOURS)),
        )
        status_started_at = _current_status_started_at(req, rows_by_request.get(str(req.id), []), now_utc)
        hours_in_status = (now_utc - status_started_at).total_seconds() / 3600.0
        if hours_in_status > threshold_hours:
            overdue_by_status[status_code] += 1
            transition_key = f"{topic_code or '*'}:{status_code}->*"
            overdue_by_transition[transition_key] += 1
            if include_overdue_requests:
                overdue_requests.append(
                    {
                        "request_id": str(req.id),
                        "track_number": req.track_number,
                        "topic_code": req.topic_code,
                        "status_code": req.status_code,
                        "assigned_lawyer_id": req.assigned_lawyer_id,
                        "hours_in_status": round(hours_in_status, 2),
                        "threshold_hours": int(threshold_hours),
                    }
                )

    first_response_rows = (
        db.query(Message.request_id, Message.created_at)
        .filter(Message.author_type == "LAWYER")
        .order_by(Message.request_id.asc(), Message.created_at.asc())
        .all()
    )
    first_response_map = {}
    for request_id, created_at in first_response_rows:
        key = str(request_id)
        if key not in first_response_map and created_at is not None:
            first_response_map[key] = created_at

    frt_minutes: list[float] = []
    for req in active_requests:
        first_response_at = first_response_map.get(str(req.id))
        if not first_response_at or not req.created_at:
            continue
        first_dt = _as_utc(first_response_at, now_utc)
        req_created = _as_utc(req.created_at, now_utc)
        delta_min = (first_dt - req_created).total_seconds() / 60.0
        if delta_min >= 0:
            frt_minutes.append(delta_min)

    durations_by_status: dict[str, list[float]] = defaultdict(list)
    for req in active_requests:
        request_rows = rows_by_request.get(str(req.id), [])
        if not request_rows:
            started_at = _as_utc(req.created_at, now_utc)
            status_code = str(req.status_code or "").strip() or "UNKNOWN"
            durations_by_status[status_code].append(max((now_utc - started_at).total_seconds() / 3600.0, 0.0))
            continue

        for idx, row in enumerate(request_rows):
            start = _as_utc(row.created_at, now_utc)
            end_raw = request_rows[idx + 1].created_at if idx + 1 < len(request_rows) else now_utc
            end = _as_utc(end_raw, now_utc)
            status_code = str(row.to_status or "").strip() or "UNKNOWN"
            duration_hours = max((end - start).total_seconds() / 3600.0, 0.0)
            durations_by_status[status_code].append(duration_hours)

    result = {
        "checked_active_requests": int(len(active_requests)),
        "overdue_total": int(sum(overdue_by_status.values())),
        "overdue_by_status": dict(overdue_by_status),
        "overdue_by_transition": dict(overdue_by_transition),
        "frt_avg_minutes": round(sum(frt_minutes) / len(frt_minutes), 2) if frt_minutes else None,
        "avg_time_in_status_hours": {
            code: round(sum(values) / len(values), 2) for code, values in durations_by_status.items() if values
        },
    }
    if include_overdue_requests:
        result["overdue_requests"] = overdue_requests
    return result
