import uuid

from fastapi import HTTPException
from sqlalchemy.orm import Query
from sqlalchemy import asc, desc

from app.schemas.universal import UniversalQuery


def _coerce_filter_value(column, value):
    try:
        python_type = column.property.columns[0].type.python_type
    except Exception:
        return value
    if python_type is uuid.UUID and isinstance(value, str):
        try:
            return uuid.UUID(value)
        except ValueError:
            raise HTTPException(status_code=400, detail=f'Некорректный UUID в фильтре поля "{column.key}"')
    return value


def apply_universal_query(q: Query, model, uq: UniversalQuery) -> Query:
    for f in uq.filters:
        col = getattr(model, f.field, None)
        if col is None:
            continue
        value = _coerce_filter_value(col, f.value)
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
