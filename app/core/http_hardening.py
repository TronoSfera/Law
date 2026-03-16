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
    "Content-Security-Policy": (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self'; "
        "connect-src 'self'; "
        "img-src 'self' data: blob:; "
        "font-src 'self' data:; "
        "object-src 'none'; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self'"
    ),
}

FRAMEABLE_FILE_SECURITY_HEADERS = {
    **SECURITY_HEADERS,
    "X-Frame-Options": "SAMEORIGIN",
    "Content-Security-Policy": (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self'; "
        "connect-src 'self'; "
        "img-src 'self' data: blob:; "
        "font-src 'self' data:; "
        "object-src 'none'; "
        "frame-ancestors 'self'; "
        "base-uri 'self'; "
        "form-action 'self'"
    ),
}

_FRAMEABLE_PATH_PATTERNS = (
    re.compile(r"^/api/public/uploads/object/"),
    re.compile(r"^/api/admin/uploads/object/"),
    re.compile(r"^/api/public/requests/[^/]+/invoices/[^/]+/pdf$"),
    re.compile(r"^/api/admin/invoices/[^/]+/pdf$"),
)

_PERF_PATH_PATTERNS = (
    ("admin_kanban", re.compile(r"^/api/admin/requests/kanban$")),
    ("admin_request_detail", re.compile(r"^/api/admin/crud/requests/[^/]+$")),
    ("admin_chat_messages", re.compile(r"^/api/admin/chat/requests/[^/]+/messages$")),
    ("admin_chat_live", re.compile(r"^/api/admin/chat/requests/[^/]+/live$")),
    ("admin_request_status_route", re.compile(r"^/api/admin/requests/[^/]+/status-route$")),
    ("admin_request_attachments_query", re.compile(r"^/api/admin/crud/attachments/query$")),
    ("admin_request_invoices_query", re.compile(r"^/api/admin/invoices/query$")),
    ("public_request_detail", re.compile(r"^/api/public/requests/[^/]+$")),
    ("public_chat_messages", re.compile(r"^/api/public/chat/requests/[^/]+/messages$")),
    ("public_chat_live", re.compile(r"^/api/public/chat/requests/[^/]+/live$")),
    ("public_request_attachments", re.compile(r"^/api/public/requests/[^/]+/attachments$")),
    ("public_request_invoices", re.compile(r"^/api/public/requests/[^/]+/invoices$")),
    ("public_request_status_route", re.compile(r"^/api/public/requests/[^/]+/status-route$")),
    ("public_request_service_requests", re.compile(r"^/api/public/requests/[^/]+/service-requests$")),
)


def _request_id_from_header(raw: str | None) -> str:
    value = str(raw or "").strip()
    if not value:
        return uuid4().hex
    if not _REQUEST_ID_RE.fullmatch(value):
        return uuid4().hex
    return value


def _response_security_headers(request: Request) -> dict[str, str]:
    method = str(request.method or "").upper()
    path = str(request.url.path or "")
    if method in {"GET", "HEAD"} and any(pattern.search(path) for pattern in _FRAMEABLE_PATH_PATTERNS):
        return FRAMEABLE_FILE_SECURITY_HEADERS
    return SECURITY_HEADERS


def _performance_label(request: Request) -> str | None:
    method = str(request.method or "").upper()
    if method not in {"GET", "POST"}:
        return None
    path = str(request.url.path or "")
    for label, pattern in _PERF_PATH_PATTERNS:
        if pattern.search(path):
            return label
    return None


def install_http_hardening(app: FastAPI) -> None:
    @app.middleware("http")
    async def _http_hardening_middleware(request: Request, call_next):
        request_id = _request_id_from_header(request.headers.get(REQUEST_ID_HEADER))
        request.state.request_id = request_id
        started_at = perf_counter()

        response = await call_next(request)

        for key, value in _response_security_headers(request).items():
            response.headers[key] = value
        # Backend serves application data and operational endpoints only.
        # Keep responses non-cacheable to avoid stale or sensitive data reuse.
        response.headers["Cache-Control"] = "no-store"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        response.headers[REQUEST_ID_HEADER] = request_id

        duration_ms = (perf_counter() - started_at) * 1000.0
        perf_label = _performance_label(request)
        if perf_label:
            response.headers["Server-Timing"] = f'app;desc="{perf_label}";dur={duration_ms:.2f}'
            response.headers["X-Perf-Label"] = perf_label
            response.headers["X-Perf-Duration-Ms"] = f"{duration_ms:.2f}"
        _LOG.info(
            "%s %s status=%s duration_ms=%.2f request_id=%s perf_label=%s",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
            request_id,
            perf_label or "-",
        )
        return response
