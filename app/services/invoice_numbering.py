from __future__ import annotations

import re
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.invoice import Invoice


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def generate_invoice_number(db: Session, issued_at: datetime | None = None) -> str:
    dt = issued_at or _now_utc()
    prefix = dt.strftime("%Y%m%d")
    pattern = re.compile(rf"^{re.escape(prefix)}(?:-(\d+))?$")

    rows = db.query(Invoice.invoice_number).filter(Invoice.invoice_number.like(f"{prefix}%")).all()
    max_order = 0
    has_base = False
    for (raw_number,) in rows:
        number = str(raw_number or "").strip()
        match = pattern.match(number)
        if not match:
            continue
        suffix = match.group(1)
        if not suffix:
            has_base = True
            max_order = max(max_order, 1)
            continue
        try:
            order = int(suffix)
        except ValueError:
            continue
        if order <= 1:
            order = 1
        max_order = max(max_order, order)

    if not has_base and max_order == 0:
        return prefix

    next_order = max(max_order, 1) + 1
    return f"{prefix}-{next_order}"

