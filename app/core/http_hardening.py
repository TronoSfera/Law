from __future__ import annotations

import logging
import re
from time import perf_counter
from uuid import uuid4

from fastapi import FastAPI, Request

REQUEST_ID_HEADER = "X-Request-ID"
_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._-]{1,128}$")
_LOG = logging.getLogger("app.http")

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "X-Permitted-Cross-Domain-Policies": "none",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "credentialless",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=(), payment=(), usb=()",
    "Content-Security-Policy": "default-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
}


def _request_id_from_header(raw: str | None) -> str:
    value = str(raw or "").strip()
    if not value:
        return uuid4().hex
    if not _REQUEST_ID_RE.fullmatch(value):
        return uuid4().hex
    return value


def install_http_hardening(app: FastAPI) -> None:
    @app.middleware("http")
    async def _http_hardening_middleware(request: Request, call_next):
        request_id = _request_id_from_header(request.headers.get(REQUEST_ID_HEADER))
        request.state.request_id = request_id
        started_at = perf_counter()

        response = await call_next(request)

        for key, value in SECURITY_HEADERS.items():
            response.headers[key] = value
        # Backend serves application data and operational endpoints only.
        # Keep responses non-cacheable to avoid stale or sensitive data reuse.
        response.headers["Cache-Control"] = "no-store"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        response.headers[REQUEST_ID_HEADER] = request_id

        duration_ms = (perf_counter() - started_at) * 1000.0
        _LOG.info(
            "%s %s status=%s duration_ms=%.2f request_id=%s",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
            request_id,
        )
        return response
