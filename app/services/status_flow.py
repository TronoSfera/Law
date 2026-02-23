from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.topic_status_transition import TopicStatusTransition


def transition_allowed_for_topic(
    db: Session,
    topic_code: str | None,
    from_status: str,
    to_status: str,
) -> bool:
    from_code = str(from_status or "").strip()
    to_code = str(to_status or "").strip()
    if not from_code or not to_code:
        return False
    if from_code == to_code:
        return True

    topic = str(topic_code or "").strip()
    if not topic:
        return True

    has_any_rules = (
        db.query(TopicStatusTransition.id)
        .filter(
            TopicStatusTransition.topic_code == topic,
            TopicStatusTransition.enabled.is_(True),
        )
        .first()
    )
    if has_any_rules is None:
        return True

    matched = (
        db.query(TopicStatusTransition.id)
        .filter(
            TopicStatusTransition.topic_code == topic,
            TopicStatusTransition.from_status == from_code,
            TopicStatusTransition.to_status == to_code,
            TopicStatusTransition.enabled.is_(True),
        )
        .first()
    )
    return matched is not None
