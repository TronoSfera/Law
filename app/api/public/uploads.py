from __future__ import annotations

import uuid
from urllib.parse import quote

from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, HTTPException, Request as FastapiRequest
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_public_session
from app.db.session import get_db
from app.models.attachment import Attachment
from app.models.message import Message
from app.models.request import Request
from app.schemas.uploads import UploadCompletePayload, UploadCompleteResponse, UploadInitPayload, UploadInitResponse, UploadScope
from app.services.notifications import EVENT_ATTACHMENT as NOTIFICATION_EVENT_ATTACHMENT, notify_request_event
from app.services.request_read_markers import EVENT_ATTACHMENT, mark_unread_for_lawyer
from app.services.security_audit import record_file_security_event
from app.services.s3_storage import build_object_key, get_s3_storage

router = APIRouter()


def _max_file_bytes() -> int:
    return int(settings.MAX_FILE_MB) * 1024 * 1024


def _max_case_bytes() -> int:
    return int(settings.MAX_CASE_MB) * 1024 * 1024


def _uuid_or_400(raw: str | None, field_name: str) -> uuid.UUID:
    if not raw:
        raise HTTPException(status_code=400, detail=f'Поле "{field_name}" обязательно')
    try:
        return uuid.UUID(str(raw))
    except ValueError:
        raise HTTPException(status_code=400, detail=f'Некорректный "{field_name}"')


def _ensure_object_key_prefix_or_400(key: str, prefix: str) -> None:
    if not str(key or "").startswith(prefix):
        raise HTTPException(status_code=400, detail="Некорректный ключ объекта для выбранной заявки")


def _ensure_public_request_access_or_403(request: Request, session: dict) -> None:
    purpose = str(session.get("purpose") or "").strip().upper()
    if purpose != "VIEW_REQUEST":
        raise HTTPException(status_code=403, detail="Нет доступа к заявке")
    subject = str(session.get("sub") or "").strip()
    if not subject:
        raise HTTPException(status_code=403, detail="Нет доступа к заявке")

    normalized_track = str(subject).strip().upper()
    if normalized_track == str(request.track_number or "").strip().upper():
        return

    def _normalize_phone(value: str | None) -> str:
        raw = str(value or "").strip()
        allowed = {"+", "(", ")", "-", " "}
        return "".join(ch for ch in raw if ch.isdigit() or ch in allowed).strip()

    if _normalize_phone(subject) and _normalize_phone(subject) == _normalize_phone(request.client_phone):
        return
    raise HTTPException(status_code=403, detail="Нет доступа к заявке")


def _load_attachment_with_access_or_4xx(attachment_id: str, db: Session, session: dict) -> Attachment:
    attachment_uuid = _uuid_or_400(attachment_id, "attachment_id")
    attachment = db.get(Attachment, attachment_uuid)
    if attachment is None:
        raise HTTPException(status_code=404, detail="Файл не найден")
    request = db.get(Request, attachment.request_id)
    if request is None:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    _ensure_public_request_access_or_403(request, session)
    return attachment


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
    session: dict = Depends(get_public_session),
):
    actor_subject = str(session.get("sub") or "").strip()
    actor_ip = _client_ip(http_request)
    scope_name = str(payload.scope.value if hasattr(payload.scope, "value") else payload.scope)
    try:
        if payload.scope != UploadScope.REQUEST_ATTACHMENT:
            raise HTTPException(status_code=400, detail="Публичная загрузка поддерживает только REQUEST_ATTACHMENT")
        if int(payload.size_bytes or 0) <= 0:
            raise HTTPException(status_code=400, detail="Некорректный размер файла")
        if int(payload.size_bytes) > _max_file_bytes():
            raise HTTPException(status_code=400, detail=f"Превышен лимит файла ({settings.MAX_FILE_MB} МБ)")

        request_uuid = _uuid_or_400(payload.request_id, "request_id")
        request = db.get(Request, request_uuid)
        if request is None:
            raise HTTPException(status_code=404, detail="Заявка не найдена")
        _ensure_public_request_access_or_403(request, session)

        current = int(request.total_attachments_bytes or 0)
        if current + int(payload.size_bytes) > _max_case_bytes():
            raise HTTPException(status_code=400, detail=f"Превышен лимит вложений заявки ({settings.MAX_CASE_MB} МБ)")

        key = build_object_key(f"requests/{request.id}", payload.file_name)
        presigned_url = get_s3_storage().create_presigned_put_url(key, payload.mime_type)
        record_file_security_event(
            db,
            actor_role="CLIENT",
            actor_subject=actor_subject,
            actor_ip=actor_ip,
            action="UPLOAD_INIT",
            scope=scope_name,
            allowed=True,
            object_key=key,
            request_id=request.id,
            details={"mime_type": payload.mime_type, "size_bytes": int(payload.size_bytes or 0)},
            responsible="Клиент",
            persist_now=True,
        )
        return UploadInitResponse(key=key, presigned_url=presigned_url)
    except HTTPException as exc:
        record_file_security_event(
            db,
            actor_role="CLIENT",
            actor_subject=actor_subject,
            actor_ip=actor_ip,
            action="UPLOAD_INIT",
            scope=scope_name,
            allowed=False,
            reason=str(exc.detail),
            object_key=None,
            request_id=payload.request_id,
            details={"mime_type": payload.mime_type, "size_bytes": int(payload.size_bytes or 0)},
            responsible="Клиент",
            persist_now=True,
        )
        raise


@router.post("/complete", response_model=UploadCompleteResponse)
def upload_complete(
    payload: UploadCompletePayload,
    http_request: FastapiRequest,
    db: Session = Depends(get_db),
    session: dict = Depends(get_public_session),
):
    actor_subject = str(session.get("sub") or "").strip()
    actor_ip = _client_ip(http_request)
    scope_name = str(payload.scope.value if hasattr(payload.scope, "value") else payload.scope)
    try:
        if payload.scope != UploadScope.REQUEST_ATTACHMENT:
            raise HTTPException(status_code=400, detail="Публичная загрузка поддерживает только REQUEST_ATTACHMENT")
        request_uuid = _uuid_or_400(payload.request_id, "request_id")
        request = db.get(Request, request_uuid)
        if request is None:
            raise HTTPException(status_code=404, detail="Заявка не найдена")
        _ensure_public_request_access_or_403(request, session)
        _ensure_object_key_prefix_or_400(payload.key, f"requests/{request.id}/")

        storage = get_s3_storage()
        try:
            head = storage.head_object(payload.key)
        except ClientError:
            raise HTTPException(status_code=400, detail="Файл не найден в хранилище")

        actual_size = int(head.get("ContentLength") or payload.size_bytes or 0)
        if actual_size <= 0:
            raise HTTPException(status_code=400, detail="Некорректный размер файла")
        if actual_size > _max_file_bytes():
            raise HTTPException(status_code=400, detail=f"Превышен лимит файла ({settings.MAX_FILE_MB} МБ)")
        if int(request.total_attachments_bytes or 0) + actual_size > _max_case_bytes():
            raise HTTPException(status_code=400, detail=f"Превышен лимит вложений заявки ({settings.MAX_CASE_MB} МБ)")

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
            responsible="Клиент",
        )
        mark_unread_for_lawyer(request, EVENT_ATTACHMENT)
        notify_request_event(
            db,
            request=request,
            event_type=NOTIFICATION_EVENT_ATTACHMENT,
            actor_role="CLIENT",
            body=f'Файл: {payload.file_name}',
            responsible="Клиент",
        )
        request.total_attachments_bytes = int(request.total_attachments_bytes or 0) + actual_size
        request.responsible = "Клиент"
        db.add(row)
        db.add(request)
        record_file_security_event(
            db,
            actor_role="CLIENT",
            actor_subject=actor_subject,
            actor_ip=actor_ip,
            action="UPLOAD_COMPLETE",
            scope=scope_name,
            allowed=True,
            object_key=payload.key,
            request_id=request.id,
            details={"mime_type": payload.mime_type, "size_bytes": int(actual_size)},
            responsible="Клиент",
        )
        db.commit()
        db.refresh(row)
        return UploadCompleteResponse(status="ok", attachment_id=str(row.id))
    except HTTPException as exc:
        record_file_security_event(
            db,
            actor_role="CLIENT",
            actor_subject=actor_subject,
            actor_ip=actor_ip,
            action="UPLOAD_COMPLETE",
            scope=scope_name,
            allowed=False,
            reason=str(exc.detail),
            object_key=payload.key,
            request_id=payload.request_id,
            details={"mime_type": payload.mime_type, "size_bytes": int(payload.size_bytes or 0)},
            responsible="Клиент",
            persist_now=True,
        )
        raise


@router.get("/object/{attachment_id}")
def get_public_attachment_object(
    attachment_id: str,
    http_request: FastapiRequest,
    db: Session = Depends(get_db),
    session: dict = Depends(get_public_session),
):
    actor_subject = str(session.get("sub") or "").strip()
    actor_ip = _client_ip(http_request)
    attachment_uuid = _uuid_or_400(attachment_id, "attachment_id")
    request_id = None
    key = None
    try:
        attachment = _load_attachment_with_access_or_4xx(attachment_id, db, session)
        key = attachment.s3_key
        request_id = attachment.request_id
        try:
            obj = get_s3_storage().get_object(attachment.s3_key)
        except ClientError:
            raise HTTPException(status_code=404, detail="Файл не найден в хранилище")

        record_file_security_event(
            db,
            actor_role="CLIENT",
            actor_subject=actor_subject,
            actor_ip=actor_ip,
            action="DOWNLOAD_OBJECT",
            scope="REQUEST_ATTACHMENT",
            allowed=True,
            object_key=key,
            request_id=request_id,
            attachment_id=attachment.id,
            details={},
            responsible="Клиент",
            persist_now=True,
        )

        body = obj["Body"]
        content_length = obj.get("ContentLength")
        media_type = obj.get("ContentType") or attachment.mime_type or "application/octet-stream"
        encoded_name = quote(str(attachment.file_name or "file"), safe="")
        headers = {
            "Content-Disposition": f"inline; filename*=UTF-8''{encoded_name}",
        }
        if content_length is not None:
            headers["Content-Length"] = str(content_length)
        return StreamingResponse(body.iter_chunks(chunk_size=64 * 1024), media_type=media_type, headers=headers)
    except HTTPException as exc:
        record_file_security_event(
            db,
            actor_role="CLIENT",
            actor_subject=actor_subject,
            actor_ip=actor_ip,
            action="DOWNLOAD_OBJECT",
            scope="REQUEST_ATTACHMENT",
            allowed=False,
            reason=str(exc.detail),
            object_key=key,
            request_id=request_id,
            attachment_id=attachment_uuid,
            details={},
            responsible="Клиент",
            persist_now=True,
        )
        raise
