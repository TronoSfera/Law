from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.topic_required_field import TopicRequiredField


def _is_missing_value(value) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return not value.strip()
    if isinstance(value, (list, tuple, dict, set)):
        return len(value) == 0
    return False


def validate_required_topic_fields_or_400(
    db: Session,
    topic_code: str | None,
    extra_fields: dict | None,
) -> None:
    topic = str(topic_code or "").strip()
    if not topic:
        return

    required_rows = (
        db.query(TopicRequiredField.field_key)
        .filter(
            TopicRequiredField.topic_code == topic,
            TopicRequiredField.enabled.is_(True),
            TopicRequiredField.required.is_(True),
        )
        .order_by(TopicRequiredField.sort_order.asc(), TopicRequiredField.field_key.asc())
        .all()
    )
    required_keys = [str(field_key).strip() for (field_key,) in required_rows if field_key]
    if not required_keys:
        return

    payload = extra_fields if isinstance(extra_fields, dict) else {}
    missing = [key for key in required_keys if _is_missing_value(payload.get(key))]
    if missing:
        raise HTTPException(
            status_code=400,
            detail="Для выбранной темы обязательны поля: " + ", ".join(missing),
        )
