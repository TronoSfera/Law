import json
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import case, or_, update

from app.db.session import get_db
from app.core.deps import require_role
from app.schemas.universal import FilterClause, Page, UniversalQuery
from app.schemas.admin import (
    RequestAdminCreate,
    RequestAdminPatch,
    RequestDataRequirementCreate,
    RequestDataRequirementPatch,
    RequestReassign,
    RequestStatusChange,
)
from app.models.admin_user import AdminUser
from app.models.audit_log import AuditLog
from app.models.client import Client
from app.models.request_data_requirement import RequestDataRequirement
from app.models.request import Request
from app.models.status import Status
from app.models.status_group import StatusGroup
from app.models.status_history import StatusHistory
from app.models.topic_data_template import TopicDataTemplate
from app.services.notifications import (
    EVENT_STATUS as NOTIFICATION_EVENT_STATUS,
    mark_admin_notifications_read,
    notify_request_event,
)
from app.services.request_read_markers import EVENT_STATUS, clear_unread_for_lawyer, mark_unread_for_client
from app.services.request_status import actor_admin_uuid, apply_status_change_effects
from app.services.request_templates import validate_required_topic_fields_or_400
from app.services.status_transition_requirements import normalize_string_list
from app.services.billing_flow import apply_billing_transition_effects
from app.services.universal_query import apply_universal_query

router = APIRouter()
REQUEST_FINANCIAL_FIELDS = {"effective_rate", "invoice_amount", "paid_at", "paid_by_admin_id"}
ALLOWED_KANBAN_FILTER_FIELDS = {"assigned_lawyer_id", "client_name", "status_code", "created_at", "topic_code", "overdue"}
ALLOWED_KANBAN_SORT_MODES = {"created_newest", "lawyer", "deadline"}
FALLBACK_KANBAN_GROUPS = [
    ("fallback_new", "Новые", 10),
    ("fallback_in_progress", "В работе", 20),
    ("fallback_waiting", "Ожидание", 30),
    ("fallback_done", "Завершены", 40),
]


def _status_meta_or_default(meta_map: dict[str, dict[str, object]], status_code: str) -> dict[str, object]:
    return meta_map.get(status_code) or {
        "name": status_code,
        "kind": "DEFAULT",
        "is_terminal": False,
        "status_group_id": None,
        "status_group_name": None,
        "status_group_order": None,
    }


def _fallback_group_for_status(status_code: str, status_meta: dict[str, object]) -> tuple[str, str, int]:
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


def _parse_datetime_safe(value: object) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    text = str(value).strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _normalize_important_date_or_default(raw: object, *, default_days: int = 3) -> datetime:
    parsed = _parse_datetime_safe(raw)
    if parsed:
        return parsed
    return datetime.now(timezone.utc) + timedelta(days=default_days)


def _terminal_status_codes(db: Session) -> set[str]:
    rows = db.query(Status.code).filter(Status.is_terminal.is_(True)).all()
    codes = {str(code or "").strip() for (code,) in rows if str(code or "").strip()}
    return codes or {"RESOLVED", "CLOSED", "REJECTED"}


def _coerce_request_bool_filter_or_400(value: object) -> bool:
    if isinstance(value, bool):
        return value
    text = str(value or "").strip().lower()
    if text in {"1", "true", "yes", "y", "да"}:
        return True
    if text in {"0", "false", "no", "n", "нет"}:
        return False
    raise HTTPException(status_code=400, detail="Значение фильтра должно быть boolean")


def _split_request_special_filters(uq: UniversalQuery) -> tuple[UniversalQuery, list[FilterClause]]:
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


def _apply_request_special_filters(
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
        expected = _coerce_request_bool_filter_or_400(clause.value)
        if field == "has_unread_updates":
            if role == "LAWYER":
                expr = Request.lawyer_has_unread_updates.is_(True)
            else:
                expr = or_(
                    Request.lawyer_has_unread_updates.is_(True),
                    Request.client_has_unread_updates.is_(True),
                )
        elif field == "deadline_alert":
            now_utc = datetime.now(timezone.utc)
            next_day_start = datetime(now_utc.year, now_utc.month, now_utc.day, tzinfo=timezone.utc) + timedelta(days=1)
            if terminal_codes_cache is None:
                terminal_codes_cache = _terminal_status_codes(db)
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


def _normalize_client_phone(value: object) -> str:
    text = "".join(ch for ch in str(value or "") if ch.isdigit() or ch == "+")
    if not text:
        return ""
    if text.startswith("8") and len(text) == 11:
        text = "+7" + text[1:]
    if not text.startswith("+") and text.isdigit():
        text = "+" + text
    return text


def _client_uuid_or_none(value: object) -> UUID | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        return UUID(raw)
    except ValueError:
        raise HTTPException(status_code=400, detail='Некорректный "client_id"')


def _client_for_request_payload_or_400(
    db: Session,
    *,
    client_id: object,
    client_name: object,
    client_phone: object,
    responsible: str,
) -> Client:
    client_uuid = _client_uuid_or_none(client_id)
    if client_uuid is not None:
        row = db.get(Client, client_uuid)
        if row is None:
            raise HTTPException(status_code=404, detail="Клиент не найден")
        return row

    normalized_phone = _normalize_client_phone(client_phone)
    if not normalized_phone:
        raise HTTPException(status_code=400, detail='Поле "client_phone" обязательно')
    normalized_name = str(client_name or "").strip() or "Клиент"

    row = db.query(Client).filter(Client.phone == normalized_phone).first()
    if row is None:
        row = Client(
            full_name=normalized_name,
            phone=normalized_phone,
            responsible=responsible,
        )
        db.add(row)
        db.flush()
        return row

    changed = False
    if normalized_name and row.full_name != normalized_name:
        row.full_name = normalized_name
        changed = True
    if changed:
        row.responsible = responsible
        db.add(row)
        db.flush()
    return row


def _extract_case_deadline(extra_fields: object) -> datetime | None:
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
        parsed = _parse_datetime_safe(extra_fields.get(key))
        if parsed:
            return parsed
    return None


def _coerce_kanban_bool(value: object) -> bool:
    if isinstance(value, bool):
        return value
    text = str(value or "").strip().lower()
    if text in {"1", "true", "yes", "y", "on"}:
        return True
    if text in {"0", "false", "no", "n", "off"}:
        return False
    raise HTTPException(status_code=400, detail='Поле "overdue" должно быть boolean')


def _parse_kanban_filters_or_400(raw_filters: str | None) -> tuple[list[FilterClause], list[tuple[str, bool]]]:
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
            overdue_filters.append((op, _coerce_kanban_bool(value)))
            continue
        universal_filters.append(FilterClause(field=field, op=op, value=value))
    return universal_filters, overdue_filters


def _apply_overdue_filters(items: list[dict[str, object]], overdue_filters: list[tuple[str, bool]]) -> list[dict[str, object]]:
    if not overdue_filters:
        return items
    now = datetime.now(timezone.utc)
    out: list[dict[str, object]] = []
    for item in items:
        raw_deadline = item.get("sla_deadline_at") or item.get("case_deadline_at")
        deadline_at = _parse_datetime_safe(raw_deadline)
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


def _sort_kanban_items(items: list[dict[str, object]], sort_mode: str) -> list[dict[str, object]]:
    mode = sort_mode if sort_mode in ALLOWED_KANBAN_SORT_MODES else "created_newest"
    epoch = datetime(1970, 1, 1, tzinfo=timezone.utc)

    if mode == "lawyer":
        return sorted(
            items,
            key=lambda row: (
                1 if not str(row.get("assigned_lawyer_name") or "").strip() else 0,
                str(row.get("assigned_lawyer_name") or "").lower(),
                -int((_parse_datetime_safe(row.get("created_at")) or epoch).timestamp()),
            ),
        )

    if mode == "deadline":
        far_future = datetime(9999, 12, 31, tzinfo=timezone.utc)
        return sorted(
            items,
            key=lambda row: (
                _parse_datetime_safe(row.get("sla_deadline_at") or row.get("case_deadline_at")) or far_future,
                -int((_parse_datetime_safe(row.get("created_at")) or epoch).timestamp()),
            ),
        )

    return sorted(
        items,
        key=lambda row: _parse_datetime_safe(row.get("created_at")) or epoch,
        reverse=True,
    )


def _request_uuid_or_400(request_id: str) -> UUID:
    try:
        return UUID(str(request_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Некорректный идентификатор заявки")


def _active_lawyer_or_400(db: Session, lawyer_id: str) -> AdminUser:
    try:
        lawyer_uuid = UUID(str(lawyer_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Некорректный идентификатор юриста")
    lawyer = db.get(AdminUser, lawyer_uuid)
    if not lawyer or str(lawyer.role or "").upper() != "LAWYER" or not bool(lawyer.is_active):
        raise HTTPException(status_code=400, detail="Можно назначить только активного юриста")
    return lawyer


def _ensure_lawyer_can_manage_request_or_403(admin: dict, req: Request) -> None:
    role = str(admin.get("role") or "").upper()
    if role != "LAWYER":
        return
    actor = str(admin.get("sub") or "").strip()
    if not actor:
        raise HTTPException(status_code=401, detail="Некорректный токен")
    assigned = str(req.assigned_lawyer_id or "").strip()
    if not actor or not assigned or actor != assigned:
        raise HTTPException(status_code=403, detail="Юрист может работать только со своими назначенными заявками")


def _ensure_lawyer_can_view_request_or_403(admin: dict, req: Request) -> None:
    role = str(admin.get("role") or "").upper()
    if role != "LAWYER":
        return
    actor = str(admin.get("sub") or "").strip()
    if not actor:
        raise HTTPException(status_code=401, detail="Некорректный токен")
    assigned = str(req.assigned_lawyer_id or "").strip()
    if assigned and actor != assigned:
        raise HTTPException(status_code=403, detail="Юрист может видеть только свои и неназначенные заявки")


def _request_data_requirement_row(row: RequestDataRequirement) -> dict:
    return {
        "id": str(row.id),
        "request_id": str(row.request_id),
        "topic_template_id": str(row.topic_template_id) if row.topic_template_id else None,
        "key": row.key,
        "label": row.label,
        "description": row.description,
        "required": bool(row.required),
        "created_by_admin_id": str(row.created_by_admin_id) if row.created_by_admin_id else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }

@router.post("/query")
def query_requests(uq: UniversalQuery, db: Session = Depends(get_db), admin=Depends(require_role("ADMIN","LAWYER"))):
    base_query = db.query(Request)
    role = str(admin.get("role") or "").upper()
    actor = str(admin.get("sub") or "").strip()
    if role == "LAWYER":
        if not actor:
            raise HTTPException(status_code=401, detail="Некорректный токен")
        base_query = base_query.filter(
            or_(
                Request.assigned_lawyer_id == actor,
                Request.assigned_lawyer_id.is_(None),
            )
        )

    regular_uq, special_filters = _split_request_special_filters(uq)
    base_query = _apply_request_special_filters(
        base_query,
        db=db,
        role=role,
        actor_id=actor,
        special_filters=special_filters,
    )
    q = apply_universal_query(base_query, Request, regular_uq)
    total = q.count()
    rows = q.offset(uq.page.offset).limit(uq.page.limit).all()
    return {
        "rows": [
            {
                "id": str(r.id),
                "track_number": r.track_number,
                "client_id": str(r.client_id) if r.client_id else None,
                "status_code": r.status_code,
                "client_name": r.client_name,
                "client_phone": r.client_phone,
                "topic_code": r.topic_code,
                "important_date_at": r.important_date_at.isoformat() if r.important_date_at else None,
                "effective_rate": float(r.effective_rate) if r.effective_rate is not None else None,
                "request_cost": float(r.request_cost) if r.request_cost is not None else None,
                "invoice_amount": float(r.invoice_amount) if r.invoice_amount is not None else None,
                "paid_at": r.paid_at.isoformat() if r.paid_at else None,
                "paid_by_admin_id": r.paid_by_admin_id,
                "client_has_unread_updates": r.client_has_unread_updates,
                "client_unread_event_type": r.client_unread_event_type,
                "lawyer_has_unread_updates": r.lawyer_has_unread_updates,
                "lawyer_unread_event_type": r.lawyer_unread_event_type,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            }
            for r in rows
        ],
        "total": total,
    }


@router.get("/kanban")
def get_requests_kanban(
    db: Session = Depends(get_db),
    admin=Depends(require_role("ADMIN", "LAWYER")),
    limit: int = Query(default=400, ge=1, le=1000),
    filters: str | None = Query(default=None),
    sort_mode: str = Query(default="created_newest"),
):
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
    query_filters, overdue_filters = _parse_kanban_filters_or_400(filters)
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

    assigned_ids = {str(row.assigned_lawyer_id or "").strip() for row in request_rows if str(row.assigned_lawyer_id or "").strip()}
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
        status_meta = _status_meta_or_default(status_meta_map, status_code)
        status_group = str(status_meta.get("status_group_id") or "").strip()
        status_group_name = str(status_meta.get("status_group_name") or "").strip()
        status_group_order = status_meta.get("status_group_order")
        if not status_group:
            fallback_key, fallback_label, fallback_order = _fallback_group_for_status(status_code, status_meta)
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
        for status_def in all_enabled_statuses:
            to_status = str(status_def.get("code") or "").strip()
            if not to_status or to_status == status_code:
                continue
            to_meta = _status_meta_or_default(status_meta_map, to_status)
            target_group = str(to_meta.get("status_group_id") or "").strip()
            if not target_group:
                target_group, fallback_label, fallback_order = _fallback_group_for_status(to_status, to_meta)
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

        case_deadline = row.important_date_at or _extract_case_deadline(row.extra_fields)
        sla_deadline = None

        assigned_id = str(row.assigned_lawyer_id or "").strip() or None
        items.append(
            {
                "id": request_id,
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
                "sla_deadline_at": sla_deadline.isoformat() if sla_deadline else None,
                "available_transitions": available_transitions,
            }
        )

    items = _apply_overdue_filters(items, overdue_filters)
    items = _sort_kanban_items(items, normalized_sort_mode)
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


@router.post("", status_code=201)
def create_request(payload: RequestAdminCreate, db: Session = Depends(get_db), admin=Depends(require_role("ADMIN", "LAWYER"))):
    actor_role = str(admin.get("role") or "").upper()
    if actor_role == "LAWYER" and str(payload.assigned_lawyer_id or "").strip():
        raise HTTPException(status_code=403, detail="Юрист не может назначать заявку при создании")
    if actor_role == "LAWYER":
        forbidden_fields = sorted(REQUEST_FINANCIAL_FIELDS.intersection(set(payload.model_fields_set)))
        if forbidden_fields:
            raise HTTPException(status_code=403, detail="Юрист не может изменять финансовые поля заявки")
    validate_required_topic_fields_or_400(db, payload.topic_code, payload.extra_fields)
    track = payload.track_number or f"TRK-{uuid4().hex[:10].upper()}"
    responsible = str(admin.get("email") or "").strip() or "Администратор системы"
    client = _client_for_request_payload_or_400(
        db,
        client_id=payload.client_id,
        client_name=payload.client_name,
        client_phone=payload.client_phone,
        responsible=responsible,
    )
    assigned_lawyer_id = str(payload.assigned_lawyer_id or "").strip() or None
    effective_rate = payload.effective_rate
    if assigned_lawyer_id:
        assigned_lawyer = _active_lawyer_or_400(db, assigned_lawyer_id)
        assigned_lawyer_id = str(assigned_lawyer.id)
        if effective_rate is None:
            effective_rate = assigned_lawyer.default_rate
    row = Request(
        track_number=track,
        client_id=client.id,
        client_name=client.full_name,
        client_phone=client.phone,
        topic_code=payload.topic_code,
        status_code=payload.status_code,
        important_date_at=payload.important_date_at,
        description=payload.description,
        extra_fields=payload.extra_fields,
        assigned_lawyer_id=assigned_lawyer_id,
        effective_rate=effective_rate,
        request_cost=payload.request_cost,
        invoice_amount=payload.invoice_amount,
        paid_at=payload.paid_at,
        paid_by_admin_id=payload.paid_by_admin_id,
        total_attachments_bytes=payload.total_attachments_bytes,
        responsible=responsible,
    )
    try:
        db.add(row)
        db.commit()
        db.refresh(row)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Заявка с таким номером уже существует")
    return {"id": str(row.id), "track_number": row.track_number}


@router.patch("/{request_id}")
def update_request(
    request_id: str,
    payload: RequestAdminPatch,
    db: Session = Depends(get_db),
    admin=Depends(require_role("ADMIN", "LAWYER")),
):
    request_uuid = _request_uuid_or_400(request_id)
    row = db.get(Request, request_uuid)
    if not row:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    _ensure_lawyer_can_manage_request_or_403(admin, row)
    changes = payload.model_dump(exclude_unset=True)
    actor_role = str(admin.get("role") or "").upper()
    if actor_role == "LAWYER":
        if "assigned_lawyer_id" in changes:
            raise HTTPException(status_code=403, detail='Назначение доступно только через действие "Взять в работу"')
        forbidden_fields = sorted(REQUEST_FINANCIAL_FIELDS.intersection(set(changes.keys())))
        if forbidden_fields:
            raise HTTPException(status_code=403, detail="Юрист не может изменять финансовые поля заявки")
    if actor_role == "ADMIN" and "assigned_lawyer_id" in changes:
        assigned_raw = changes.get("assigned_lawyer_id")
        if assigned_raw is None or not str(assigned_raw).strip():
            changes["assigned_lawyer_id"] = None
        else:
            assigned_lawyer = _active_lawyer_or_400(db, str(assigned_raw))
            changes["assigned_lawyer_id"] = str(assigned_lawyer.id)
            if row.effective_rate is None and "effective_rate" not in changes:
                changes["effective_rate"] = assigned_lawyer.default_rate
    old_status = str(row.status_code or "")
    responsible = str(admin.get("email") or "").strip() or "Администратор системы"
    if {"client_id", "client_name", "client_phone"}.intersection(set(changes.keys())):
        client = _client_for_request_payload_or_400(
            db,
            client_id=changes.get("client_id", row.client_id),
            client_name=changes.get("client_name", row.client_name),
            client_phone=changes.get("client_phone", row.client_phone),
            responsible=responsible,
        )
        changes["client_id"] = client.id
        changes["client_name"] = client.full_name
        changes["client_phone"] = client.phone
    status_changed = "status_code" in changes and str(changes.get("status_code") or "") != old_status
    if status_changed and ("important_date_at" not in changes or changes.get("important_date_at") is None):
        changes["important_date_at"] = _normalize_important_date_or_default(None)
    for key, value in changes.items():
        setattr(row, key, value)
    if status_changed:
        next_status = str(changes.get("status_code") or "")
        important_date_at = row.important_date_at
        billing_note = apply_billing_transition_effects(
            db,
            req=row,
            from_status=old_status,
            to_status=next_status,
            admin=admin,
            important_date_at=important_date_at,
            responsible=responsible,
        )
        mark_unread_for_client(row, EVENT_STATUS)
        apply_status_change_effects(
            db,
            row,
            from_status=old_status,
            to_status=next_status,
            admin=admin,
            responsible=responsible,
        )
        notify_request_event(
            db,
            request=row,
            event_type=NOTIFICATION_EVENT_STATUS,
            actor_role=str(admin.get("role") or "").upper() or "ADMIN",
            actor_admin_user_id=admin.get("sub"),
            body=(
                f"{old_status} -> {next_status}"
                + (f"\nВажная дата: {important_date_at.isoformat()}" if important_date_at else "")
                + (f"\n{billing_note}" if billing_note else "")
            ),
            responsible=responsible,
        )
    try:
        db.add(row)
        db.commit()
        db.refresh(row)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Заявка с таким номером уже существует")
    return {"status": "обновлено", "id": str(row.id), "track_number": row.track_number}


@router.delete("/{request_id}")
def delete_request(request_id: str, db: Session = Depends(get_db), admin=Depends(require_role("ADMIN", "LAWYER"))):
    request_uuid = _request_uuid_or_400(request_id)
    row = db.get(Request, request_uuid)
    if not row:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    _ensure_lawyer_can_manage_request_or_403(admin, row)
    db.delete(row)
    db.commit()
    return {"status": "удалено"}

@router.get("/{request_id}")
def get_request(request_id: str, db: Session = Depends(get_db), admin=Depends(require_role("ADMIN","LAWYER"))):
    request_uuid = _request_uuid_or_400(request_id)
    req = db.get(Request, request_uuid)
    if not req:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    _ensure_lawyer_can_view_request_or_403(admin, req)
    changed = False
    if str(admin.get("role") or "").upper() == "LAWYER" and clear_unread_for_lawyer(req):
        changed = True
        db.add(req)
    read_count = mark_admin_notifications_read(
        db,
        admin_user_id=admin.get("sub"),
        request_id=req.id,
        responsible=str(admin.get("email") or "").strip() or "Администратор системы",
    )
    if read_count:
        changed = True
    if changed:
        db.commit()
        db.refresh(req)
    return {
        "id": str(req.id),
        "track_number": req.track_number,
        "client_id": str(req.client_id) if req.client_id else None,
        "client_name": req.client_name,
        "client_phone": req.client_phone,
        "topic_code": req.topic_code,
        "status_code": req.status_code,
        "important_date_at": req.important_date_at.isoformat() if req.important_date_at else None,
        "description": req.description,
        "extra_fields": req.extra_fields,
        "assigned_lawyer_id": req.assigned_lawyer_id,
        "effective_rate": float(req.effective_rate) if req.effective_rate is not None else None,
        "request_cost": float(req.request_cost) if req.request_cost is not None else None,
        "invoice_amount": float(req.invoice_amount) if req.invoice_amount is not None else None,
        "paid_at": req.paid_at.isoformat() if req.paid_at else None,
        "paid_by_admin_id": req.paid_by_admin_id,
        "total_attachments_bytes": req.total_attachments_bytes,
        "client_has_unread_updates": req.client_has_unread_updates,
        "client_unread_event_type": req.client_unread_event_type,
        "lawyer_has_unread_updates": req.lawyer_has_unread_updates,
        "lawyer_unread_event_type": req.lawyer_unread_event_type,
        "created_at": req.created_at.isoformat() if req.created_at else None,
        "updated_at": req.updated_at.isoformat() if req.updated_at else None,
    }


@router.post("/{request_id}/status-change")
def change_request_status(
    request_id: str,
    payload: RequestStatusChange,
    db: Session = Depends(get_db),
    admin=Depends(require_role("ADMIN", "LAWYER")),
):
    request_uuid = _request_uuid_or_400(request_id)
    req = db.get(Request, request_uuid)
    if not req:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    _ensure_lawyer_can_manage_request_or_403(admin, req)

    next_status = str(payload.status_code or "").strip()
    if not next_status:
        raise HTTPException(status_code=400, detail='Поле "status_code" обязательно')

    status_row = db.query(Status).filter(Status.code == next_status, Status.enabled.is_(True)).first()
    if status_row is None:
        raise HTTPException(status_code=400, detail="Указан несуществующий или неактивный статус")

    old_status = str(req.status_code or "").strip()
    if old_status == next_status:
        raise HTTPException(status_code=400, detail="Выберите новый статус")

    important_date_at = _normalize_important_date_or_default(payload.important_date_at)
    comment = str(payload.comment or "").strip() or None
    responsible = str(admin.get("email") or "").strip() or "Администратор системы"

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


@router.get("/{request_id}/status-route")
def get_request_status_route(
    request_id: str,
    db: Session = Depends(get_db),
    admin=Depends(require_role("ADMIN", "LAWYER")),
):
    request_uuid = _request_uuid_or_400(request_id)
    req = db.get(Request, request_uuid)
    if not req:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    _ensure_lawyer_can_view_request_or_403(admin, req)

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
    statuses_map: dict[str, dict[str, str]] = {}
    all_enabled_status_rows = db.query(Status, StatusGroup).outerjoin(StatusGroup, StatusGroup.id == Status.status_group_id).filter(Status.enabled.is_(True)).all()
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
        current_at = item.get("created_at")
        next_at = timeline[index + 1].get("created_at") if index + 1 < len(timeline) else datetime.now(timezone.utc)
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
                "important_date_at": item.get("important_date_at").isoformat() if isinstance(item.get("important_date_at"), datetime) else None,
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


@router.post("/{request_id}/claim")
def claim_request(request_id: str, db: Session = Depends(get_db), admin=Depends(require_role("LAWYER"))):
    request_uuid = _request_uuid_or_400(request_id)

    lawyer_sub = str(admin.get("sub") or "").strip()
    if not lawyer_sub:
        raise HTTPException(status_code=401, detail="Некорректный токен")
    try:
        lawyer_uuid = UUID(lawyer_sub)
    except ValueError:
        raise HTTPException(status_code=401, detail="Некорректный токен")

    lawyer = db.get(AdminUser, lawyer_uuid)
    if not lawyer or str(lawyer.role or "").upper() != "LAWYER" or not bool(lawyer.is_active):
        raise HTTPException(status_code=403, detail="Доступно только активному юристу")

    now = datetime.now(timezone.utc)
    responsible = str(admin.get("email") or "").strip() or "Администратор системы"

    stmt = (
        update(Request)
        .where(Request.id == request_uuid, Request.assigned_lawyer_id.is_(None))
        .values(
            assigned_lawyer_id=str(lawyer_uuid),
            effective_rate=case((Request.effective_rate.is_(None), lawyer.default_rate), else_=Request.effective_rate),
            updated_at=now,
            responsible=responsible,
        )
    )

    try:
        updated_rows = db.execute(stmt).rowcount or 0
        if updated_rows == 0:
            existing = db.get(Request, request_uuid)
            if existing is None:
                db.rollback()
                raise HTTPException(status_code=404, detail="Заявка не найдена")
            db.rollback()
            raise HTTPException(status_code=409, detail="Заявка уже назначена")

        db.add(
            AuditLog(
                actor_admin_id=lawyer_uuid,
                entity="requests",
                entity_id=str(request_uuid),
                action="MANUAL_CLAIM",
                diff={"assigned_lawyer_id": str(lawyer_uuid)},
            )
        )
        db.commit()
    except HTTPException:
        raise
    except Exception:
        db.rollback()
        raise

    row = db.get(Request, request_uuid)
    if row is None:
        raise HTTPException(status_code=404, detail="Заявка не найдена")

    return {
        "status": "claimed",
        "id": str(row.id),
        "track_number": row.track_number,
        "assigned_lawyer_id": row.assigned_lawyer_id,
    }


@router.post("/{request_id}/reassign")
def reassign_request(
    request_id: str,
    payload: RequestReassign,
    db: Session = Depends(get_db),
    admin=Depends(require_role("ADMIN")),
):
    request_uuid = _request_uuid_or_400(request_id)

    try:
        lawyer_uuid = UUID(str(payload.lawyer_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Некорректный идентификатор юриста")

    target_lawyer = db.get(AdminUser, lawyer_uuid)
    if not target_lawyer or str(target_lawyer.role or "").upper() != "LAWYER" or not bool(target_lawyer.is_active):
        raise HTTPException(status_code=400, detail="Можно переназначить только на активного юриста")

    req = db.get(Request, request_uuid)
    if req is None:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    if req.assigned_lawyer_id is None:
        raise HTTPException(status_code=400, detail="Заявка не назначена")
    if str(req.assigned_lawyer_id) == str(lawyer_uuid):
        raise HTTPException(status_code=400, detail="Заявка уже назначена на выбранного юриста")

    old_assigned = str(req.assigned_lawyer_id)
    now = datetime.now(timezone.utc)
    responsible = str(admin.get("email") or "").strip() or "Администратор системы"
    admin_actor_id = None
    try:
        admin_actor_id = UUID(str(admin.get("sub") or ""))
    except ValueError:
        admin_actor_id = None

    stmt = (
        update(Request)
        .where(Request.id == request_uuid, Request.assigned_lawyer_id == old_assigned)
        .values(
            assigned_lawyer_id=str(lawyer_uuid),
            effective_rate=case((Request.effective_rate.is_(None), target_lawyer.default_rate), else_=Request.effective_rate),
            updated_at=now,
            responsible=responsible,
        )
    )

    try:
        updated_rows = db.execute(stmt).rowcount or 0
        if updated_rows == 0:
            db.rollback()
            raise HTTPException(status_code=409, detail="Заявка уже была переназначена")

        db.add(
            AuditLog(
                actor_admin_id=admin_actor_id,
                entity="requests",
                entity_id=str(request_uuid),
                action="MANUAL_REASSIGN",
                diff={"from_lawyer_id": old_assigned, "to_lawyer_id": str(lawyer_uuid)},
            )
        )
        db.commit()
    except HTTPException:
        raise
    except Exception:
        db.rollback()
        raise

    row = db.get(Request, request_uuid)
    if row is None:
        raise HTTPException(status_code=404, detail="Заявка не найдена")

    return {
        "status": "reassigned",
        "id": str(row.id),
        "track_number": row.track_number,
        "from_lawyer_id": old_assigned,
        "assigned_lawyer_id": row.assigned_lawyer_id,
    }


@router.get("/{request_id}/data-template")
def get_request_data_template(
    request_id: str,
    db: Session = Depends(get_db),
    admin=Depends(require_role("ADMIN", "LAWYER")),
):
    request_uuid = _request_uuid_or_400(request_id)
    req = db.get(Request, request_uuid)
    if req is None:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    _ensure_lawyer_can_manage_request_or_403(admin, req)

    topic_items = (
        db.query(TopicDataTemplate)
        .filter(
            TopicDataTemplate.topic_code == str(req.topic_code or ""),
            TopicDataTemplate.enabled.is_(True),
        )
        .order_by(TopicDataTemplate.sort_order.asc(), TopicDataTemplate.key.asc())
        .all()
    )
    request_items = (
        db.query(RequestDataRequirement)
        .filter(RequestDataRequirement.request_id == req.id)
        .order_by(RequestDataRequirement.created_at.asc(), RequestDataRequirement.key.asc())
        .all()
    )
    return {
        "request_id": str(req.id),
        "topic_code": req.topic_code,
        "topic_items": [
            {
                "id": str(row.id),
                "key": row.key,
                "label": row.label,
                "description": row.description,
                "required": bool(row.required),
                "sort_order": row.sort_order,
            }
            for row in topic_items
        ],
        "request_items": [_request_data_requirement_row(row) for row in request_items],
    }


@router.post("/{request_id}/data-template/sync")
def sync_request_data_template_from_topic(
    request_id: str,
    db: Session = Depends(get_db),
    admin=Depends(require_role("ADMIN", "LAWYER")),
):
    request_uuid = _request_uuid_or_400(request_id)
    req = db.get(Request, request_uuid)
    if req is None:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    _ensure_lawyer_can_manage_request_or_403(admin, req)
    topic_code = str(req.topic_code or "").strip()
    if not topic_code:
        return {"status": "ok", "created": 0, "request_id": str(req.id)}

    topic_items = (
        db.query(TopicDataTemplate)
        .filter(
            TopicDataTemplate.topic_code == topic_code,
            TopicDataTemplate.enabled.is_(True),
        )
        .order_by(TopicDataTemplate.sort_order.asc(), TopicDataTemplate.key.asc())
        .all()
    )
    existing_keys = {
        str(key).strip()
        for (key,) in db.query(RequestDataRequirement.key).filter(RequestDataRequirement.request_id == req.id).all()
        if key
    }
    responsible = str(admin.get("email") or "").strip() or "Администратор системы"
    actor_id = actor_admin_uuid(admin)

    created = 0
    for template in topic_items:
        key = str(template.key or "").strip()
        if not key or key in existing_keys:
            continue
        db.add(
            RequestDataRequirement(
                request_id=req.id,
                topic_template_id=template.id,
                key=key,
                label=template.label,
                description=template.description,
                required=bool(template.required),
                created_by_admin_id=actor_id,
                responsible=responsible,
            )
        )
        existing_keys.add(key)
        created += 1

    db.commit()
    return {"status": "ok", "created": created, "request_id": str(req.id)}


@router.post("/{request_id}/data-template/items", status_code=201)
def create_request_data_requirement(
    request_id: str,
    payload: RequestDataRequirementCreate,
    db: Session = Depends(get_db),
    admin=Depends(require_role("ADMIN", "LAWYER")),
):
    request_uuid = _request_uuid_or_400(request_id)
    req = db.get(Request, request_uuid)
    if req is None:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    _ensure_lawyer_can_manage_request_or_403(admin, req)

    key = str(payload.key or "").strip()
    label = str(payload.label or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail='Поле "key" обязательно')
    if not label:
        raise HTTPException(status_code=400, detail='Поле "label" обязательно')

    exists = (
        db.query(RequestDataRequirement.id)
        .filter(RequestDataRequirement.request_id == req.id, RequestDataRequirement.key == key)
        .first()
    )
    if exists is not None:
        raise HTTPException(status_code=400, detail="Элемент с таким key уже существует в шаблоне заявки")

    row = RequestDataRequirement(
        request_id=req.id,
        topic_template_id=None,
        key=key,
        label=label,
        description=payload.description,
        required=bool(payload.required),
        created_by_admin_id=actor_admin_uuid(admin),
        responsible=str(admin.get("email") or "").strip() or "Администратор системы",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _request_data_requirement_row(row)


@router.patch("/{request_id}/data-template/items/{item_id}")
def update_request_data_requirement(
    request_id: str,
    item_id: str,
    payload: RequestDataRequirementPatch,
    db: Session = Depends(get_db),
    admin=Depends(require_role("ADMIN", "LAWYER")),
):
    request_uuid = _request_uuid_or_400(request_id)
    req = db.get(Request, request_uuid)
    if req is None:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    _ensure_lawyer_can_manage_request_or_403(admin, req)

    item_uuid = _request_uuid_or_400(item_id)
    row = db.get(RequestDataRequirement, item_uuid)
    if row is None or row.request_id != req.id:
        raise HTTPException(status_code=404, detail="Элемент шаблона заявки не найден")

    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="Нет полей для обновления")
    if "key" in changes:
        key = str(changes.get("key") or "").strip()
        if not key:
            raise HTTPException(status_code=400, detail='Поле "key" не может быть пустым')
        duplicate = (
            db.query(RequestDataRequirement.id)
            .filter(
                RequestDataRequirement.request_id == req.id,
                RequestDataRequirement.key == key,
                RequestDataRequirement.id != row.id,
            )
            .first()
        )
        if duplicate is not None:
            raise HTTPException(status_code=400, detail="Элемент с таким key уже существует в шаблоне заявки")
        row.key = key
    if "label" in changes:
        label = str(changes.get("label") or "").strip()
        if not label:
            raise HTTPException(status_code=400, detail='Поле "label" не может быть пустым')
        row.label = label
    if "description" in changes:
        row.description = changes.get("description")
    if "required" in changes:
        row.required = bool(changes.get("required"))
    row.responsible = str(admin.get("email") or "").strip() or "Администратор системы"

    db.add(row)
    db.commit()
    db.refresh(row)
    return _request_data_requirement_row(row)


@router.delete("/{request_id}/data-template/items/{item_id}")
def delete_request_data_requirement(
    request_id: str,
    item_id: str,
    db: Session = Depends(get_db),
    admin=Depends(require_role("ADMIN", "LAWYER")),
):
    request_uuid = _request_uuid_or_400(request_id)
    req = db.get(Request, request_uuid)
    if req is None:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    _ensure_lawyer_can_manage_request_or_403(admin, req)

    item_uuid = _request_uuid_or_400(item_id)
    row = db.get(RequestDataRequirement, item_uuid)
    if row is None or row.request_id != req.id:
        raise HTTPException(status_code=404, detail="Элемент шаблона заявки не найден")
    db.delete(row)
    db.commit()
    return {"status": "удалено", "id": str(row.id)}
