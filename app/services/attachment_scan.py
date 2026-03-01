from __future__ import annotations

import hashlib
import os
import socket
import struct
from datetime import datetime, timezone
from typing import Iterable
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.attachment import Attachment
from app.services.s3_storage import get_s3_storage
from app.services.security_audit import record_file_security_event
from app.workers.celery_app import celery_app

SCAN_STATUS_PENDING = "PENDING"
SCAN_STATUS_CLEAN = "CLEAN"
SCAN_STATUS_INFECTED = "INFECTED"
SCAN_STATUS_ERROR = "ERROR"
SCAN_STATUS_VALUES = {SCAN_STATUS_PENDING, SCAN_STATUS_CLEAN, SCAN_STATUS_INFECTED, SCAN_STATUS_ERROR}

_MIME_BY_EXT = {
    ".pdf": {"application/pdf"},
    ".jpg": {"image/jpeg"},
    ".jpeg": {"image/jpeg"},
    ".png": {"image/png"},
    ".mp4": {"video/mp4"},
    ".txt": {"text/plain"},
}


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _scan_enabled() -> bool:
    return bool(getattr(settings, "ATTACHMENT_SCAN_ENABLED", False))


def _scan_enforced() -> bool:
    return bool(getattr(settings, "ATTACHMENT_SCAN_ENFORCE", False))


def _clamav_enabled() -> bool:
    return bool(getattr(settings, "CLAMAV_ENABLED", False))


def _allowed_mimes() -> set[str]:
    raw = str(getattr(settings, "ATTACHMENT_ALLOWED_MIME_TYPES", "") or "").strip()
    values = {value.strip().lower() for value in raw.split(",") if value.strip()}
    return values or {"application/pdf", "image/jpeg", "image/png", "video/mp4", "text/plain"}


def initial_scan_status_for_new_attachment() -> str:
    return SCAN_STATUS_PENDING if _scan_enabled() else SCAN_STATUS_CLEAN


def enqueue_attachment_scan(attachment_id: str) -> bool:
    if not _scan_enabled():
        return False
    celery_app.send_task("app.workers.tasks.attachment_scan.scan_attachment_file", args=[str(attachment_id)], queue="uploads")
    return True


def _iter_bytes_from_s3(key: str) -> Iterable[bytes]:
    obj = get_s3_storage().get_object(key)
    body = obj.get("Body")
    if body is None:
        return []
    return body.iter_chunks(chunk_size=64 * 1024)


def _download_object_bytes(key: str, max_bytes: int) -> bytes:
    chunks = []
    total = 0
    for chunk in _iter_bytes_from_s3(key):
        if not chunk:
            continue
        total += len(chunk)
        if total > max_bytes:
            raise ValueError("Файл превышает допустимый размер для антивирусной проверки")
        chunks.append(chunk)
    return b"".join(chunks)


def _detect_mime(data: bytes) -> str:
    if data.startswith(b"%PDF-"):
        return "application/pdf"
    if data.startswith(b"\xFF\xD8\xFF"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if len(data) > 12 and data[4:8] == b"ftyp":
        return "video/mp4"
    try:
        text = data.decode("utf-8")
        if text:
            printable = sum(1 for ch in text[:2048] if ch.isprintable() or ch in "\r\n\t")
            ratio = printable / max(1, min(len(text), 2048))
            if ratio > 0.95:
                return "text/plain"
    except Exception:
        pass
    return "application/octet-stream"


def _file_ext(file_name: str) -> str:
    _, ext = os.path.splitext(str(file_name or "").strip().lower())
    return ext


def _content_policy_check(*, file_name: str, declared_mime: str, detected_mime: str) -> tuple[bool, str | None]:
    normalized_detected = str(detected_mime or "").strip().lower()
    normalized_declared = str(declared_mime or "").strip().lower()
    if normalized_detected not in _allowed_mimes():
        return False, f"Неподдерживаемый MIME: {normalized_detected or '-'}"

    ext = _file_ext(file_name)
    allowed_by_ext = _MIME_BY_EXT.get(ext)
    if allowed_by_ext and normalized_detected not in allowed_by_ext:
        return False, f"Несоответствие контента расширению ({ext})"

    if normalized_declared and normalized_declared != normalized_detected:
        # Fail closed on MIME spoofing.
        return False, "Декларируемый MIME не совпадает с фактическим"
    return True, None


def _clamav_scan_bytes(data: bytes) -> tuple[bool, str | None]:
    host = str(getattr(settings, "CLAMAV_HOST", "clamav") or "clamav").strip()
    port = int(getattr(settings, "CLAMAV_PORT", 3310) or 3310)
    timeout = int(getattr(settings, "CLAMAV_TIMEOUT_SECONDS", 20) or 20)
    with socket.create_connection((host, port), timeout=timeout) as sock:
        sock.settimeout(timeout)
        sock.sendall(b"zINSTREAM\0")
        offset = 0
        chunk_size = 64 * 1024
        while offset < len(data):
            chunk = data[offset : offset + chunk_size]
            offset += len(chunk)
            sock.sendall(struct.pack(">I", len(chunk)))
            sock.sendall(chunk)
        sock.sendall(struct.pack(">I", 0))
        response = b""
        while True:
            part = sock.recv(4096)
            if not part:
                break
            response += part
    text = response.decode("utf-8", errors="replace").strip().strip("\x00")
    if " FOUND" in text:
        signature = text.split(":", 1)[-1].replace("FOUND", "").strip() or "MALWARE_FOUND"
        return False, signature
    if text.endswith("OK") or " OK" in text:
        return True, None
    raise ValueError(f"Некорректный ответ ClamAV: {text or '-'}")


def ensure_attachment_download_allowed_or_4xx(attachment: Attachment) -> None:
    if not _scan_enforced():
        return
    status = str(getattr(attachment, "scan_status", "") or "").strip().upper() or SCAN_STATUS_CLEAN
    if status == SCAN_STATUS_CLEAN:
        return
    if status == SCAN_STATUS_PENDING:
        raise HTTPException(status_code=423, detail="Файл проверяется антивирусом")
    if status == SCAN_STATUS_INFECTED:
        raise HTTPException(status_code=403, detail="Файл заблокирован антивирусной проверкой")
    raise HTTPException(status_code=403, detail="Файл временно недоступен из-за ошибки проверки")


def scan_attachment_file_impl(attachment_id: str) -> dict:
    db: Session = SessionLocal()
    try:
        row = db.get(Attachment, UUID(str(attachment_id)))
        if row is None:
            return {"status": "missing"}

        row.scan_status = SCAN_STATUS_PENDING
        row.scan_error = None
        row.scan_signature = None
        row.scanned_at = None
        db.add(row)
        db.flush()

        data = _download_object_bytes(row.s3_key, max_bytes=max(1, int(settings.MAX_FILE_MB)) * 1024 * 1024)
        digest = hashlib.sha256(data).hexdigest()
        detected_mime = _detect_mime(data)
        row.content_sha256 = digest
        row.detected_mime = detected_mime

        allowed, reason = _content_policy_check(
            file_name=row.file_name,
            declared_mime=row.mime_type,
            detected_mime=detected_mime,
        )
        if not allowed:
            row.scan_status = SCAN_STATUS_INFECTED
            row.scan_signature = "CONTENT_POLICY"
            row.scan_error = reason
            row.scanned_at = _now_utc()
            db.add(row)
            record_file_security_event(
                db,
                actor_role="SYSTEM",
                actor_subject="attachment-scanner",
                actor_ip=None,
                action="ANTIVIRUS_SCAN_INFECTED",
                scope="REQUEST_ATTACHMENT",
                allowed=False,
                reason=reason,
                object_key=row.s3_key,
                request_id=row.request_id,
                attachment_id=row.id,
                details={"scan_status": row.scan_status, "signature": row.scan_signature, "detected_mime": detected_mime},
                responsible="Система AV",
            )
            db.commit()
            return {"status": row.scan_status, "signature": row.scan_signature, "reason": reason}

        if _clamav_enabled():
            clean, signature = _clamav_scan_bytes(data)
            if not clean:
                row.scan_status = SCAN_STATUS_INFECTED
                row.scan_signature = signature or "MALWARE_FOUND"
                row.scan_error = None
                row.scanned_at = _now_utc()
                db.add(row)
                record_file_security_event(
                    db,
                    actor_role="SYSTEM",
                    actor_subject="attachment-scanner",
                    actor_ip=None,
                    action="ANTIVIRUS_SCAN_INFECTED",
                    scope="REQUEST_ATTACHMENT",
                    allowed=False,
                    reason=row.scan_signature,
                    object_key=row.s3_key,
                    request_id=row.request_id,
                    attachment_id=row.id,
                    details={"scan_status": row.scan_status, "signature": row.scan_signature, "detected_mime": detected_mime},
                    responsible="Система AV",
                )
                db.commit()
                return {"status": row.scan_status, "signature": row.scan_signature}

        row.scan_status = SCAN_STATUS_CLEAN
        row.scan_error = None
        row.scan_signature = None
        row.scanned_at = _now_utc()
        db.add(row)
        record_file_security_event(
            db,
            actor_role="SYSTEM",
            actor_subject="attachment-scanner",
            actor_ip=None,
            action="ANTIVIRUS_SCAN_CLEAN",
            scope="REQUEST_ATTACHMENT",
            allowed=True,
            object_key=row.s3_key,
            request_id=row.request_id,
            attachment_id=row.id,
            details={"scan_status": row.scan_status, "detected_mime": detected_mime},
            responsible="Система AV",
        )
        db.commit()
        return {"status": row.scan_status}
    except Exception as exc:
        db.rollback()
        try:
            row = db.get(Attachment, UUID(str(attachment_id)))
        except Exception:
            row = None
        if row is not None:
            row.scan_status = SCAN_STATUS_ERROR
            row.scan_error = str(exc)[:500]
            row.scanned_at = _now_utc()
            db.add(row)
            record_file_security_event(
                db,
                actor_role="SYSTEM",
                actor_subject="attachment-scanner",
                actor_ip=None,
                action="ANTIVIRUS_SCAN_ERROR",
                scope="REQUEST_ATTACHMENT",
                allowed=False,
                reason=row.scan_error,
                object_key=row.s3_key,
                request_id=row.request_id,
                attachment_id=row.id,
                details={"scan_status": row.scan_status},
                responsible="Система AV",
            )
            db.commit()
        raise
    finally:
        db.close()


@celery_app.task(name="app.workers.tasks.attachment_scan.scan_attachment_file", queue="uploads")
def scan_attachment_file(attachment_id: str) -> dict:
    return scan_attachment_file_impl(str(attachment_id))
