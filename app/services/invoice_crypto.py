from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
from typing import Any

from app.services.crypto_keyring import get_data_secrets, key_digest, ordered_unique_key_digests

_VERSION_LEGACY = b"v1"
_PREFIX_V2 = "invenc:v2:"


def _xor_bytes(a: bytes, b: bytes) -> bytes:
    return bytes(x ^ y for x, y in zip(a, b))


def _aad_v2(kid: str) -> bytes:
    return b"v2|" + str(kid).encode("utf-8") + b"|"


def active_requisites_kid() -> str:
    active_kid, _ = get_data_secrets()
    return active_kid


def extract_requisites_kid(token: str | None) -> str | None:
    encoded = str(token or "").strip()
    if not encoded:
        return None
    if not encoded.startswith(_PREFIX_V2):
        return None
    parts = encoded.split(":", 3)
    if len(parts) != 4:
        return None
    kid = str(parts[2] or "").strip()
    return kid or None


def _encrypt_payload(raw: bytes, *, kid: str, key: bytes) -> str:
    nonce = secrets.token_bytes(16)
    stream = hashlib.pbkdf2_hmac("sha256", key, nonce, 120_000, dklen=len(raw))
    cipher = _xor_bytes(raw, stream)
    tag = hmac.new(key, _aad_v2(kid) + nonce + cipher, hashlib.sha256).digest()
    token = nonce + tag + cipher
    encoded = base64.urlsafe_b64encode(token).decode("ascii")
    return f"{_PREFIX_V2}{kid}:{encoded}"


def _decrypt_v2(encoded: str, *, kid: str, key: bytes) -> dict[str, Any]:
    blob = base64.urlsafe_b64decode(encoded.encode("ascii"))
    if len(blob) < 16 + 32:
        raise ValueError("Некорректные зашифрованные реквизиты")
    nonce = blob[:16]
    tag = blob[16:48]
    cipher = blob[48:]
    expected = hmac.new(key, _aad_v2(kid) + nonce + cipher, hashlib.sha256).digest()
    if not hmac.compare_digest(tag, expected):
        raise ValueError("Поврежденные зашифрованные реквизиты")
    stream = hashlib.pbkdf2_hmac("sha256", key, nonce, 120_000, dklen=len(cipher))
    raw = _xor_bytes(cipher, stream)
    data = json.loads(raw.decode("utf-8"))
    return data if isinstance(data, dict) else {}


def _decrypt_legacy(token: str, keys: list[bytes]) -> dict[str, Any]:
    blob = base64.urlsafe_b64decode(token.encode("ascii"))
    if len(blob) < 2 + 16 + 32:
        raise ValueError("Некорректные зашифрованные реквизиты")
    version = blob[:2]
    nonce = blob[2:18]
    tag = blob[18:50]
    cipher = blob[50:]
    if version != _VERSION_LEGACY:
        raise ValueError("Неподдерживаемая версия шифрования")

    for key in keys:
        expected = hmac.new(key, version + nonce + cipher, hashlib.sha256).digest()
        if not hmac.compare_digest(tag, expected):
            continue
        stream = hashlib.pbkdf2_hmac("sha256", key, nonce, 120_000, dklen=len(cipher))
        raw = _xor_bytes(cipher, stream)
        data = json.loads(raw.decode("utf-8"))
        return data if isinstance(data, dict) else {}

    raise ValueError("Поврежденные зашифрованные реквизиты")


def encrypt_requisites(data: dict[str, Any] | None) -> str:
    payload = dict(data or {})
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")

    active_kid, key_map = get_data_secrets()
    active_secret = key_map.get(active_kid)
    if not active_secret:
        raise ValueError("Не найден активный ключ шифрования DATA")
    return _encrypt_payload(raw, kid=active_kid, key=key_digest(active_secret))


def decrypt_requisites(token: str | None) -> dict[str, Any]:
    encoded = str(token or "").strip()
    if not encoded:
        return {}

    active_kid, key_map = get_data_secrets()
    _ = active_kid
    if encoded.startswith(_PREFIX_V2):
        parts = encoded.split(":", 3)
        if len(parts) != 4:
            raise ValueError("Некорректные зашифрованные реквизиты")
        kid = str(parts[2] or "").strip()
        payload = parts[3]

        if kid in key_map:
            return _decrypt_v2(payload, kid=kid, key=key_digest(key_map[kid]))

        for fallback_key in ordered_unique_key_digests(key_map.values()):
            try:
                return _decrypt_v2(payload, kid=kid, key=fallback_key)
            except Exception:
                continue
        raise ValueError("Неподдерживаемый идентификатор ключа шифрования")

    return _decrypt_legacy(encoded, ordered_unique_key_digests(key_map.values()))
