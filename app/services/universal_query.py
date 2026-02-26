import uuid
from datetime import date, datetime, timezone
from datetime import timedelta
from decimal import Decimal, InvalidOperation

from fastapi import HTTPException
from sqlalchemy import asc, desc
from sqlalchemy.orm import Query

from app.schemas.universal import UniversalQuery


def _bad_filter_value(column_key: str, kind: str) -> HTTPException:
    return HTTPException(status_code=400, detail=f'Некорректное значение фильтра для поля "{column_key}" ({kind})')


def _coerce_bool_filter_value(column_key: str, value):
    if isinstance(value, bool):
        return value
    text = str(value or "").strip().lower()
    if text in {"1", "true", "yes", "y", "да"}:
        return True
    if text in {"0", "false", "no", "n", "нет"}:
        return False
    raise _bad_filter_value(column_key, "boolean")


def _coerce_number_filter_value(column_key: str, value, python_type):
    if value is None:
        return None
    if python_type in {int, float} and isinstance(value, (int, float)):
        return python_type(value)
    if python_type is Decimal and isinstance(value, Decimal):
        return value
    text = str(value).strip()
    if not text:
        raise _bad_filter_value(column_key, "number")
    normalized = text.replace(",", ".")
    try:
        if python_type is int:
            return int(normalized)
        if python_type is float:
            return float(normalized)
        if python_type is Decimal:
            return Decimal(normalized)
        return python_type(normalized)
    except (ValueError, TypeError, InvalidOperation):
        raise _bad_filter_value(column_key, "number")


def _coerce_date_filter_value(column_key: str, value):
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    text = str(value or "").strip()
    if not text:
        raise _bad_filter_value(column_key, "date")
    try:
        # Accept either YYYY-MM-DD or full ISO datetime and take its date part.
        if "T" in text or " " in text:
            return datetime.fromisoformat(text.replace("Z", "+00:00")).date()
        return date.fromisoformat(text)
    except ValueError:
        raise _bad_filter_value(column_key, "date")


def _coerce_datetime_filter_value(column_key: str, value):
    if isinstance(value, datetime):
        parsed = value
    else:
        text = str(value or "").strip()
        if not text:
            raise _bad_filter_value(column_key, "datetime")
        try:
            if "T" not in text and " " not in text and len(text) == 10:
                # Date-only filter value for timestamp columns -> start of the day.
                parsed = datetime.combine(date.fromisoformat(text), datetime.min.time())
            else:
                parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError:
            raise _bad_filter_value(column_key, "datetime")
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _coerce_filter_value(column, value):
    try:
        python_type = column.property.columns[0].type.python_type
    except Exception:
        return value
    if python_type is uuid.UUID:
        if isinstance(value, uuid.UUID):
            return value
        try:
            return uuid.UUID(str(value or "").strip())
        except ValueError:
            raise HTTPException(status_code=400, detail=f'Некорректный UUID в фильтре поля "{column.key}"')
    if python_type is bool:
        return _coerce_bool_filter_value(column.key, value)
    if python_type in {int, float, Decimal}:
        return _coerce_number_filter_value(column.key, value, python_type)
    if python_type is date:
        return _coerce_date_filter_value(column.key, value)
    if python_type is datetime:
        return _coerce_datetime_filter_value(column.key, value)
    return value


def _column_python_type(column):
    try:
        return column.property.columns[0].type.python_type
    except Exception:
        return None


def _is_date_only_filter_literal(raw_value) -> bool:
    if isinstance(raw_value, date) and not isinstance(raw_value, datetime):
        return True
    if not isinstance(raw_value, str):
        return False
    text = raw_value.strip()
    if not text or "T" in text or " " in text:
        return False
    try:
        date.fromisoformat(text)
        return True
    except ValueError:
        return False


def apply_universal_query(q: Query, model, uq: UniversalQuery) -> Query:
    for f in uq.filters:
        col = getattr(model, f.field, None)
        if col is None:
            continue
        col_python_type = _column_python_type(col)
        value = _coerce_filter_value(col, f.value)
        if col_python_type is datetime and f.op in {"=", "!="} and _is_date_only_filter_literal(f.value):
            day_start = value
            day_end = day_start + timedelta(days=1)
            day_expr = (col >= day_start) & (col < day_end)
            q = q.filter(day_expr if f.op == "=" else ~day_expr)
            continue
        if f.op == "=":
            q = q.filter(col == value)
        elif f.op == "!=":
            q = q.filter(col != value)
        elif f.op == ">":
            q = q.filter(col > value)
        elif f.op == "<":
            q = q.filter(col < value)
        elif f.op == ">=":
            q = q.filter(col >= value)
        elif f.op == "<=":
            q = q.filter(col <= value)
        elif f.op == "~":
            q = q.filter(col.ilike(f"%{value}%"))
    for s in uq.sort:
        col = getattr(model, s.field, None)
        if col is None:
            continue
        q = q.order_by(asc(col) if s.dir == "asc" else desc(col))
    return q
