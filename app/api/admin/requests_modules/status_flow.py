from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.models.request import Request
from app.models.status import Status
from app.models.status_group import StatusGroup
from app.models.status_history import StatusHistory
from app.models.topic_status_transition import TopicStatusTransition
from app.schemas.admin import RequestStatusChange
from app.schemas.universal import FilterClause, UniversalQuery
from app.services.billing_flow import apply_billing_transition_effects
from app.services.notifications import (
    EVENT_STATUS as NOTIFICATION_EVENT_STATUS,
    notify_request_event,
)
from app.services.request_read_markers import EVENT_STATUS, mark_unread_for_client
from app.services.request_status import apply_status_change_effects
from app.services.status_flow import transition_allowed_for_topic
from app.services.status_transition_requirements import validate_transition_requirements_or_400

from .common import normalize_important_date_or_default, parse_datetime_safe
from .permissions import ensure_lawyer_can_manage_request_or_403, ensure_lawyer_can_view_request_or_403, request_uuid_or_400


def terminal_status_codes(db: Session) -> set[str]:
    rows = db.query(Status.code).filter(Status.is_terminal.is_(True)).all()
    codes = {str(code or "").strip() for (code,) in rows if str(code or "").strip()}
    return codes or {"RESOLVED", "CLOSED", "REJECTED"}


def coerce_request_bool_filter_or_400(value: object) -> bool:
    if isinstance(value, bool):
        return value
    text = str(value or "").strip().lower()
    if text in {"1", "true", "yes", "y", "да"}:
        return True
    if text in {"0", "false", "no", "n", "нет"}:
        return False
    raise HTTPException(status_code=400, detail="Значение фильтра должно быть boolean")


def split_request_special_filters(uq: UniversalQuery) -> tuple[UniversalQuery, list[FilterClause]]:
    filters = list(uq.filters or [])
    special: list[FilterClause] = []
    regular: list[FilterClause] = []
    for clause in filters:
        field = str(getattr(clause, "field", "") or "").strip()
        if field in {"has_unread_updates", "deadline_alert"}:
            special.append(clause)
        else:
            regular.append(clause)
    return UniversalQuery(filters=regular, sort=list(uq.sort or []), page=uq.page), special


def apply_request_special_filters(
    base_query,
    *,
    db: Session,
    role: str,
    actor_id: str,
    special_filters: list[FilterClause],
):
    if not special_filters:
        return base_query
    terminal_codes_cache: set[str] | None = None
    for clause in special_filters:
        field = str(clause.field or "").strip()
        op = str(clause.op or "").strip()
        if op not in {"=", "!="}:
            raise HTTPException(status_code=400, detail=f'Оператор "{op}" не поддерживается для фильтра "{field}"')
        expected = coerce_request_bool_filter_or_400(clause.value)
        if field == "has_unread_updates":
            actor_expr = None
            try:
                actor_uuid = UUID(str(actor_id or "").strip())
            except ValueError:
                actor_uuid = None
            if actor_uuid is not None:
                actor_expr = Request.id.in_(
                    db.query(Notification.request_id).filter(
                        Notification.recipient_type == "ADMIN_USER",
                        Notification.recipient_admin_user_id == actor_uuid,
                        Notification.is_read.is_(False),
                        Notification.request_id.is_not(None),
                    )
                )
            if role == "LAWYER":
                expr = Request.lawyer_has_unread_updates.is_(True)
                if actor_expr is not None:
                    expr = or_(expr, actor_expr)
            else:
                expr = or_(
                    Request.lawyer_has_unread_updates.is_(True),
                    Request.client_has_unread_updates.is_(True),
                )
                if actor_expr is not None:
                    expr = or_(expr, actor_expr)
        elif field == "deadline_alert":
            now_utc = datetime.now(timezone.utc)
            next_day_start = datetime(now_utc.year, now_utc.month, now_utc.day, tzinfo=timezone.utc) + timedelta(days=1)
            if terminal_codes_cache is None:
                terminal_codes_cache = terminal_status_codes(db)
            expr = (
                Request.important_date_at.is_not(None)
                & (Request.important_date_at < next_day_start)
                & (Request.status_code.notin_(terminal_codes_cache))
            )
            if role == "LAWYER":
                expr = expr & (Request.assigned_lawyer_id == actor_id)
        else:
            continue
        base_query = base_query.filter(expr if expected else ~expr)
    return base_query


def change_request_status_service(
    request_id: str,
    payload: RequestStatusChange,
    db: Session,
    admin: dict,
) -> dict[str, Any]:
    request_uuid = request_uuid_or_400(request_id)
    req = db.get(Request, request_uuid)
    if not req:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    ensure_lawyer_can_manage_request_or_403(admin, req)

    next_status = str(payload.status_code or "").strip()
    if not next_status:
        raise HTTPException(status_code=400, detail='Поле "status_code" обязательно')

    status_row = db.query(Status).filter(Status.code == next_status, Status.enabled.is_(True)).first()
    if status_row is None:
        raise HTTPException(status_code=400, detail="Указан несуществующий или неактивный статус")

    old_status = str(req.status_code or "").strip()
    if old_status == next_status:
        raise HTTPException(status_code=400, detail="Выберите новый статус")
    if not transition_allowed_for_topic(
        db,
        str(req.topic_code or "").strip() or None,
        old_status,
        next_status,
    ):
        raise HTTPException(status_code=400, detail="Переход статуса не разрешен для выбранной темы")

    important_date_at = normalize_important_date_or_default(payload.important_date_at)
    comment = str(payload.comment or "").strip() or None
    responsible = str(admin.get("email") or "").strip() or "Администратор системы"

    validate_transition_requirements_or_400(db, req, old_status, next_status)

    req.status_code = next_status
    req.important_date_at = important_date_at
    req.responsible = responsible

    billing_note = apply_billing_transition_effects(
        db,
        req=req,
        from_status=old_status,
        to_status=next_status,
        admin=admin,
        responsible=responsible,
    )
    mark_unread_for_client(req, EVENT_STATUS)
    apply_status_change_effects(
        db,
        req,
        from_status=old_status,
        to_status=next_status,
        admin=admin,
        comment=comment,
        important_date_at=important_date_at,
        responsible=responsible,
    )
    notify_request_event(
        db,
        request=req,
        event_type=NOTIFICATION_EVENT_STATUS,
        actor_role=str(admin.get("role") or "").upper() or "ADMIN",
        actor_admin_user_id=admin.get("sub"),
        body=(
            f"{old_status} -> {next_status}"
            + f"\nВажная дата: {important_date_at.isoformat()}"
            + (f"\n{comment}" if comment else "")
            + (f"\n{billing_note}" if billing_note else "")
        ),
        responsible=responsible,
    )

    db.add(req)
    db.commit()
    db.refresh(req)
    return {
        "status": "ok",
        "request_id": str(req.id),
        "track_number": req.track_number,
        "from_status": old_status or None,
        "to_status": next_status,
        "important_date_at": req.important_date_at.isoformat() if req.important_date_at else None,
    }


def get_request_status_route_service(
    request_id: str,
    db: Session,
    admin: dict,
) -> dict[str, Any]:
    request_uuid = request_uuid_or_400(request_id)
    req = db.get(Request, request_uuid)
    if not req:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    ensure_lawyer_can_view_request_or_403(admin, req)

    topic_code = str(req.topic_code or "").strip()
    current_status = str(req.status_code or "").strip()

    history_rows = (
        db.query(StatusHistory)
        .filter(StatusHistory.request_id == req.id)
        .order_by(StatusHistory.created_at.asc())
        .all()
    )

    known_codes: set[str] = set()
    if current_status:
        known_codes.add(current_status)
    for row in history_rows:
        from_code = str(row.from_status or "").strip()
        to_code = str(row.to_status or "").strip()
        if from_code:
            known_codes.add(from_code)
        if to_code:
            known_codes.add(to_code)
    statuses_map: dict[str, dict[str, Any]] = {}
    all_enabled_status_rows = (
        db.query(Status, StatusGroup)
        .outerjoin(StatusGroup, StatusGroup.id == Status.status_group_id)
        .filter(Status.enabled.is_(True))
        .all()
    )
    for status_row, _group_row in all_enabled_status_rows:
        code = str(status_row.code or "").strip()
        if code:
            known_codes.add(code)
    if known_codes:
        status_rows = (
            db.query(Status, StatusGroup)
            .outerjoin(StatusGroup, StatusGroup.id == Status.status_group_id)
            .filter(Status.code.in_(list(known_codes)))
            .all()
        )
        statuses_map = {
            str(status_row.code): {
                "name": str(status_row.name or status_row.code),
                "kind": str(status_row.kind or "DEFAULT"),
                "is_terminal": bool(status_row.is_terminal),
                "status_group_id": str(status_row.status_group_id) if status_row.status_group_id else None,
                "status_group_name": (str(group_row.name) if group_row is not None and group_row.name else None),
            }
            for status_row, group_row in status_rows
        }

    transition_rows = (
        db.query(TopicStatusTransition)
        .filter(
            TopicStatusTransition.topic_code == topic_code,
            TopicStatusTransition.enabled.is_(True),
        )
        .order_by(TopicStatusTransition.sort_order.asc(), TopicStatusTransition.created_at.asc())
        .all()
        if topic_code
        else []
    )
    transition_sla_by_edge: dict[tuple[str, str], int] = {}
    outgoing_by_status: dict[str, list[str]] = {}
    incoming_sla_by_status: dict[str, int] = {}
    for transition in transition_rows:
        from_status = str(transition.from_status or "").strip()
        to_status = str(transition.to_status or "").strip()
        if not from_status or not to_status:
            continue
        outgoing_by_status.setdefault(from_status, []).append(to_status)
        sla_hours = int(transition.sla_hours or 0)
        if sla_hours > 0:
            transition_sla_by_edge[(from_status, to_status)] = sla_hours
            incoming_sla_by_status.setdefault(to_status, sla_hours)

    sequence_from_history: list[str] = []
    if history_rows:
        first_from = str(history_rows[0].from_status or "").strip()
        if first_from:
            sequence_from_history.append(first_from)
        for row in history_rows:
            to_code = str(row.to_status or "").strip()
            if to_code:
                sequence_from_history.append(to_code)
    elif current_status:
        sequence_from_history.append(current_status)

    ordered_codes: list[str] = []
    seen_codes: set[str] = set()

    def add_code(code: str) -> None:
        normalized = str(code or "").strip()
        if not normalized or normalized in seen_codes:
            return
        seen_codes.add(normalized)
        ordered_codes.append(normalized)

    for code in sequence_from_history:
        add_code(code)

    add_code(current_status)
    for to_status in outgoing_by_status.get(current_status, []):
        add_code(to_status)

    changed_at_by_status: dict[str, str] = {}
    for row in history_rows:
        to_code = str(row.to_status or "").strip()
        if to_code and row.created_at:
            changed_at_by_status[to_code] = row.created_at.isoformat()

    visited_codes = {code for code in sequence_from_history if code}
    current_index = ordered_codes.index(current_status) if current_status in ordered_codes else -1

    def status_name(code: str) -> str:
        meta = statuses_map.get(code) or {}
        return str(meta.get("name") or code)

    nodes: list[dict[str, str | int | None]] = []
    for index, code in enumerate(ordered_codes):
        meta = statuses_map.get(code) or {}
        state = "pending"
        if code == current_status:
            state = "current"
        elif code in visited_codes or (current_index >= 0 and index < current_index):
            state = "completed"

        note_parts: list[str] = []
        kind = str(meta.get("kind") or "DEFAULT")
        if kind == "INVOICE":
            note_parts.append("Этап выставления счета")
        elif kind == "PAID":
            note_parts.append("Этап подтверждения оплаты")

        nodes.append(
            {
                "code": code,
                "name": status_name(code),
                "kind": kind,
                "state": state,
                "changed_at": changed_at_by_status.get(code),
                "sla_hours": (
                    transition_sla_by_edge.get((ordered_codes[index - 1], code))
                    if index > 0
                    else None
                )
                or incoming_sla_by_status.get(code),
                "note": " • ".join(note_parts),
            }
        )

    history_entries: list[dict[str, object]] = []
    timeline: list[dict[str, object]] = []
    for row in history_rows:
        timeline.append(
            {
                "id": str(row.id),
                "from_status": str(row.from_status or "").strip() or None,
                "to_status": str(row.to_status or "").strip() or None,
                "to_status_name": status_name(str(row.to_status or "").strip()) if str(row.to_status or "").strip() else None,
                "created_at": row.created_at,
                "important_date_at": row.important_date_at,
                "comment": row.comment,
            }
        )
    if not timeline:
        timeline.append(
            {
                "id": "current",
                "from_status": None,
                "to_status": current_status or None,
                "to_status_name": status_name(current_status) if current_status else None,
                "created_at": req.updated_at or req.created_at,
                "important_date_at": req.important_date_at,
                "comment": None,
            }
        )
    for index, item in enumerate(timeline):
        current_at = parse_datetime_safe(item.get("created_at"))
        next_at = parse_datetime_safe(timeline[index + 1].get("created_at")) if index + 1 < len(timeline) else datetime.now(timezone.utc)
        important_date_at = parse_datetime_safe(item.get("important_date_at"))
        duration_seconds = None
        if isinstance(current_at, datetime) and isinstance(next_at, datetime):
            delta = next_at - current_at
            duration_seconds = max(0, int(delta.total_seconds()))
        history_entries.append(
            {
                "id": item.get("id"),
                "from_status": item.get("from_status"),
                "to_status": item.get("to_status"),
                "to_status_name": item.get("to_status_name"),
                "changed_at": current_at.isoformat() if isinstance(current_at, datetime) else None,
                "important_date_at": important_date_at.isoformat() if important_date_at else None,
                "comment": item.get("comment"),
                "duration_seconds": duration_seconds,
            }
        )

    available_statuses: list[dict[str, object]] = []
    for status_row, group_row in sorted(
        all_enabled_status_rows,
        key=lambda pair: (
            int(pair[1].sort_order or 0) if pair[1] is not None else 999,
            int(pair[0].sort_order or 0),
            str(pair[0].name or pair[0].code).lower(),
        ),
    ):
        code = str(status_row.code or "").strip()
        if not code:
            continue
        available_statuses.append(
            {
                "code": code,
                "name": str(status_row.name or code),
                "kind": str(status_row.kind or "DEFAULT"),
                "is_terminal": bool(status_row.is_terminal),
                "status_group_id": str(status_row.status_group_id) if status_row.status_group_id else None,
                "status_group_name": (str(group_row.name) if group_row is not None and group_row.name else None),
            }
        )

    return {
        "request_id": str(req.id),
        "track_number": req.track_number,
        "topic_code": req.topic_code,
        "current_status": current_status or None,
        "current_important_date_at": req.important_date_at.isoformat() if req.important_date_at else None,
        "available_statuses": available_statuses,
        "history": list(reversed(history_entries)),
        "nodes": nodes,
    }
