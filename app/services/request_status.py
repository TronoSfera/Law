from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.models.attachment import Attachment
from app.models.message import Message
from app.models.request import Request
from app.models.status_history import StatusHistory


def actor_admin_uuid(admin: dict[str, Any] | None) -> uuid.UUID | None:
    if not admin:
        return None
    raw = str(admin.get("sub") or "").strip()
    if not raw:
        return None
    try:
        return uuid.UUID(raw)
    except ValueError:
        return None


def freeze_request_messages_and_attachments(db: Session, request_id: uuid.UUID) -> None:
    db.query(Message).filter(Message.request_id == request_id, Message.immutable.is_(False)).update(
        {"immutable": True},
        synchronize_session=False,
    )
    db.query(Attachment).filter(Attachment.request_id == request_id, Attachment.immutable.is_(False)).update(
        {"immutable": True},
        synchronize_session=False,
    )


def register_status_history(
    db: Session,
    request: Request,
    from_status: str,
    to_status: str,
    *,
    admin: dict[str, Any] | None = None,
    comment: str | None = None,
    responsible: str = "Администратор системы",
) -> None:
    db.add(
        StatusHistory(
            request_id=request.id,
            from_status=str(from_status or "").strip() or None,
            to_status=str(to_status or "").strip(),
            changed_by_admin_id=actor_admin_uuid(admin),
            comment=comment,
            responsible=responsible,
        )
    )


def apply_status_change_effects(
    db: Session,
    request: Request,
    *,
    from_status: str,
    to_status: str,
    admin: dict[str, Any] | None = None,
    comment: str | None = None,
    responsible: str = "Администратор системы",
) -> None:
    old_code = str(from_status or "").strip()
    new_code = str(to_status or "").strip()
    if not new_code or old_code == new_code:
        return
    freeze_request_messages_and_attachments(db, request.id)
    register_status_history(
        db,
        request,
        old_code,
        new_code,
        admin=admin,
        comment=comment,
        responsible=responsible,
    )
