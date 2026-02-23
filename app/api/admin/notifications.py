from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.deps import require_role
from app.db.session import get_db
from app.schemas.admin import NotificationsReadAll
from app.services.notifications import (
    get_admin_notification,
    list_admin_notifications,
    mark_admin_notifications_read,
    serialize_notification,
)

router = APIRouter()


def _actor_uuid_or_401(admin: dict) -> uuid.UUID:
    try:
        return uuid.UUID(str(admin.get("sub") or ""))
    except ValueError:
        raise HTTPException(status_code=401, detail="Некорректный токен")


def _optional_uuid_or_400(raw: str | None, field_name: str) -> uuid.UUID | None:
    if raw is None:
        return None
    value = str(raw).strip()
    if not value:
        return None
    try:
        return uuid.UUID(value)
    except ValueError:
        raise HTTPException(status_code=400, detail=f'Некорректный "{field_name}"')


@router.get("")
def list_notifications(
    unread_only: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    request_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
    admin: dict = Depends(require_role("ADMIN", "LAWYER")),
):
    actor_id = _actor_uuid_or_401(admin)
    request_uuid = _optional_uuid_or_400(request_id, "request_id")
    rows, total = list_admin_notifications(
        db,
        admin_user_id=actor_id,
        unread_only=unread_only,
        request_id=request_uuid,
        limit=limit,
        offset=offset,
    )
    _, unread_total = list_admin_notifications(
        db,
        admin_user_id=actor_id,
        unread_only=True,
        request_id=request_uuid,
        limit=1,
        offset=0,
    )
    return {
        "rows": [serialize_notification(row) for row in rows],
        "total": total,
        "unread_total": int(unread_total),
    }


@router.post("/{notification_id}/read")
def read_single_notification(
    notification_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_role("ADMIN", "LAWYER")),
):
    actor_id = _actor_uuid_or_401(admin)
    try:
        notification_uuid = uuid.UUID(str(notification_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Некорректный notification_id")

    row = get_admin_notification(db, admin_user_id=actor_id, notification_id=notification_uuid)
    if row is None:
        raise HTTPException(status_code=404, detail="Уведомление не найдено")

    changed = mark_admin_notifications_read(
        db,
        admin_user_id=actor_id,
        notification_id=notification_uuid,
        responsible=str(admin.get("email") or "").strip() or "Администратор системы",
    )
    db.commit()
    refreshed = get_admin_notification(db, admin_user_id=actor_id, notification_id=notification_uuid)
    return {
        "status": "ok",
        "changed": int(changed),
        "notification": serialize_notification(refreshed) if refreshed else None,
    }


@router.post("/read-all")
def read_all_notifications(
    payload: NotificationsReadAll,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_role("ADMIN", "LAWYER")),
):
    actor_id = _actor_uuid_or_401(admin)
    request_uuid = _optional_uuid_or_400(payload.request_id, "request_id")
    changed = mark_admin_notifications_read(
        db,
        admin_user_id=actor_id,
        request_id=request_uuid,
        responsible=str(admin.get("email") or "").strip() or "Администратор системы",
    )
    db.commit()
    return {"status": "ok", "changed": int(changed)}
