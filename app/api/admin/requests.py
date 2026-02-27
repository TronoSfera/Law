"""Backward-compatible entrypoint for Admin Requests router.

Implementation moved to app.api.admin.requests_modules.
"""

from app.api.admin.requests_modules.router import router

__all__ = ["router"]
