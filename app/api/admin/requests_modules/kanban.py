from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.admin_user import AdminUser
from app.models.request import Request
from app.models.status import Status
from app.models.status_group import StatusGroup
from app.models.status_history import StatusHistory
from app.models.topic_status_transition import TopicStatusTransition
from app.schemas.universal import FilterClause, Page, UniversalQuery
from app.services.universal_query import apply_universal_query

from .common import parse_datetime_safe

ALLOWED_KANBAN_FILTER_FIELDS = {"assigned_lawyer_id", "client_name", "status_code", "created_at", "topic_code", "overdue"}
ALLOWED_KANBAN_SORT_MODES = {"created_newest", "lawyer", "deadline"}
FALLBACK_KANBAN_GROUPS = [
    ("fallback_new", "Новые", 10),
    ("fallback_in_progress", "В работе", 20),
    ("fallback_waiting", "Ожидание", 30),
    ("fallback_done", "Завершены", 40),
]


def status_meta_or_default(meta_map: dict[str, dict[str, object]], status_code: str) -> dict[str, object]:
    return meta_map.get(status_code) or {
        "name": status_code,
        "kind": "DEFAULT",
        "is_terminal": False,
        "status_group_id": None,
        "status_group_name": None,
        "status_group_order": None,
    }


def fallback_group_for_status(status_code: str, status_meta: dict[str, object]) -> tuple[str, str, int]:
    code = str(status_code or "").strip().upper()
    kind = str(status_meta.get("kind") or "DEFAULT").upper()
    name = str(status_meta.get("name") or "").upper()
    is_terminal = bool(status_meta.get("is_terminal"))

    if is_terminal:
        return FALLBACK_KANBAN_GROUPS[3]
    if kind == "PAID":
        return FALLBACK_KANBAN_GROUPS[3]
    if code.startswith("NEW") or "НОВ" in name:
        return FALLBACK_KANBAN_GROUPS[0]
    waiting_tokens = ("WAIT", "PEND", "HOLD", "SUSPEND", "BLOCK")
    waiting_ru_tokens = ("ОЖИД", "ПАУЗ", "СОГЛАС", "ОПЛАТ", "СУД")
    if kind == "INVOICE":
        return FALLBACK_KANBAN_GROUPS[2]
    if any(token in code for token in waiting_tokens) or any(token in name for token in waiting_ru_tokens):
        return FALLBACK_KANBAN_GROUPS[2]
    done_tokens = ("CLOSE", "RESOLV", "REJECT", "DONE", "PAID")
    done_ru_tokens = ("ЗАВЕРШ", "ЗАКРЫ", "РЕШЕН", "ОТКЛОН", "ОПЛАЧ")
    if any(token in code for token in done_tokens) or any(token in name for token in done_ru_tokens):
        return FALLBACK_KANBAN_GROUPS[3]
    return FALLBACK_KANBAN_GROUPS[1]


def extract_case_deadline(extra_fields: object) -> datetime | None:
    if not isinstance(extra_fields, dict):
        return None
    deadline_keys = (
        "deadline_at",
        "deadline",
        "due_date",
        "due_at",
        "case_deadline",
        "court_date",
        "hearing_date",
        "next_action_deadline",
    )
    for key in deadline_keys:
        parsed = parse_datetime_safe(extra_fields.get(key))
        if parsed:
            return parsed
    return None


def coerce_kanban_bool(value: object) -> bool:
    if isinstance(value, bool):
        return value
    text = str(value or "").strip().lower()
    if text in {"1", "true", "yes", "y", "on"}:
        return True
    if text in {"0", "false", "no", "n", "off"}:
        return False
    raise HTTPException(status_code=400, detail='Поле "overdue" должно быть boolean')


def parse_kanban_filters_or_400(raw_filters: str | None) -> tuple[list[FilterClause], list[tuple[str, bool]]]:
    if not raw_filters:
        return [], []
    try:
        parsed = json.loads(raw_filters)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Некорректный JSON фильтров канбана") from exc
    if not isinstance(parsed, list):
        raise HTTPException(status_code=400, detail="Фильтры канбана должны быть массивом")

    universal_filters: list[FilterClause] = []
    overdue_filters: list[tuple[str, bool]] = []
    for index, item in enumerate(parsed):
        if not isinstance(item, dict):
            raise HTTPException(status_code=400, detail=f"Фильтр #{index + 1} должен быть объектом")
        field = str(item.get("field") or "").strip()
        op = str(item.get("op") or "").strip()
        value = item.get("value")
        if field not in ALLOWED_KANBAN_FILTER_FIELDS:
            raise HTTPException(status_code=400, detail=f'Недоступное поле фильтра: "{field}"')
        if op not in {"=", "!=", ">", "<", ">=", "<=", "~"}:
            raise HTTPException(status_code=400, detail=f'Недопустимый оператор фильтра: "{op}"')
        if field == "overdue":
            if op not in {"=", "!="}:
                raise HTTPException(status_code=400, detail='Для поля "overdue" доступны только операторы "=" и "!="')
            overdue_filters.append((op, coerce_kanban_bool(value)))
            continue
        universal_filters.append(FilterClause(field=field, op=op, value=value))
    return universal_filters, overdue_filters


def apply_overdue_filters(items: list[dict[str, object]], overdue_filters: list[tuple[str, bool]]) -> list[dict[str, object]]:
    if not overdue_filters:
        return items
    now = datetime.now(timezone.utc)
    out: list[dict[str, object]] = []
    for item in items:
        raw_deadline = item.get("sla_deadline_at") or item.get("case_deadline_at")
        deadline_at = parse_datetime_safe(raw_deadline)
        is_overdue = bool(deadline_at and deadline_at <= now)
        ok = True
        for op, expected in overdue_filters:
            if op == "=":
                ok = ok and (is_overdue == expected)
            elif op == "!=":
                ok = ok and (is_overdue != expected)
            if not ok:
                break
        if ok:
            out.append(item)
    return out


def sort_kanban_items(items: list[dict[str, object]], sort_mode: str) -> list[dict[str, object]]:
    mode = sort_mode if sort_mode in ALLOWED_KANBAN_SORT_MODES else "created_newest"
    epoch = datetime(1970, 1, 1, tzinfo=timezone.utc)

    if mode == "lawyer":
        return sorted(
            items,
            key=lambda row: (
                1 if not str(row.get("assigned_lawyer_name") or "").strip() else 0,
                str(row.get("assigned_lawyer_name") or "").lower(),
                -int((parse_datetime_safe(row.get("created_at")) or epoch).timestamp()),
            ),
        )

    if mode == "deadline":
        far_future = datetime(9999, 12, 31, tzinfo=timezone.utc)
        return sorted(
            items,
            key=lambda row: (
                parse_datetime_safe(row.get("sla_deadline_at") or row.get("case_deadline_at")) or far_future,
                -int((parse_datetime_safe(row.get("created_at")) or epoch).timestamp()),
            ),
        )

    return sorted(
        items,
        key=lambda row: parse_datetime_safe(row.get("created_at")) or epoch,
        reverse=True,
    )


def get_requests_kanban_service(
    db: Session,
    admin: dict,
    *,
    limit: int,
    filters: str | None,
    sort_mode: str,
) -> dict[str, Any]:
    role = str(admin.get("role") or "").upper()
    actor = str(admin.get("sub") or "").strip()

    base_query = db.query(Request)
    if role == "LAWYER":
        if not actor:
            raise HTTPException(status_code=401, detail="Некорректный токен")
        base_query = base_query.filter(
            or_(
                Request.assigned_lawyer_id == actor,
                Request.assigned_lawyer_id.is_(None),
            )
        )

    normalized_sort_mode = sort_mode if sort_mode in ALLOWED_KANBAN_SORT_MODES else "created_newest"
    query_filters, overdue_filters = parse_kanban_filters_or_400(filters)
    if query_filters:
        base_query = apply_universal_query(
            base_query,
            Request,
            UniversalQuery(
                filters=query_filters,
                sort=[],
                page=Page(limit=limit, offset=0),
            ),
        )

    request_rows: list[Request] = base_query.all()

    request_id_to_row = {str(row.id): row for row in request_rows}
    request_ids = [row.id for row in request_rows]
    status_codes = {str(row.status_code or "").strip() for row in request_rows if str(row.status_code or "").strip()}

    status_meta_map: dict[str, dict[str, object]] = {}
    if status_codes:
        status_rows = (
            db.query(Status, StatusGroup)
            .outerjoin(StatusGroup, StatusGroup.id == Status.status_group_id)
            .filter(Status.code.in_(list(status_codes)))
            .all()
        )
        status_meta_map = {
            str(status_row.code): {
                "name": str(status_row.name or status_row.code),
                "kind": str(status_row.kind or "DEFAULT"),
                "is_terminal": bool(status_row.is_terminal),
                "sort_order": int(status_row.sort_order or 0),
                "status_group_id": str(status_row.status_group_id) if status_row.status_group_id else None,
                "status_group_name": (str(group_row.name) if group_row is not None and group_row.name else None),
                "status_group_order": (int(group_row.sort_order or 0) if group_row is not None else None),
            }
            for status_row, group_row in status_rows
        }

    topic_codes = {str(row.topic_code or "").strip() for row in request_rows if str(row.topic_code or "").strip()}
    transition_rows: list[TopicStatusTransition] = []
    if topic_codes:
        transition_rows = (
            db.query(TopicStatusTransition)
            .filter(
                TopicStatusTransition.topic_code.in_(list(topic_codes)),
                TopicStatusTransition.enabled.is_(True),
            )
            .order_by(
                TopicStatusTransition.topic_code.asc(),
                TopicStatusTransition.sort_order.asc(),
                TopicStatusTransition.created_at.asc(),
            )
            .all()
        )
    transitions_by_topic: dict[str, list[TopicStatusTransition]] = {}
    transition_lookup: dict[tuple[str, str, str], TopicStatusTransition] = {}
    first_incoming_by_topic_to: dict[tuple[str, str], TopicStatusTransition] = {}
    for transition in transition_rows:
        topic = str(transition.topic_code or "").strip()
        from_status = str(transition.from_status or "").strip()
        to_status = str(transition.to_status or "").strip()
        if not topic or not from_status or not to_status:
            continue
        transitions_by_topic.setdefault(topic, []).append(transition)
        transition_lookup[(topic, from_status, to_status)] = transition
        first_incoming_by_topic_to.setdefault((topic, to_status), transition)

    assigned_ids = {
        str(row.assigned_lawyer_id or "").strip()
        for row in request_rows
        if str(row.assigned_lawyer_id or "").strip()
    }
    lawyer_name_map: dict[str, str] = {}
    if assigned_ids:
        valid_lawyer_ids: list[UUID] = []
        for raw in assigned_ids:
            try:
                valid_lawyer_ids.append(UUID(raw))
            except ValueError:
                continue
        if valid_lawyer_ids:
            lawyer_rows = db.query(AdminUser).filter(AdminUser.id.in_(valid_lawyer_ids)).all()
            lawyer_name_map = {
                str(row.id): str(row.name or row.email or row.id)
                for row in lawyer_rows
            }

    history_rows: list[StatusHistory] = []
    if request_ids:
        history_rows = (
            db.query(StatusHistory)
            .filter(StatusHistory.request_id.in_(request_ids))
            .order_by(StatusHistory.request_id.asc(), StatusHistory.created_at.desc())
            .all()
        )

    current_status_changed_at: dict[str, datetime] = {}
    previous_status_by_request: dict[str, str] = {}
    for row in history_rows:
        request_id = str(row.request_id)
        request_row = request_id_to_row.get(request_id)
        if request_row is None:
            continue
        current_status = str(request_row.status_code or "").strip()
        to_status = str(row.to_status or "").strip()
        if not current_status or to_status != current_status:
            continue
        if request_id not in current_status_changed_at and row.created_at:
            current_status_changed_at[request_id] = row.created_at
            previous_status_by_request[request_id] = str(row.from_status or "").strip()

    all_enabled_status_rows = (
        db.query(Status, StatusGroup)
        .outerjoin(StatusGroup, StatusGroup.id == Status.status_group_id)
        .filter(Status.enabled.is_(True))
        .order_by(Status.sort_order.asc(), Status.name.asc(), Status.code.asc())
        .all()
    )
    all_enabled_statuses: list[dict[str, object]] = []
    for status_row, group_row in all_enabled_status_rows:
        code = str(status_row.code or "").strip()
        if not code:
            continue
        meta = {
            "code": code,
            "name": str(status_row.name or code),
            "kind": str(status_row.kind or "DEFAULT"),
            "is_terminal": bool(status_row.is_terminal),
            "status_group_id": str(status_row.status_group_id) if status_row.status_group_id else None,
            "status_group_name": (str(group_row.name) if group_row is not None and group_row.name else None),
            "status_group_order": (int(group_row.sort_order or 0) if group_row is not None else None),
            "sort_order": int(status_row.sort_order or 0),
        }
        status_meta_map.setdefault(code, meta)
        all_enabled_statuses.append(meta)

    status_groups_rows = db.query(StatusGroup).order_by(StatusGroup.sort_order.asc(), StatusGroup.name.asc()).all()
    columns_catalog = [
        {
            "key": str(group.id),
            "label": str(group.name),
            "sort_order": int(group.sort_order or 0),
        }
        for group in status_groups_rows
    ]
    columns_by_key = {row["key"]: row for row in columns_catalog}

    items: list[dict[str, object]] = []
    group_totals: dict[str, int] = {row["key"]: 0 for row in columns_catalog}
    for row in request_rows:
        request_id = str(row.id)
        status_code = str(row.status_code or "").strip()
        topic_code = str(row.topic_code or "").strip()
        status_meta = status_meta_or_default(status_meta_map, status_code)
        status_group = str(status_meta.get("status_group_id") or "").strip()
        status_group_name = str(status_meta.get("status_group_name") or "").strip()
        status_group_order = status_meta.get("status_group_order")
        if not status_group:
            fallback_key, fallback_label, fallback_order = fallback_group_for_status(status_code, status_meta)
            status_group = fallback_key
            status_group_name = fallback_label
            status_group_order = fallback_order
            if fallback_key not in columns_by_key:
                columns_by_key[fallback_key] = {"key": fallback_key, "label": fallback_label, "sort_order": fallback_order}
                columns_catalog.append(columns_by_key[fallback_key])
        elif status_group not in columns_by_key:
            columns_by_key[status_group] = {
                "key": status_group,
                "label": status_group_name or status_group,
                "sort_order": int(status_group_order or 999),
            }
            columns_catalog.append(columns_by_key[status_group])

        available_transitions = []
        topic_rules = transitions_by_topic.get(topic_code) or []
        if topic_rules:
            for rule in topic_rules:
                from_status = str(rule.from_status or "").strip()
                to_status = str(rule.to_status or "").strip()
                if from_status != status_code or not to_status:
                    continue
                to_meta = status_meta_or_default(status_meta_map, to_status)
                target_group = str(to_meta.get("status_group_id") or "").strip()
                if not target_group:
                    target_group, fallback_label, fallback_order = fallback_group_for_status(to_status, to_meta)
                    if target_group not in columns_by_key:
                        columns_by_key[target_group] = {"key": target_group, "label": fallback_label, "sort_order": fallback_order}
                        columns_catalog.append(columns_by_key[target_group])
                    if target_group not in group_totals:
                        group_totals[target_group] = 0
                available_transitions.append(
                    {
                        "to_status": to_status,
                        "to_status_name": str(to_meta.get("name") or to_status),
                        "target_group": target_group,
                        "is_terminal": bool(to_meta.get("is_terminal")),
                    }
                )
        else:
            for status_def in all_enabled_statuses:
                to_status = str(status_def.get("code") or "").strip()
                if not to_status or to_status == status_code:
                    continue
                to_meta = status_meta_or_default(status_meta_map, to_status)
                target_group = str(to_meta.get("status_group_id") or "").strip()
                if not target_group:
                    target_group, fallback_label, fallback_order = fallback_group_for_status(to_status, to_meta)
                    if target_group not in columns_by_key:
                        columns_by_key[target_group] = {"key": target_group, "label": fallback_label, "sort_order": fallback_order}
                        columns_catalog.append(columns_by_key[target_group])
                    if target_group not in group_totals:
                        group_totals[target_group] = 0
                available_transitions.append(
                    {
                        "to_status": to_status,
                        "to_status_name": str(to_meta.get("name") or to_status),
                        "target_group": target_group,
                        "is_terminal": bool(to_meta.get("is_terminal")),
                    }
                )

        case_deadline = row.important_date_at or extract_case_deadline(row.extra_fields)
        entered_at = parse_datetime_safe(current_status_changed_at.get(request_id))
        if entered_at is None:
            entered_at = parse_datetime_safe(row.updated_at) or parse_datetime_safe(row.created_at)
        sla_deadline = None
        previous_status = str(previous_status_by_request.get(request_id) or "").strip()
        transition_rule = (
            transition_lookup.get((topic_code, previous_status, status_code))
            if previous_status
            else None
        )
        if transition_rule is None:
            transition_rule = first_incoming_by_topic_to.get((topic_code, status_code))
        if (
            transition_rule is not None
            and transition_rule.sla_hours is not None
            and int(transition_rule.sla_hours) > 0
            and entered_at is not None
        ):
            sla_deadline = entered_at + timedelta(hours=int(transition_rule.sla_hours))

        assigned_id = str(row.assigned_lawyer_id or "").strip() or None
        items.append(
            {
                "id": str(row.id),
                "track_number": row.track_number,
                "client_name": row.client_name,
                "client_phone": row.client_phone,
                "topic_code": row.topic_code,
                "status_code": status_code,
                "important_date_at": row.important_date_at.isoformat() if row.important_date_at else None,
                "status_name": str(status_meta.get("name") or status_code),
                "status_group": status_group,
                "status_group_name": status_group_name or None,
                "status_group_order": int(status_group_order or 0) if status_group_order is not None else None,
                "assigned_lawyer_id": assigned_id,
                "assigned_lawyer_name": lawyer_name_map.get(assigned_id or "", assigned_id),
                "description": row.description,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "updated_at": row.updated_at.isoformat() if row.updated_at else None,
                "lawyer_has_unread_updates": bool(row.lawyer_has_unread_updates),
                "lawyer_unread_event_type": row.lawyer_unread_event_type,
                "client_has_unread_updates": bool(row.client_has_unread_updates),
                "client_unread_event_type": row.client_unread_event_type,
                "case_deadline_at": case_deadline.isoformat() if case_deadline else None,
                "sla_deadline_at": sla_deadline.isoformat() if sla_deadline is not None else None,
                "available_transitions": available_transitions,
            }
        )

    items = apply_overdue_filters(items, overdue_filters)
    items = sort_kanban_items(items, normalized_sort_mode)
    total = len(items)
    if total > limit:
        items = items[:limit]

    for row in items:
        key = str(row.get("status_group") or "").strip()
        if not key:
            continue
        group_totals[key] = int(group_totals.get(key, 0)) + 1

    columns = []
    for item in sorted(
        columns_catalog,
        key=lambda row: (
            int(row.get("sort_order") or 0),
            str(row.get("label") or "").lower(),
        ),
    ):
        key = str(item.get("key") or "")
        if not key:
            continue
        columns.append(
            {
                "key": key,
                "label": str(item.get("label") or key),
                "sort_order": int(item.get("sort_order") or 0),
                "total": int(group_totals.get(key, 0)),
            }
        )

    return {
        "scope": role,
        "rows": items,
        "columns": columns,
        "total": total,
        "limit": int(limit),
        "sort_mode": normalized_sort_mode,
        "truncated": bool(total > len(items)),
    }
