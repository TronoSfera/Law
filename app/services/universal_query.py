from sqlalchemy.orm import Query
from sqlalchemy import asc, desc
from app.schemas.universal import UniversalQuery

def apply_universal_query(q: Query, model, uq: UniversalQuery) -> Query:
    for f in uq.filters:
        col = getattr(model, f.field, None)
        if col is None:
            continue
        if f.op == "=":
            q = q.filter(col == f.value)
        elif f.op == "!=":
            q = q.filter(col != f.value)
        elif f.op == ">":
            q = q.filter(col > f.value)
        elif f.op == "<":
            q = q.filter(col < f.value)
        elif f.op == ">=":
            q = q.filter(col >= f.value)
        elif f.op == "<=":
            q = q.filter(col <= f.value)
        elif f.op == "~":
            q = q.filter(col.ilike(f"%{f.value}%"))
    for s in uq.sort:
        col = getattr(model, s.field, None)
        if col is None:
            continue
        q = q.order_by(asc(col) if s.dir == "asc" else desc(col))
    return q
