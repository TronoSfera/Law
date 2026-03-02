from __future__ import annotations

import base64
import hashlib
import hmac
import secrets

from app.services.crypto_keyring import get_chat_secrets, key_digest, ordered_unique_key_digests

_VERSION_LEGACY = b"v1"
_PREFIX_LEGACY = "chatenc:v1:"
_PREFIX_V2 = "chatenc:v2:"


def _xor_bytes(a: bytes, b: bytes) -> bytes:
    return bytes(x ^ y for x, y in zip(a, b))


def _aad_v2(kid: str) -> bytes:
    return b"v2|" + str(kid).encode("utf-8") + b"|"


def active_chat_kid() -> str:
    active_kid, _ = get_chat_secrets()
    return active_kid


def extract_message_kid(value: str | None) -> str | None:
    token = str(value or "").strip()
    if not token:
        return None
    if token.startswith(_PREFIX_V2):
        parts = token.split(":", 3)
        if len(parts) != 4:
            return None
        kid = str(parts[2] or "").strip()
        return kid or None
    return None


def is_encrypted_message(value: str | None) -> bool:
    token = str(value or "").strip()
    return token.startswith(_PREFIX_LEGACY) or token.startswith(_PREFIX_V2)


def encrypt_message_body(value: str | None) -> str | None:
    if value is None:
        return None
    text = str(value)
    if not text:
        return text
    if is_encrypted_message(text):
        return text

    active_kid, key_map = get_chat_secrets()
    active_secret = key_map.get(active_kid)
    if not active_secret:
        raise ValueError("Не найден активный ключ шифрования чата")
    key = key_digest(active_secret)

    raw = text.encode("utf-8")
    nonce = secrets.token_bytes(16)
    stream = hashlib.pbkdf2_hmac("sha256", key, nonce, 120_000, dklen=len(raw))
    cipher = _xor_bytes(raw, stream)
    tag = hmac.new(key, _aad_v2(active_kid) + nonce + cipher, hashlib.sha256).digest()
    blob = nonce + tag + cipher
    return f"{_PREFIX_V2}{active_kid}:" + base64.urlsafe_b64encode(blob).decode("ascii")


def _decrypt_v2(encoded: str, *, kid: str, key: bytes) -> str:
    blob = base64.urlsafe_b64decode(encoded.encode("ascii"))
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


def _decrypt_legacy(encoded: str, keys: list[bytes]) -> str:
    blob = base64.urlsafe_b64decode(encoded.encode("ascii"))
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
