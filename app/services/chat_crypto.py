from __future__ import annotations

import base64
import hashlib
import hmac
import secrets

from app.core.config import settings

_VERSION = b"v1"
_PREFIX = "chatenc:v1:"


def _encryption_secret() -> str:
    chat_secret = str(settings.CHAT_ENCRYPTION_SECRET or "").strip()
    if chat_secret:
        return chat_secret
    fallback = str(settings.DATA_ENCRYPTION_SECRET or "").strip()
    if fallback:
        return fallback
    fallback = str(settings.ADMIN_JWT_SECRET or "").strip()
    if fallback:
        return fallback
    fallback = str(settings.PUBLIC_JWT_SECRET or "").strip()
    if fallback:
        return fallback
    raise ValueError("Не задан секрет шифрования чата")


def _key() -> bytes:
    return hashlib.sha256(_encryption_secret().encode("utf-8")).digest()


def _xor_bytes(a: bytes, b: bytes) -> bytes:
    return bytes(x ^ y for x, y in zip(a, b))


def is_encrypted_message(value: str | None) -> bool:
    token = str(value or "").strip()
    return token.startswith(_PREFIX)


def encrypt_message_body(value: str | None) -> str | None:
    if value is None:
        return None
    text = str(value)
    if not text:
        return text
    if is_encrypted_message(text):
        return text
    raw = text.encode("utf-8")
    nonce = secrets.token_bytes(16)
    stream = hashlib.pbkdf2_hmac("sha256", _key(), nonce, 120_000, dklen=len(raw))
    cipher = _xor_bytes(raw, stream)
    tag = hmac.new(_key(), _VERSION + nonce + cipher, hashlib.sha256).digest()
    token = _VERSION + nonce + tag + cipher
    return _PREFIX + base64.urlsafe_b64encode(token).decode("ascii")


def decrypt_message_body(value: str | None) -> str | None:
    if value is None:
        return None
    text = str(value)
    if not text:
        return text
    if not is_encrypted_message(text):
        return text
    encoded = text[len(_PREFIX) :]
    blob = base64.urlsafe_b64decode(encoded.encode("ascii"))
    if len(blob) < 2 + 16 + 32:
        raise ValueError("Некорректный зашифрованный формат сообщения")
    version = blob[:2]
    nonce = blob[2:18]
    tag = blob[18:50]
    cipher = blob[50:]
    if version != _VERSION:
        raise ValueError("Неподдерживаемая версия шифрования чата")
    expected = hmac.new(_key(), version + nonce + cipher, hashlib.sha256).digest()
    if not hmac.compare_digest(tag, expected):
        raise ValueError("Поврежденные данные сообщения")
    stream = hashlib.pbkdf2_hmac("sha256", _key(), nonce, 120_000, dklen=len(cipher))
    raw = _xor_bytes(cipher, stream)
    return raw.decode("utf-8")
