from __future__ import annotations

from datetime import datetime, timedelta, timezone

INITIAL_REQUEST_SLA_HOURS = 24


def initial_important_date_at(*, now: datetime | None = None) -> datetime:
    base = now or datetime.now(timezone.utc)
    if base.tzinfo is None:
        base = base.replace(tzinfo=timezone.utc)
    else:
        base = base.astimezone(timezone.utc)
    return base + timedelta(hours=INITIAL_REQUEST_SLA_HOURS)
