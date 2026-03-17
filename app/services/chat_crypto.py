from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.services.crypto_keyring import get_chat_secrets, key_digest, ordered_unique_key_digests

_VERSION_LEGACY = b"v1"
_PREFIX_LEGACY = "chatenc:v1:"
_PREFIX_V2 = "chatenc:v2:"
_PREFIX_V3 = "chatenc:v3:"
_CHAT_CRYPTO_EXTRA_FIELDS_KEY = "chat_crypto"


def _xor_bytes(a: bytes, b: bytes) -> bytes:
    return bytes(x ^ y for x, y in zip(a, b))


def _urlsafe_b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii")


def _urlsafe_b64decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(str(value or "").encode("ascii"))


def _aad_v2(kid: str) -> bytes:
    return b"v2|" + str(kid).encode("utf-8") + b"|"


def _aad_v3_message(kid: str) -> bytes:
    return b"v3|message|" + str(kid).encode("utf-8") + b"|"


def _aad_v3_wrapped_key(kid: str) -> bytes:
    return b"v3|chat-key|" + str(kid).encode("utf-8") + b"|"


def active_chat_kid() -> str:
    active_kid, _ = get_chat_secrets()
    return active_kid


def _active_chat_secret() -> tuple[str, str]:
    active_kid, key_map = get_chat_secrets()
    active_secret = key_map.get(active_kid)
    if not active_secret and key_map:
        active_secret = next(iter(key_map.values()))
    if not active_secret:
        raise ValueError("Не найден активный ключ шифрования чата")
    return active_kid, active_secret


def _chat_payload_or_none(extra_fields: dict[str, Any] | None) -> dict[str, Any] | None:
    payload = (extra_fields or {}).get(_CHAT_CRYPTO_EXTRA_FIELDS_KEY)
    return payload if isinstance(payload, dict) else None


def _wrap_chat_key(chat_key: bytes, *, kid: str, secret: str) -> dict[str, Any]:
    nonce = secrets.token_bytes(12)
    payload = AESGCM(key_digest(secret)).encrypt(nonce, chat_key, _aad_v3_wrapped_key(kid))
    return {
        "version": 1,
        "kek_kid": str(kid),
        "nonce": _urlsafe_b64encode(nonce),
        "wrapped_key": _urlsafe_b64encode(payload),
    }


def _unwrap_chat_key(payload: dict[str, Any], *, key_map: dict[str, str]) -> tuple[bytes, str]:
    if int(payload.get("version") or 0) != 1:
        raise ValueError("Неподдерживаемая версия ключа чата")
    kid = str(payload.get("kek_kid") or "").strip()
    nonce = _urlsafe_b64decode(str(payload.get("nonce") or ""))
    wrapped_key = _urlsafe_b64decode(str(payload.get("wrapped_key") or ""))
    if len(nonce) != 12 or not wrapped_key:
        raise ValueError("Некорректный формат ключа чата")

    candidate_secrets: list[tuple[str, str]] = []
    if kid and kid in key_map:
        candidate_secrets.append((kid, key_map[kid]))
    for fallback_kid, secret in key_map.items():
        if kid and fallback_kid == kid:
            continue
        candidate_secrets.append((fallback_kid, secret))

    for candidate_kid, secret in candidate_secrets:
        try:
            plaintext = AESGCM(key_digest(secret)).decrypt(nonce, wrapped_key, _aad_v3_wrapped_key(kid or candidate_kid))
        except Exception:
            continue
        if len(plaintext) not in {16, 24, 32}:
            raise ValueError("Некорректная длина ключа чата")
        return plaintext, (kid or candidate_kid)
    raise ValueError("Не удалось расшифровать ключ чата")


def extract_message_kid(value: str | None) -> str | None:
    token = str(value or "").strip()
    if not token:
        return None
    if token.startswith(_PREFIX_V2) or token.startswith(_PREFIX_V3):
        parts = token.split(":", 3)
        if len(parts) != 4:
            return None
        kid = str(parts[2] or "").strip()
        return kid or None
    return None


def is_encrypted_message(value: str | None) -> bool:
    token = str(value or "").strip()
    return token.startswith(_PREFIX_LEGACY) or token.startswith(_PREFIX_V2) or token.startswith(_PREFIX_V3)


def prepare_request_chat_crypto(extra_fields: dict[str, Any] | None) -> tuple[dict[str, Any], bytes, bool]:
    active_kid, key_map = get_chat_secrets()
    updated = dict(extra_fields or {})
    payload = _chat_payload_or_none(updated)
    chat_key: bytes | None = None
    payload_kid = active_kid
    changed = False

    if payload:
        try:
            chat_key, payload_kid = _unwrap_chat_key(payload, key_map=key_map)
        except Exception:
            chat_key = None

    if chat_key is None:
        chat_key = secrets.token_bytes(32)
        changed = True

    if changed or payload_kid != active_kid or payload != _chat_payload_or_none(updated):
        active_secret = key_map.get(active_kid)
        if not active_secret:
            raise ValueError("Не найден активный ключ шифрования чата")
        updated[_CHAT_CRYPTO_EXTRA_FIELDS_KEY] = _wrap_chat_key(chat_key, kid=active_kid, secret=active_secret)
        changed = True

    return updated, chat_key, changed


def _request_chat_key(extra_fields: dict[str, Any] | None) -> tuple[bytes, str]:
    payload = _chat_payload_or_none(extra_fields)
    if not payload:
        raise ValueError("Не найден ключ шифрования чата для заявки")
    key_map = get_chat_secrets()[1]
    chat_key, payload_kid = _unwrap_chat_key(payload, key_map=key_map)
    return chat_key, payload_kid


def encrypt_message_body(value: str | None) -> str | None:
    if value is None:
        return None
    text = str(value)
    if not text or is_encrypted_message(text):
        return text

    active_kid, active_secret = _active_chat_secret()
    key = key_digest(active_secret)

    raw = text.encode("utf-8")
    nonce = secrets.token_bytes(16)
    stream = hashlib.pbkdf2_hmac("sha256", key, nonce, 120_000, dklen=len(raw))
    cipher = _xor_bytes(raw, stream)
    tag = hmac.new(key, _aad_v2(active_kid) + nonce + cipher, hashlib.sha256).digest()
    blob = nonce + tag + cipher
    return f"{_PREFIX_V2}{active_kid}:" + _urlsafe_b64encode(blob)


def encrypt_message_body_for_request(
    value: str | None,
    *,
    request_extra_fields: dict[str, Any] | None,
) -> tuple[str | None, dict[str, Any], bool]:
    if value is None:
        return None, dict(request_extra_fields or {}), False
    text = str(value)
    if not text or is_encrypted_message(text):
        return text, dict(request_extra_fields or {}), False

    updated_extra_fields, chat_key, changed = prepare_request_chat_crypto(request_extra_fields)
    kid = str(extract_request_chat_kek_kid(updated_extra_fields) or active_chat_kid())
    nonce = secrets.token_bytes(12)
    cipher = AESGCM(chat_key).encrypt(nonce, text.encode("utf-8"), _aad_v3_message(kid))
    return f"{_PREFIX_V3}{kid}:" + _urlsafe_b64encode(nonce + cipher), updated_extra_fields, changed


def extract_request_chat_kek_kid(extra_fields: dict[str, Any] | None) -> str | None:
    payload = _chat_payload_or_none(extra_fields)
    if not payload:
        return None
    kid = str(payload.get("kek_kid") or "").strip()
    return kid or None


def _decrypt_v2(encoded: str, *, kid: str, key: bytes) -> str:
    blob = _urlsafe_b64decode(encoded)
    if len(blob) < 16 + 32:
        raise ValueError("Некорректный зашифрованный формат сообщения")
    nonce = blob[:16]
    tag = blob[16:48]
    cipher = blob[48:]
    expected = hmac.new(key, _aad_v2(kid) + nonce + cipher, hashlib.sha256).digest()
    if not hmac.compare_digest(tag, expected):
        raise ValueError("Поврежденные данные сообщения")
    stream = hashlib.pbkdf2_hmac("sha256", key, nonce, 120_000, dklen=len(cipher))
    raw = _xor_bytes(cipher, stream)
    return raw.decode("utf-8")


def _decrypt_v3(encoded: str, *, kid: str, request_extra_fields: dict[str, Any] | None) -> str:
    chat_key, _ = _request_chat_key(request_extra_fields)
    blob = _urlsafe_b64decode(encoded)
    if len(blob) <= 12:
        raise ValueError("Некорректный зашифрованный формат сообщения")
    nonce = blob[:12]
    cipher = blob[12:]
    raw = AESGCM(chat_key).decrypt(nonce, cipher, _aad_v3_message(kid))
    return raw.decode("utf-8")


def _decrypt_legacy(encoded: str, keys: list[bytes]) -> str:
    blob = _urlsafe_b64decode(encoded)
    if len(blob) < 2 + 16 + 32:
        raise ValueError("Некорректный зашифрованный формат сообщения")
    version = blob[:2]
    nonce = blob[2:18]
    tag = blob[18:50]
    cipher = blob[50:]
    if version != _VERSION_LEGACY:
        raise ValueError("Неподдерживаемая версия шифрования чата")

    for key in keys:
        expected = hmac.new(key, version + nonce + cipher, hashlib.sha256).digest()
        if not hmac.compare_digest(tag, expected):
            continue
        stream = hashlib.pbkdf2_hmac("sha256", key, nonce, 120_000, dklen=len(cipher))
        raw = _xor_bytes(cipher, stream)
        return raw.decode("utf-8")

    raise ValueError("Поврежденные данные сообщения")


def decrypt_message_body(value: str | None) -> str | None:
    if value is None:
        return None
    text = str(value)
    if not text:
        return text
    if not is_encrypted_message(text):
        return text

    active_kid, key_map = get_chat_secrets()
    _ = active_kid
    if text.startswith(_PREFIX_V3):
        raise ValueError("Для сообщений v3 требуется контекст заявки")
    if text.startswith(_PREFIX_V2):
        encoded = text[len(_PREFIX_V2) :]
        parts = encoded.split(":", 1)
        if len(parts) != 2:
            raise ValueError("Некорректный зашифрованный формат сообщения")
        kid, payload = str(parts[0] or "").strip(), parts[1]
        if kid in key_map:
            return _decrypt_v2(payload, kid=kid, key=key_digest(key_map[kid]))
        for fallback_key in ordered_unique_key_digests(key_map.values()):
            try:
                return _decrypt_v2(payload, kid=kid, key=fallback_key)
            except Exception:
                continue
        raise ValueError("Неподдерживаемый идентификатор ключа шифрования")

    encoded = text[len(_PREFIX_LEGACY) :]
    return _decrypt_legacy(encoded, ordered_unique_key_digests(key_map.values()))


def decrypt_message_body_for_request(
    value: str | None,
    *,
    request_extra_fields: dict[str, Any] | None,
) -> str | None:
    if value is None:
        return None
    text = str(value)
    if not text or not is_encrypted_message(text):
        return text
    if text.startswith(_PREFIX_V3):
        encoded = text[len(_PREFIX_V3) :]
        parts = encoded.split(":", 1)
        if len(parts) != 2:
            raise ValueError("Некорректный зашифрованный формат сообщения")
        kid, payload = str(parts[0] or "").strip(), parts[1]
        return _decrypt_v3(payload, kid=kid, request_extra_fields=request_extra_fields)
    return decrypt_message_body(text)
