from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import require_role
from app.db.session import get_db
from app.models.admin_user import AdminUser
from app.models.request import Request
from app.services.chat_service import create_admin_or_lawyer_message, list_messages_for_request, serialize_message

router = APIRouter()


def _request_uuid_or_400(request_id: str) -> UUID:
    try:
        return UUID(str(request_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Некорректный идентификатор заявки")


def _request_for_id_or_404(db: Session, request_id: str) -> Request:
    req = db.get(Request, _request_uuid_or_400(request_id))
    if req is None:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    return req


def _ensure_lawyer_can_view_request_or_403(admin: dict, req: Request) -> None:
    role = str(admin.get("role") or "").upper()
    if role != "LAWYER":
        return
    actor = str(admin.get("sub") or "").strip()
    if not actor:
        raise HTTPException(status_code=401, detail="Некорректный токен")
    assigned = str(req.assigned_lawyer_id or "").strip()
    if assigned and actor != assigned:
        raise HTTPException(status_code=403, detail="Юрист может видеть только свои и неназначенные заявки")


def _ensure_lawyer_can_manage_request_or_403(admin: dict, req: Request) -> None:
    role = str(admin.get("role") or "").upper()
    if role != "LAWYER":
        return
    actor = str(admin.get("sub") or "").strip()
    if not actor:
        raise HTTPException(status_code=401, detail="Некорректный токен")
    assigned = str(req.assigned_lawyer_id or "").strip()
    if not assigned or actor != assigned:
        raise HTTPException(status_code=403, detail="Юрист может работать только со своими назначенными заявками")


@router.get("/requests/{request_id}/messages")
def list_request_messages(
    request_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_role("ADMIN", "LAWYER")),
):
    req = _request_for_id_or_404(db, request_id)
    _ensure_lawyer_can_view_request_or_403(admin, req)
    rows = list_messages_for_request(db, req.id)
    return {"rows": [serialize_message(row) for row in rows], "total": len(rows)}


@router.post("/requests/{request_id}/messages", status_code=201)
def create_request_message(
    request_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_role("ADMIN", "LAWYER")),
):
    req = _request_for_id_or_404(db, request_id)
    _ensure_lawyer_can_manage_request_or_403(admin, req)
    body = str((payload or {}).get("body") or "").strip()
    role = str(admin.get("role") or "").upper()
    actor_name = str(admin.get("email") or "").strip() or ("Юрист" if role == "LAWYER" else "Администратор")
    actor_admin_user_id = str(admin.get("sub") or "").strip() or None
    if actor_admin_user_id:
        try:
            actor_uuid = UUID(actor_admin_user_id)
        except ValueError:
            actor_uuid = None
        if actor_uuid is not None:
            actor_user = db.get(AdminUser, actor_uuid)
            if actor_user is not None:
                actor_name = str(actor_user.name or actor_user.email or actor_name)
    row = create_admin_or_lawyer_message(
        db,
        request=req,
        body=body,
        actor_role=role,
        actor_name=actor_name,
        actor_admin_user_id=actor_admin_user_id,
    )
    return serialize_message(row)
