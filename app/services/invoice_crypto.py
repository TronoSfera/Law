from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
from typing import Any

from app.core.config import settings

_VERSION = b"v1"


def _key() -> bytes:
    secret = str(settings.DATA_ENCRYPTION_SECRET or "").strip()
    if not secret:
        secret = str(settings.ADMIN_JWT_SECRET or "").strip()
    if not secret:
        secret = str(settings.PUBLIC_JWT_SECRET or "").strip()
    if not secret:
        raise ValueError("Не задан секрет шифрования")
    return hashlib.sha256(secret.encode("utf-8")).digest()


def _xor_bytes(a: bytes, b: bytes) -> bytes:
    return bytes(x ^ y for x, y in zip(a, b))


def encrypt_requisites(data: dict[str, Any] | None) -> str:
    payload = dict(data or {})
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    nonce = secrets.token_bytes(16)
    stream = hashlib.pbkdf2_hmac("sha256", _key(), nonce, 120_000, dklen=len(raw))
    cipher = _xor_bytes(raw, stream)
    tag = hmac.new(_key(), _VERSION + nonce + cipher, hashlib.sha256).digest()
    token = _VERSION + nonce + tag + cipher
    return base64.urlsafe_b64encode(token).decode("ascii")


def decrypt_requisites(token: str | None) -> dict[str, Any]:
    encoded = str(token or "").strip()
    if not encoded:
        return {}
    blob = base64.urlsafe_b64decode(encoded.encode("ascii"))
    if len(blob) < 2 + 16 + 32:
        raise ValueError("Некорректные зашифрованные реквизиты")
    version = blob[:2]
    nonce = blob[2:18]
    tag = blob[18:50]
    cipher = blob[50:]
    if version != _VERSION:
        raise ValueError("Неподдерживаемая версия шифрования")
    expected = hmac.new(_key(), version + nonce + cipher, hashlib.sha256).digest()
    if not hmac.compare_digest(tag, expected):
        raise ValueError("Поврежденные зашифрованные реквизиты")
    stream = hashlib.pbkdf2_hmac("sha256", _key(), nonce, 120_000, dklen=len(cipher))
    raw = _xor_bytes(cipher, stream)
    data = json.loads(raw.decode("utf-8"))
    return data if isinstance(data, dict) else {}
