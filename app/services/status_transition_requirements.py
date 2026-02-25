from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.attachment import Attachment
from app.models.request import Request
from app.models.topic_status_transition import TopicStatusTransition


def normalize_string_list(value: Any) -> list[str]:
    if not isinstance(value, (list, tuple, set)):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in value:
        text = str(item or "").strip()
        if not text:
            continue
        lowered = text.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        out.append(text)
    return out


def _is_missing_value(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return not value.strip()
    if isinstance(value, (list, tuple, dict, set)):
        return len(value) == 0
    return False


def _find_transition_rule(
    db: Session,
    topic_code: str | None,
    from_status: str,
    to_status: str,
) -> TopicStatusTransition | None:
    topic = str(topic_code or "").strip()
    from_code = str(from_status or "").strip()
    to_code = str(to_status or "").strip()
    if not topic or not from_code or not to_code or from_code == to_code:
        return None
    return (
        db.query(TopicStatusTransition)
        .filter(
            TopicStatusTransition.topic_code == topic,
            TopicStatusTransition.from_status == from_code,
            TopicStatusTransition.to_status == to_code,
            TopicStatusTransition.enabled.is_(True),
        )
        .order_by(TopicStatusTransition.sort_order.asc(), TopicStatusTransition.created_at.asc())
        .first()
    )


def _mime_matches(requirement: str, value: str) -> bool:
    required = str(requirement or "").strip().lower()
    actual = str(value or "").strip().lower()
    if not required or not actual:
        return False
    if required.endswith("/*"):
        return actual.startswith(required[:-1])
    return actual == required


def validate_transition_requirements_or_400(
    db: Session,
    req: Request,
    from_status: str,
    to_status: str,
    *,
    extra_fields_override: dict[str, Any] | None = None,
) -> None:
    transition = _find_transition_rule(
        db,
        topic_code=str(req.topic_code or "").strip() or None,
        from_status=from_status,
        to_status=to_status,
    )
    if transition is None:
        return

    required_data_keys = normalize_string_list(transition.required_data_keys)
    required_mime_types = normalize_string_list(transition.required_mime_types)
    if not required_data_keys and not required_mime_types:
        return

    payload = extra_fields_override if isinstance(extra_fields_override, dict) else req.extra_fields
    if not isinstance(payload, dict):
        payload = {}
    missing_data_keys = [key for key in required_data_keys if _is_missing_value(payload.get(key))]

    available_mime_types = [
        str(mime_type or "").strip().lower()
        for (mime_type,) in db.query(Attachment.mime_type).filter(Attachment.request_id == req.id).all()
        if str(mime_type or "").strip()
    ]
    missing_mime_types: list[str] = []
    for required in required_mime_types:
        if any(_mime_matches(required, mime) for mime in available_mime_types):
            continue
        missing_mime_types.append(required)

    if not missing_data_keys and not missing_mime_types:
        return

    parts: list[str] = []
    if missing_data_keys:
        parts.append("обязательные данные: " + ", ".join(missing_data_keys))
    if missing_mime_types:
        parts.append("обязательные файлы: " + ", ".join(missing_mime_types))
    raise HTTPException(status_code=400, detail="Переход требует заполнения шага: " + "; ".join(parts))
