from __future__ import annotations

import uuid
from typing import Tuple

from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, HTTPException, Query, Request as FastapiRequest
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import require_role
from app.core.security import decode_jwt
from app.db.session import get_db
from app.models.admin_user import AdminUser
from app.models.attachment import Attachment
from app.models.message import Message
from app.models.request import Request
from app.schemas.uploads import UploadCompletePayload, UploadCompleteResponse, UploadInitPayload, UploadInitResponse, UploadScope
from app.services.notifications import EVENT_ATTACHMENT as NOTIFICATION_EVENT_ATTACHMENT, notify_request_event
from app.services.request_read_markers import EVENT_ATTACHMENT, mark_unread_for_client
from app.services.security_audit import record_file_security_event
from app.services.s3_storage import build_object_key, get_s3_storage

router = APIRouter()


def _max_file_bytes() -> int:
    return int(settings.MAX_FILE_MB) * 1024 * 1024


def _max_case_bytes() -> int:
    return int(settings.MAX_CASE_MB) * 1024 * 1024


def _validate_size_or_400(size_bytes: int) -> None:
    if int(size_bytes or 0) <= 0:
        raise HTTPException(status_code=400, detail="Некорректный размер файла")
    if int(size_bytes) > _max_file_bytes():
        raise HTTPException(status_code=400, detail=f"Превышен лимит файла ({settings.MAX_FILE_MB} МБ)")


def _uuid_or_400(raw: str | None, field_name: str) -> uuid.UUID:
    if not raw:
        raise HTTPException(status_code=400, detail=f'Поле "{field_name}" обязательно')
    try:
        return uuid.UUID(str(raw))
    except ValueError:
        raise HTTPException(status_code=400, detail=f'Некорректный "{field_name}"')


def _ensure_case_capacity_or_400(request: Request, add_bytes: int) -> None:
    current = int(request.total_attachments_bytes or 0)
    if current + int(add_bytes) > _max_case_bytes():
        raise HTTPException(status_code=400, detail=f"Превышен лимит вложений заявки ({settings.MAX_CASE_MB} МБ)")


def _ensure_object_key_prefix_or_400(key: str, prefix: str) -> None:
    if not str(key or "").startswith(prefix):
        raise HTTPException(status_code=400, detail="Некорректный ключ объекта для выбранной сущности")


def _parse_scoped_object_key(key: str) -> Tuple[str, str]:
    raw = str(key or "").strip()
    if not raw or "/" not in raw:
        return "", ""
    first = raw.split("/", 1)[0].strip().lower()
    parts = raw.split("/")
    if len(parts) < 3:
        return first, ""
    return first, parts[1].strip()


def _uuid_or_none(raw: str) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(raw))
    except (TypeError, ValueError):
        return None


def _client_ip(http_request: FastapiRequest) -> str | None:
    if http_request is None:
        return None
    forwarded = str(http_request.headers.get("x-forwarded-for") or "").strip()
    if forwarded:
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    if http_request.client and http_request.client.host:
        return str(http_request.client.host)
    return None


@router.post("/init", response_model=UploadInitResponse)
def upload_init(
    payload: UploadInitPayload,
    http_request: FastapiRequest,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_role("ADMIN", "LAWYER")),
):
    role = str(admin.get("role") or "").upper() or "UNKNOWN"
    actor_id = str(admin.get("sub") or "").strip()
    actor_ip = _client_ip(http_request)
    responsible = str(admin.get("email") or "").strip() or "Администратор системы"
    scope_name = str(payload.scope.value if hasattr(payload.scope, "value") else payload.scope)

    try:
        _validate_size_or_400(payload.size_bytes)
        storage = get_s3_storage()

        if payload.scope == UploadScope.REQUEST_ATTACHMENT:
            request_uuid = _uuid_or_400(payload.request_id, "request_id")
            request = db.get(Request, request_uuid)
            if request is None:
                raise HTTPException(status_code=404, detail="Заявка не найдена")
            _ensure_case_capacity_or_400(request, payload.size_bytes)
            key = build_object_key(f"requests/{request.id}", payload.file_name)
            response = UploadInitResponse(key=key, presigned_url=storage.create_presigned_put_url(key, payload.mime_type))
            record_file_security_event(
                db,
                actor_role=role,
                actor_subject=actor_id,
                actor_ip=actor_ip,
                action="UPLOAD_INIT",
                scope=scope_name,
                allowed=True,
                object_key=key,
                request_id=request.id,
                details={"mime_type": payload.mime_type, "size_bytes": int(payload.size_bytes or 0)},
                responsible=responsible,
                persist_now=True,
            )
            return response

        if payload.scope == UploadScope.USER_AVATAR:
            target_user_id = str(payload.user_id or actor_id)
            target_uuid = _uuid_or_400(target_user_id, "user_id")
            if role != "ADMIN" and str(target_uuid) != actor_id:
                raise HTTPException(status_code=403, detail="Недостаточно прав для загрузки аватара")
            user = db.get(AdminUser, target_uuid)
            if user is None:
                raise HTTPException(status_code=404, detail="Пользователь не найден")
            key = build_object_key(f"avatars/{user.id}", payload.file_name)
            response = UploadInitResponse(key=key, presigned_url=storage.create_presigned_put_url(key, payload.mime_type))
            record_file_security_event(
                db,
                actor_role=role,
                actor_subject=actor_id,
                actor_ip=actor_ip,
                action="UPLOAD_INIT",
                scope=scope_name,
                allowed=True,
                object_key=key,
                details={"mime_type": payload.mime_type, "size_bytes": int(payload.size_bytes or 0)},
                responsible=responsible,
                persist_now=True,
            )
            return response

        raise HTTPException(status_code=400, detail="Неподдерживаемый scope")
    except HTTPException as exc:
        record_file_security_event(
            db,
            actor_role=role,
            actor_subject=actor_id,
            actor_ip=actor_ip,
            action="UPLOAD_INIT",
            scope=scope_name,
            allowed=False,
            reason=str(exc.detail),
            request_id=_uuid_or_none(payload.request_id),
            details={"mime_type": payload.mime_type, "size_bytes": int(payload.size_bytes or 0)},
            responsible=responsible,
            persist_now=True,
        )
        raise


@router.post("/complete", response_model=UploadCompleteResponse)
def upload_complete(
    payload: UploadCompletePayload,
    http_request: FastapiRequest,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_role("ADMIN", "LAWYER")),
):
    role = str(admin.get("role") or "").upper() or "UNKNOWN"
    actor_id = str(admin.get("sub") or "")
    actor_ip = _client_ip(http_request)
    responsible = str(admin.get("email") or "").strip() or "Администратор системы"
    scope_name = str(payload.scope.value if hasattr(payload.scope, "value") else payload.scope)

    try:
        _validate_size_or_400(payload.size_bytes)
        storage = get_s3_storage()
        try:
            head = storage.head_object(payload.key)
        except ClientError:
            raise HTTPException(status_code=400, detail="Файл не найден в хранилище")

        actual_size = int(head.get("ContentLength") or payload.size_bytes)
        if actual_size <= 0:
            raise HTTPException(status_code=400, detail="Некорректный размер файла")
        if actual_size > _max_file_bytes():
            raise HTTPException(status_code=400, detail=f"Превышен лимит файла ({settings.MAX_FILE_MB} МБ)")

        if payload.scope == UploadScope.REQUEST_ATTACHMENT:
            request_uuid = _uuid_or_400(payload.request_id, "request_id")
            request = db.get(Request, request_uuid)
            if request is None:
                raise HTTPException(status_code=404, detail="Заявка не найдена")
            _ensure_object_key_prefix_or_400(payload.key, f"requests/{request.id}/")
            _ensure_case_capacity_or_400(request, actual_size)

            message_uuid = None
            if payload.message_id:
                message_uuid = _uuid_or_400(payload.message_id, "message_id")
                message = db.get(Message, message_uuid)
                if message is None or message.request_id != request.id:
                    raise HTTPException(status_code=400, detail="Сообщение не найдено для указанной заявки")
                if bool(message.immutable):
                    raise HTTPException(status_code=400, detail="Нельзя прикрепить файл к зафиксированному сообщению")

            row = Attachment(
                request_id=request.id,
                message_id=message_uuid,
                file_name=payload.file_name,
                mime_type=payload.mime_type,
                size_bytes=actual_size,
                s3_key=payload.key,
                responsible=responsible,
            )
            mark_unread_for_client(request, EVENT_ATTACHMENT)
            notify_request_event(
                db,
                request=request,
                event_type=NOTIFICATION_EVENT_ATTACHMENT,
                actor_role=str(admin.get("role") or "").upper() or "ADMIN",
                actor_admin_user_id=admin.get("sub"),
                body=f'Файл: {payload.file_name}',
                responsible=responsible,
            )
            request.total_attachments_bytes = int(request.total_attachments_bytes or 0) + actual_size
            request.responsible = responsible
            db.add(row)
            db.add(request)
            record_file_security_event(
                db,
                actor_role=role,
                actor_subject=actor_id,
                actor_ip=actor_ip,
                action="UPLOAD_COMPLETE",
                scope=scope_name,
                allowed=True,
                object_key=payload.key,
                request_id=request.id,
                details={"mime_type": payload.mime_type, "size_bytes": int(actual_size)},
                responsible=responsible,
            )
            db.commit()
            db.refresh(row)
            return UploadCompleteResponse(status="ok", attachment_id=str(row.id))

        if payload.scope == UploadScope.USER_AVATAR:
            target_user_id = str(payload.user_id or actor_id)
            target_uuid = _uuid_or_400(target_user_id, "user_id")
            if role != "ADMIN" and str(target_uuid) != actor_id:
                raise HTTPException(status_code=403, detail="Недостаточно прав для загрузки аватара")
            user = db.get(AdminUser, target_uuid)
            if user is None:
                raise HTTPException(status_code=404, detail="Пользователь не найден")
            _ensure_object_key_prefix_or_400(payload.key, f"avatars/{user.id}/")
            user.avatar_url = f"s3://{payload.key}"
            user.responsible = responsible
            db.add(user)
            record_file_security_event(
                db,
                actor_role=role,
                actor_subject=actor_id,
                actor_ip=actor_ip,
                action="UPLOAD_COMPLETE",
                scope=scope_name,
                allowed=True,
                object_key=payload.key,
                details={"mime_type": payload.mime_type, "size_bytes": int(actual_size)},
                responsible=responsible,
            )
            db.commit()
            return UploadCompleteResponse(status="ok", avatar_url=user.avatar_url)

        raise HTTPException(status_code=400, detail="Неподдерживаемый scope")
    except HTTPException as exc:
        record_file_security_event(
            db,
            actor_role=role,
            actor_subject=actor_id,
            actor_ip=actor_ip,
            action="UPLOAD_COMPLETE",
            scope=scope_name,
            allowed=False,
            reason=str(exc.detail),
            object_key=payload.key,
            request_id=_uuid_or_none(payload.request_id),
            details={"mime_type": payload.mime_type, "size_bytes": int(payload.size_bytes or 0)},
            responsible=responsible,
            persist_now=True,
        )
        raise


@router.get("/object/{object_key:path}")
def get_object_proxy(
    object_key: str,
    http_request: FastapiRequest,
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    key = str(object_key or "").strip()
    scope = "UNKNOWN"
    scoped_uuid: uuid.UUID | None = None
    actor_role = "UNKNOWN"
    actor_subject = ""
    actor_ip = _client_ip(http_request)
    responsible = "Администратор системы"

    try:
        try:
            claims = decode_jwt(token, settings.ADMIN_JWT_SECRET)
        except Exception:
            raise HTTPException(status_code=401, detail="Некорректный токен")
        actor_role = str(claims.get("role") or "").upper()
        actor_subject = str(claims.get("sub") or "").strip()
        responsible = str(claims.get("email") or "").strip() or "Администратор системы"
        if actor_role not in {"ADMIN", "LAWYER"}:
            raise HTTPException(status_code=403, detail="Недостаточно прав")

        if not key:
            raise HTTPException(status_code=400, detail="Некорректный ключ объекта")

        scope, scoped_id_raw = _parse_scoped_object_key(key)
        scoped_uuid = _uuid_or_none(scoped_id_raw)
        if actor_role == "LAWYER":
            actor_id = _uuid_or_none(claims.get("sub"))
            if actor_id is None:
                raise HTTPException(status_code=401, detail="Некорректный токен")
            if scope == "avatars":
                if scoped_uuid is None or scoped_uuid != actor_id:
                    raise HTTPException(status_code=403, detail="Недостаточно прав")
            elif scope == "requests":
                if scoped_uuid is None:
                    raise HTTPException(status_code=403, detail="Недостаточно прав")
                # LAWYER can download files from own or unassigned requests only.
                request = db.get(Request, scoped_uuid)
                if request is None:
                    raise HTTPException(status_code=404, detail="Заявка не найдена")
                assigned = str(request.assigned_lawyer_id or "").strip()
                if assigned and assigned != str(actor_id):
                    raise HTTPException(status_code=403, detail="Недостаточно прав")
            else:
                raise HTTPException(status_code=403, detail="Недостаточно прав")

        try:
            obj = get_s3_storage().get_object(key)
        except ClientError:
            raise HTTPException(status_code=404, detail="Файл не найден")

        record_file_security_event(
            db,
            actor_role=actor_role,
            actor_subject=actor_subject,
            actor_ip=actor_ip,
            action="DOWNLOAD_OBJECT",
            scope=scope,
            allowed=True,
            object_key=key,
            request_id=scoped_uuid if scope == "requests" else None,
            details={},
            responsible=responsible,
            persist_now=True,
        )

        body = obj["Body"]
        content_length = obj.get("ContentLength")
        media_type = obj.get("ContentType") or "application/octet-stream"
        headers = {}
        if content_length is not None:
            headers["Content-Length"] = str(content_length)
        return StreamingResponse(body.iter_chunks(chunk_size=64 * 1024), media_type=media_type, headers=headers)
    except HTTPException as exc:
        record_file_security_event(
            db,
            actor_role=actor_role,
            actor_subject=actor_subject,
            actor_ip=actor_ip,
            action="DOWNLOAD_OBJECT",
            scope=scope,
            allowed=False,
            reason=str(exc.detail),
            object_key=key or None,
            request_id=scoped_uuid if scope == "requests" else None,
            details={},
            responsible=responsible,
            persist_now=True,
        )
        raise
