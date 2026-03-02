from __future__ import annotations

from urllib.parse import urlsplit

from fastapi import HTTPException, Request

from app.core.config import settings


def _origin_from_header(value: str | None) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    parts = urlsplit(raw)
    if not parts.scheme or not parts.netloc:
        return ""
    return f"{parts.scheme.lower()}://{parts.netloc.lower()}".rstrip("/")


def _sec_fetch_site(value: str | None) -> str:
    return str(value or "").strip().lower()


def enforce_public_origin_or_403(request: Request, *, endpoint: str) -> None:
    if not bool(getattr(settings, "PUBLIC_STRICT_ORIGIN_CHECK", True)):
        return
    if not bool(getattr(settings, "app_env_is_production", False)):
        return

    fetch_site = _sec_fetch_site(request.headers.get("sec-fetch-site"))
    if fetch_site == "cross-site":
        raise HTTPException(status_code=403, detail=f"Forbidden origin for {endpoint}")

    allowed = set(settings.public_allowed_web_origins_list)
    if not allowed:
        raise HTTPException(status_code=500, detail="Не настроен список разрешенных public-origin")

    origin = _origin_from_header(request.headers.get("origin"))
    if not origin:
        origin = _origin_from_header(request.headers.get("referer"))
    if not origin:
        raise HTTPException(status_code=403, detail=f"Forbidden origin for {endpoint}")
    if origin not in allowed:
        raise HTTPException(status_code=403, detail=f"Forbidden origin for {endpoint}")
