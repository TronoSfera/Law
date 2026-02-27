from __future__ import annotations

from datetime import datetime, timedelta, timezone


def parse_datetime_safe(value: object) -> datetime | None:
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


def normalize_important_date_or_default(raw: object, *, default_days: int = 3) -> datetime:
    parsed = parse_datetime_safe(raw)
    if parsed:
        return parsed
    return datetime.now(timezone.utc) + timedelta(days=default_days)
