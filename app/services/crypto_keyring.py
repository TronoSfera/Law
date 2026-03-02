from __future__ import annotations

import hashlib
from typing import Iterable

from app.core.config import settings


def _normalize_kid(raw: str | None) -> str:
    value = str(raw or "").strip().lower()
    if not value:
        return ""
    out = []
    for ch in value:
        if ch.isalnum() or ch in {"_", "-", "."}:
            out.append(ch)
    return "".join(out)[:64]


def _parse_kid_secret_map(raw: str | None) -> dict[str, str]:
    values: dict[str, str] = {}
    for chunk in str(raw or "").split(","):
        token = str(chunk or "").strip()
        if not token:
            continue
        if "=" not in token:
            continue
        kid_raw, secret_raw = token.split("=", 1)
        kid = _normalize_kid(kid_raw)
        secret = str(secret_raw or "").strip()
        if not kid or not secret:
            continue
        values[kid] = secret
    return values


def _primary_data_secret() -> str:
    for candidate in (
        str(settings.DATA_ENCRYPTION_SECRET or "").strip(),
        str(settings.ADMIN_JWT_SECRET or "").strip(),
        str(settings.PUBLIC_JWT_SECRET or "").strip(),
    ):
        if candidate:
            return candidate
    return ""


def get_data_secrets() -> tuple[str, dict[str, str]]:
    key_map = _parse_kid_secret_map(getattr(settings, "DATA_ENCRYPTION_KEYS", ""))
    legacy = _primary_data_secret()
    if legacy:
        key_map.setdefault("legacy", legacy)

    active_raw = _normalize_kid(getattr(settings, "DATA_ENCRYPTION_ACTIVE_KID", ""))
    active_kid = active_raw or ("legacy" if "legacy" in key_map else "")

    if not key_map and legacy:
        active_kid = active_kid or "legacy"
        key_map[active_kid] = legacy

    if active_kid and active_kid not in key_map and legacy:
        key_map[active_kid] = legacy

    if not key_map:
        raise ValueError("Не заданы ключи шифрования DATA")

    if not active_kid:
        active_kid = next(iter(key_map.keys()))

    return active_kid, key_map


def get_chat_secrets() -> tuple[str, dict[str, str]]:
    key_map = _parse_kid_secret_map(getattr(settings, "CHAT_ENCRYPTION_KEYS", ""))
    chat_legacy = str(settings.CHAT_ENCRYPTION_SECRET or "").strip()
    if chat_legacy:
        key_map.setdefault("legacy", chat_legacy)

    data_active, data_map = get_data_secrets()
    for kid, secret in data_map.items():
        key_map.setdefault(kid, secret)

    active_raw = _normalize_kid(getattr(settings, "CHAT_ENCRYPTION_ACTIVE_KID", ""))
    active_kid = active_raw or data_active

    if active_kid and active_kid not in key_map and chat_legacy:
        key_map[active_kid] = chat_legacy

    if active_kid and active_kid not in key_map and active_kid in data_map:
        key_map[active_kid] = data_map[active_kid]

    if not key_map:
        raise ValueError("Не заданы ключи шифрования CHAT")

    if not active_kid:
        active_kid = next(iter(key_map.keys()))

    if active_kid not in key_map:
        key_map[active_kid] = next(iter(key_map.values()))

    return active_kid, key_map


def key_digest(secret: str) -> bytes:
    return hashlib.sha256(str(secret or "").encode("utf-8")).digest()


def ordered_unique_key_digests(secrets: Iterable[str]) -> list[bytes]:
    digests: list[bytes] = []
    seen: set[bytes] = set()
    for secret in secrets:
        digest = key_digest(secret)
        if digest in seen:
            continue
        seen.add(digest)
        digests.append(digest)
    return digests
