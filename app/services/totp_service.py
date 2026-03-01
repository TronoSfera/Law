from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import struct
import time
from datetime import datetime, timezone
from typing import Iterable
from urllib.parse import quote

from app.core.config import settings
from app.services.invoice_crypto import decrypt_requisites, encrypt_requisites


_TOTP_DIGITS = 6
_TOTP_PERIOD_SECONDS = 30
_BACKUP_CODES_COUNT = 10
_BACKUP_CODE_BYTES = 5


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_base32_secret(secret: str) -> str:
    value = "".join(ch for ch in str(secret or "").strip().upper() if ch.isalnum())
    if not value:
        raise ValueError("Пустой TOTP secret")
    return value


def generate_totp_secret() -> str:
    raw = secrets.token_bytes(20)
    return base64.b32encode(raw).decode("ascii").rstrip("=")


def build_otpauth_uri(*, secret: str, account_name: str, issuer: str) -> str:
    clean_secret = _normalize_base32_secret(secret)
    label = quote(f"{issuer}:{account_name}")
    issuer_q = quote(issuer)
    return (
        f"otpauth://totp/{label}?secret={clean_secret}"
        f"&issuer={issuer_q}&algorithm=SHA1&digits={_TOTP_DIGITS}&period={_TOTP_PERIOD_SECONDS}"
    )


def _counter(for_time: float | None = None) -> int:
    ts = float(for_time if for_time is not None else time.time())
    return int(ts // _TOTP_PERIOD_SECONDS)


def _totp_at(secret: str, counter_value: int) -> str:
    clean_secret = _normalize_base32_secret(secret)
    padded = clean_secret + "=" * (-len(clean_secret) % 8)
    key = base64.b32decode(padded, casefold=True)
    msg = struct.pack(">Q", int(counter_value))
    digest = hmac.new(key, msg, hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    code_int = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(code_int % (10**_TOTP_DIGITS)).zfill(_TOTP_DIGITS)


def verify_totp_code(secret: str, code: str, *, window: int = 1, for_time: float | None = None) -> bool:
    raw_code = "".join(ch for ch in str(code or "").strip() if ch.isdigit())
    if len(raw_code) != _TOTP_DIGITS:
        return False
    current = _counter(for_time)
    for delta in range(-abs(int(window)), abs(int(window)) + 1):
        if _totp_at(secret, current + delta) == raw_code:
            return True
    return False


def current_totp_code(secret: str, *, for_time: float | None = None) -> str:
    return _totp_at(secret, _counter(for_time))


def _backup_code_pepper() -> str:
    secret = str(settings.DATA_ENCRYPTION_SECRET or "").strip() or str(settings.ADMIN_JWT_SECRET or "").strip()
    return secret or "totp-backup-pepper"


def _hash_backup_code(code: str) -> str:
    normalized = "".join(ch for ch in str(code or "").strip().upper() if ch.isalnum())
    digest = hashlib.sha256(f"{_backup_code_pepper()}:{normalized}".encode("utf-8")).hexdigest()
    return digest


def generate_backup_codes() -> tuple[list[str], list[str]]:
    plain: list[str] = []
    hashes: list[str] = []
    for _ in range(_BACKUP_CODES_COUNT):
        code = base64.b32encode(secrets.token_bytes(_BACKUP_CODE_BYTES)).decode("ascii").rstrip("=")
        normalized = code[:4] + "-" + code[4:8]
        plain.append(normalized)
        hashes.append(_hash_backup_code(normalized))
    return plain, hashes


def verify_and_consume_backup_code(code: str, hashes: Iterable[str] | None) -> tuple[bool, list[str]]:
    existing = [str(item) for item in (hashes or []) if str(item or "").strip()]
    if not existing:
        return False, existing
    target = _hash_backup_code(code)
    if target not in existing:
        return False, existing
    remaining = [item for item in existing if item != target]
    return True, remaining


def encrypt_totp_secret(secret: str) -> str:
    clean_secret = _normalize_base32_secret(secret)
    return encrypt_requisites({"secret": clean_secret})


def decrypt_totp_secret(token: str | None) -> str:
    payload = decrypt_requisites(token)
    secret = _normalize_base32_secret(payload.get("secret"))
    return secret


def admin_auth_mode() -> str:
    raw = str(getattr(settings, "ADMIN_AUTH_MODE", "password") or "").strip().lower()
    if raw in {"password", "password_totp_optional", "password_totp_required"}:
        return raw
    return "password"


def admin_totp_required(*, user_totp_enabled: bool) -> bool:
    mode = admin_auth_mode()
    if mode == "password":
        return False
    if mode == "password_totp_required":
        return True
    return bool(user_totp_enabled)


def totp_issuer(default: str = "Law Portal") -> str:
    preferred = str(getattr(settings, "TOTP_ISSUER", "") or "").strip()
    if preferred:
        return preferred
    app_name = str(getattr(settings, "APP_NAME", "") or "").strip()
    return app_name or default


def mark_totp_used_timestamp() -> datetime:
    return _now_utc()
