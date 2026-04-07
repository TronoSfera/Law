from __future__ import annotations

import io
import json
import uuid
from typing import Tuple

from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, HTTPException, Query, Request as FastapiRequest
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.config import settings
from app.core.deps import require_role
from app.core.security import decode_jwt
from app.db.session import get_db
from app.models.admin_user import AdminUser
from app.models.attachment import Attachment
from app.models.message import Message
from app.models.request import Request
from app.schemas.uploads import (
    RecropPayload,
    RecropResponse,
    UploadCompletePayload,
    UploadCompleteResponse,
    UploadInitPayload,
    UploadInitResponse,
    UploadScope,
)
from app.api.admin.requests_modules.permissions import ensure_lawyer_can_view_request_or_403
from app.services.notifications import EVENT_ATTACHMENT as NOTIFICATION_EVENT_ATTACHMENT, notify_request_event
from app.services.request_read_markers import EVENT_ATTACHMENT, mark_unread_for_client
from app.services.security_audit import record_file_security_event
from app.services.attachment_scan import (
    SCAN_STATUS_ERROR,
    enqueue_attachment_scan,
    ensure_attachment_download_allowed_or_4xx,
    initial_scan_status_for_new_attachment,
)
from app.services.s3_storage import build_object_key, get_s3_storage

router = APIRouter()

AVATAR_MAX_SIZE_PX = 512
AVATAR_THUMB_MAX_SIZE_PX = 160
AVATAR_WEBP_QUALITY = 80
AVATAR_THUMB_WEBP_QUALITY = 72
AVATAR_ORIGINAL_MAX_SIZE_PX = 1600
AVATAR_ORIGINAL_WEBP_QUALITY = 82
_AVATAR_RESAMPLE = getattr(getattr(Image, "Resampling", Image), "LANCZOS", 1)


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


def _read_object_bytes_or_400(storage, key: str) -> bytes:
    try:
        obj = storage.get_object(key)
    except ClientError:
        raise HTTPException(status_code=400, detail="Файл не найден в хранилище")
    return _read_object_body_or_400(obj)


def _read_object_body_or_400(obj: dict) -> bytes:
    body = obj.get("Body")
    if hasattr(body, "read"):
        data = body.read()
    elif hasattr(body, "iter_chunks"):
        data = b"".join(body.iter_chunks())
    else:
        raise HTTPException(status_code=500, detail="Не удалось прочитать объект из хранилища")
    if isinstance(data, str):
        data = data.encode("utf-8")
    if not isinstance(data, (bytes, bytearray)) or not data:
        raise HTTPException(status_code=400, detail="Пустой файл аватара")
    return bytes(data)


def _write_object_bytes_or_500(storage, *, key: str, content: bytes, mime_type: str) -> None:
    if hasattr(storage, "client") and hasattr(storage.client, "put_object") and hasattr(storage, "bucket"):
        storage.client.put_object(
            Bucket=storage.bucket,
            Key=key,
            Body=content,
            ContentType=mime_type,
        )
        return
    objects = getattr(storage, "objects", None)
    if isinstance(objects, dict):
        objects[key] = {
            "size": int(len(content)),
            "mime": str(mime_type or "application/octet-stream"),
            "content": bytes(content),
        }
        return
    raise HTTPException(status_code=500, detail="Хранилище не поддерживает запись объектов")


def _avatar_variant_key(key: str, variant: str) -> str:
    raw = str(key or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="Некорректный ключ аватара")
    normalized_variant = str(variant or "").strip().lower()
    if normalized_variant != "thumb":
        raise HTTPException(status_code=400, detail="Неподдерживаемый вариант аватара")
    prefix, _, file_name = raw.rpartition("/")
    if not prefix or not file_name:
        raise HTTPException(status_code=400, detail="Некорректный ключ аватара")
    base_name = file_name.rsplit(".", 1)[0] if "." in file_name else file_name
    return prefix + "/" + base_name + "__thumb.webp"


def _render_avatar_to_webp_or_400(source: bytes, *, max_size_px: int) -> bytes:
    try:
        with Image.open(io.BytesIO(source)) as image:
            image = ImageOps.exif_transpose(image)
            image.load()
            if max(image.size) > max_size_px:
                image.thumbnail((max_size_px, max_size_px), resample=_AVATAR_RESAMPLE)
            if image.mode != "RGB":
                image = image.convert("RGB")
            out = io.BytesIO()
            image.save(out, format="WEBP", quality=AVATAR_WEBP_QUALITY, method=6)
            optimized = out.getvalue()
    except UnidentifiedImageError:
        raise HTTPException(status_code=400, detail="Аватар должен быть изображением")
    except OSError:
        raise HTTPException(status_code=400, detail="Не удалось обработать изображение аватара")
    if not optimized:
        raise HTTPException(status_code=400, detail="Не удалось обработать изображение аватара")
    return optimized


def _write_avatar_variant_or_400(storage, *, source_key: str, variant: str, max_size_px: int) -> tuple[str, int, str]:
    source = _read_object_bytes_or_400(storage, source_key)
    optimized = _render_avatar_to_webp_or_400(source, max_size_px=max_size_px)
    target_key = _avatar_variant_key(source_key, variant)
    _write_object_bytes_or_500(storage, key=target_key, content=optimized, mime_type="image/webp")
    return target_key, int(len(optimized)), "image/webp"


def _parse_crop_dict(crop_json: str | None) -> dict:
    """Parse crop JSON string into a validated dict with clamped values."""
    raw: dict = {}
    if crop_json:
        try:
            raw = json.loads(crop_json)
        except (ValueError, TypeError):
            raw = {}
    x = max(-1.0, min(1.0, float(raw.get("x", 0.0) or 0.0)))
    y = max(-1.0, min(1.0, float(raw.get("y", 0.0) or 0.0)))
    zoom = max(1.0, min(4.0, float(raw.get("zoom", 1.0) or 1.0)))
    return {"x": x, "y": y, "zoom": zoom}


def _crop_cover(image: Image.Image, target_size: tuple[int, int], crop: dict) -> Image.Image:
    """Crop and resize *image* to *target_size* according to (x, y, zoom) parameters.

    x, y: -1.0..1.0 — normalized offset from the image center.
    zoom: 1.0..4.0  — zoom multiplier (1 = minimum crop to fill target aspect ratio).

    Algorithm ported from Flw/backend/media_images.py and matches the
    CSS-transform-based preview in AvatarCropEditor.jsx exactly.
    """
    tw, th = target_size
    sw, sh = image.size
    # Minimum scale to cover the target rectangle from the source
    base_scale = max(tw / sw, th / sh)
    # Size of the crop window in source pixels
    crop_w = max(1.0, min(float(sw), tw / base_scale / crop["zoom"]))
    crop_h = max(1.0, min(float(sh), th / base_scale / crop["zoom"]))
    # Maximum pan offsets (from center to edge) in source pixels
    offset_x = (sw - crop_w) / 2.0
    offset_y = (sh - crop_h) / 2.0
    # Center of the crop window
    cx = sw / 2.0 + crop["x"] * offset_x
    cy = sh / 2.0 + crop["y"] * offset_y
    left = max(0.0, min(sw - crop_w, cx - crop_w / 2.0))
    top = max(0.0, min(sh - crop_h, cy - crop_h / 2.0))
    box = (left, top, left + crop_w, top + crop_h)
    return image.crop(box).resize((tw, th), _AVATAR_RESAMPLE)


def _render_avatar_original_webp(source: bytes) -> bytes:
    """Compress source image to an archival-quality WebP (max AVATAR_ORIGINAL_MAX_SIZE_PX px)."""
    try:
        with Image.open(io.BytesIO(source)) as image:
            image = ImageOps.exif_transpose(image)
            image.load()
            if max(image.size) > AVATAR_ORIGINAL_MAX_SIZE_PX:
                image.thumbnail(
                    (AVATAR_ORIGINAL_MAX_SIZE_PX, AVATAR_ORIGINAL_MAX_SIZE_PX),
                    resample=_AVATAR_RESAMPLE,
                )
            if image.mode != "RGB":
                image = image.convert("RGB")
            out = io.BytesIO()
            image.save(out, format="WEBP", quality=AVATAR_ORIGINAL_WEBP_QUALITY, method=6)
            result = out.getvalue()
    except UnidentifiedImageError:
        raise HTTPException(status_code=400, detail="Аватар должен быть изображением")
    except OSError:
        raise HTTPException(status_code=400, detail="Не удалось обработать изображение аватара")
    if not result:
        raise HTTPException(status_code=400, detail="Не удалось обработать изображение аватара")
    return result


def _render_avatar_cropped_webp(source: bytes, crop: dict, *, size_px: int, quality: int) -> bytes:
    """Apply crop parameters to source image and produce a square WebP."""
    try:
        with Image.open(io.BytesIO(source)) as image:
            image = ImageOps.exif_transpose(image)
            image.load()
            if image.mode != "RGB":
                image = image.convert("RGB")
            cropped = _crop_cover(image, (size_px, size_px), crop)
            out = io.BytesIO()
            cropped.save(out, format="WEBP", quality=quality, method=6)
            result = out.getvalue()
    except UnidentifiedImageError:
        raise HTTPException(status_code=400, detail="Аватар должен быть изображением")
    except OSError:
        raise HTTPException(status_code=400, detail="Не удалось обработать изображение аватара")
    if not result:
        raise HTTPException(status_code=400, detail="Не удалось обработать изображение аватара")
    return result


def _avatar_deterministic_keys(user_id: uuid.UUID) -> dict[str, str]:
    """Return the three deterministic S3 keys for a user's avatar."""
    prefix = f"avatars/{user_id}"
    return {
        "original": f"{prefix}/original.webp",
        "cropped": f"{prefix}/cropped.webp",
        "thumb": f"{prefix}/cropped__thumb.webp",
    }


def _delete_object_silent(storage, key: str) -> None:
    """Delete an S3 object, ignoring errors (best-effort cleanup)."""
    try:
        if hasattr(storage, "client") and hasattr(storage, "bucket"):
            storage.client.delete_object(Bucket=storage.bucket, Key=key)
    except Exception:
        pass


def _serialize_attachment(row: Attachment) -> dict:
    return {
        "id": str(row.id),
        "request_id": str(row.request_id),
        "message_id": str(row.message_id) if row.message_id else None,
        "file_name": row.file_name,
        "mime_type": row.mime_type,
        "size_bytes": int(row.size_bytes or 0),
        "s3_key": row.s3_key,
        "immutable": bool(row.immutable),
        "scan_status": row.scan_status,
        "scan_signature": row.scan_signature,
        "scan_error": row.scan_error,
        "scanned_at": row.scanned_at.isoformat() if row.scanned_at else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "responsible": row.responsible,
    }


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
            if not str(payload.mime_type or "").strip().lower().startswith("image/"):
                raise HTTPException(status_code=400, detail="Для аватара поддерживаются только изображения")
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
            existing_row = (
                db.query(Attachment)
                .filter(Attachment.request_id == request.id, Attachment.s3_key == payload.key)
                .first()
            )
            if existing_row is not None:
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
                    details={
                        "mime_type": existing_row.mime_type,
                        "size_bytes": int(existing_row.size_bytes or 0),
                        "idempotent_replay": True,
                    },
                    responsible=responsible,
                )
                db.commit()
                return UploadCompleteResponse(status="ok", attachment_id=str(existing_row.id))
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
                scan_status=initial_scan_status_for_new_attachment(),
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
            try:
                enqueue_attachment_scan(str(row.id))
            except Exception as exc:
                row.scan_status = SCAN_STATUS_ERROR
                row.scan_error = str(exc)[:500]
                db.add(row)
                db.commit()
            return UploadCompleteResponse(status="ok", attachment_id=str(row.id))

        if payload.scope == UploadScope.USER_AVATAR:
            if not str(payload.mime_type or "").strip().lower().startswith("image/"):
                raise HTTPException(status_code=400, detail="Для аватара поддерживаются только изображения")
            target_user_id = str(payload.user_id or actor_id)
            target_uuid = _uuid_or_400(target_user_id, "user_id")
            if role != "ADMIN" and str(target_uuid) != actor_id:
                raise HTTPException(status_code=403, detail="Недостаточно прав для загрузки аватара")
            user = db.get(AdminUser, target_uuid)
            if user is None:
                raise HTTPException(status_code=404, detail="Пользователь не найден")
            _ensure_object_key_prefix_or_400(payload.key, f"avatars/{user.id}/")

            # Read the raw uploaded file from the presigned-PUT key
            raw_source = _read_object_bytes_or_400(storage, payload.key)

            # Parse crop params (defaults to centered 1× zoom if not provided)
            crop = _parse_crop_dict(payload.crop_json)

            # Deterministic S3 keys for this user
            keys = _avatar_deterministic_keys(user.id)

            # 1. Compress original (archival quality, no crop)
            original_bytes = _render_avatar_original_webp(raw_source)
            _write_object_bytes_or_500(storage, key=keys["original"], content=original_bytes, mime_type="image/webp")

            # 2. Cropped avatar (512×512)
            cropped_bytes = _render_avatar_cropped_webp(
                raw_source, crop, size_px=AVATAR_MAX_SIZE_PX, quality=AVATAR_WEBP_QUALITY
            )
            _write_object_bytes_or_500(storage, key=keys["cropped"], content=cropped_bytes, mime_type="image/webp")

            # 3. Thumbnail (160×160, same crop)
            thumb_bytes = _render_avatar_cropped_webp(
                raw_source, crop, size_px=AVATAR_THUMB_MAX_SIZE_PX, quality=AVATAR_THUMB_WEBP_QUALITY
            )
            _write_object_bytes_or_500(storage, key=keys["thumb"], content=thumb_bytes, mime_type="image/webp")

            # Clean up the temp presigned-PUT object (best-effort)
            if payload.key != keys["original"]:
                _delete_object_silent(storage, payload.key)

            # Update user record
            user.avatar_url = f"s3://{keys['cropped']}"
            user.avatar_original_key = keys["original"]
            user.avatar_crop_json = json.dumps(crop)
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
                details={
                    "source_mime_type": payload.mime_type,
                    "source_size_bytes": int(actual_size),
                    "original_key": keys["original"],
                    "cropped_key": keys["cropped"],
                    "thumb_key": keys["thumb"],
                    "crop": crop,
                },
                responsible=responsible,
            )
            db.commit()
            return UploadCompleteResponse(
                status="ok",
                avatar_url=user.avatar_url,
                avatar_original_key=keys["original"],
            )

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


@router.post("/recrop", response_model=RecropResponse)
def avatar_recrop(
    payload: RecropPayload,
    http_request: FastapiRequest,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_role("ADMIN", "LAWYER")),
):
    """Re-apply crop parameters to an existing original avatar without re-uploading."""
    role = str(admin.get("role") or "").upper() or "UNKNOWN"
    actor_id = str(admin.get("sub") or "").strip()
    actor_ip = _client_ip(http_request)
    responsible = str(admin.get("email") or "").strip() or "Администратор системы"
    target_uuid_for_log: uuid.UUID | None = None

    try:
        # HIGH-2: explicit guard so an empty actor_id never silently passes the self-service check.
        if not actor_id and role != "ADMIN":
            raise HTTPException(status_code=401, detail="Некорректный токен")

        target_uuid_for_log = _uuid_or_400(payload.user_id, "user_id")
        if role != "ADMIN" and str(target_uuid_for_log) != actor_id:
            raise HTTPException(status_code=403, detail="Недостаточно прав для обрезки аватара")

        user = db.get(AdminUser, target_uuid_for_log)
        if user is None:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        if not user.avatar_original_key:
            raise HTTPException(status_code=400, detail="Оригинал аватара не найден — сначала загрузите фото")

        crop = _parse_crop_dict(payload.crop_json)
        storage = get_s3_storage()

        # Read the compressed original from S3
        original_source = _read_object_bytes_or_400(storage, user.avatar_original_key)

        # Re-generate cropped variants
        keys = _avatar_deterministic_keys(target_uuid_for_log)

        cropped_bytes = _render_avatar_cropped_webp(
            original_source, crop, size_px=AVATAR_MAX_SIZE_PX, quality=AVATAR_WEBP_QUALITY
        )
        _write_object_bytes_or_500(storage, key=keys["cropped"], content=cropped_bytes, mime_type="image/webp")

        thumb_bytes = _render_avatar_cropped_webp(
            original_source, crop, size_px=AVATAR_THUMB_MAX_SIZE_PX, quality=AVATAR_THUMB_WEBP_QUALITY
        )
        _write_object_bytes_or_500(storage, key=keys["thumb"], content=thumb_bytes, mime_type="image/webp")

        user.avatar_url = f"s3://{keys['cropped']}"
        user.avatar_crop_json = json.dumps(crop)
        user.responsible = responsible
        db.add(user)
        record_file_security_event(
            db,
            actor_role=role,
            actor_subject=actor_id,
            actor_ip=actor_ip,
            action="AVATAR_RECROP",
            scope="avatars",
            allowed=True,
            object_key=keys["cropped"],
            details={"crop": crop},
            responsible=responsible,
            persist_now=True,
        )
        db.commit()
        return RecropResponse(status="ok", avatar_url=user.avatar_url)

    except HTTPException as exc:
        # HIGH-1: log rejected recrop attempts for audit consistency.
        record_file_security_event(
            db,
            actor_role=role,
            actor_subject=actor_id,
            actor_ip=actor_ip,
            action="AVATAR_RECROP",
            scope="avatars",
            allowed=False,
            reason=str(exc.detail),
            object_key=None,
            details={"user_id": payload.user_id},
            responsible=responsible,
            persist_now=True,
        )
        raise


@router.get("/request-attachments/{request_id}")
def list_request_attachments(
    request_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_role("ADMIN", "LAWYER", "CURATOR")),
):
    request_uuid = _uuid_or_400(request_id, "request_id")
    req = db.get(Request, request_uuid)
    if req is None:
        raise HTTPException(status_code=404, detail="Заявка не найдена")

    ensure_lawyer_can_view_request_or_403(admin, req)
    rows = db.query(Attachment).filter(Attachment.request_id == req.id).order_by(Attachment.created_at.asc(), Attachment.id.asc()).all()
    return {"rows": [_serialize_attachment(row) for row in rows], "total": len(rows)}


@router.get("/object/{object_key:path}")
def get_object_proxy(
    object_key: str,
    http_request: FastapiRequest,
    token: str = Query(...),
    variant: str | None = Query(None),
    db: Session = Depends(get_db),
):
    key = str(object_key or "").strip()
    requested_variant = str(variant or "").strip().lower()
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
                attachment = db.query(Attachment).filter(Attachment.s3_key == key).order_by(Attachment.created_at.desc()).first()
                if attachment is None:
                    raise HTTPException(status_code=404, detail="Файл не найден")
                ensure_attachment_download_allowed_or_4xx(attachment)
            else:
                raise HTTPException(status_code=403, detail="Недостаточно прав")
        elif scope == "requests":
            attachment = db.query(Attachment).filter(Attachment.s3_key == key).order_by(Attachment.created_at.desc()).first()
            if attachment is None:
                raise HTTPException(status_code=404, detail="Файл не найден")
            ensure_attachment_download_allowed_or_4xx(attachment)

        storage = get_s3_storage()
        if scope == "avatars" and requested_variant == "thumb":
            # New deterministic layout: cropped.webp → cropped__thumb.webp
            # Old layout: {uuid}-name.ext → {uuid}-name__thumb.webp (preserved via _avatar_variant_key)
            if key.endswith("/cropped.webp"):
                # New-style key — thumb is always stored alongside as cropped__thumb.webp
                thumb_key = key[: -len("cropped.webp")] + "cropped__thumb.webp"
            else:
                thumb_key = _avatar_variant_key(key, "thumb")
            try:
                obj = storage.get_object(thumb_key)
            except ClientError:
                try:
                    source_obj = storage.get_object(key)
                except ClientError:
                    raise HTTPException(status_code=404, detail="Файл не найден")
                source = _read_object_body_or_400(source_obj)
                optimized = _render_avatar_to_webp_or_400(source, max_size_px=AVATAR_THUMB_MAX_SIZE_PX)
                _write_object_bytes_or_500(storage, key=thumb_key, content=optimized, mime_type="image/webp")
                obj = storage.get_object(thumb_key)
        else:
            try:
                obj = storage.get_object(key)
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
            details={"variant": requested_variant or None},
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
