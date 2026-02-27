"""Backward-compatible entrypoint for Admin CRUD router.

Implementation moved to app.api.admin.crud_modules.
"""

from app.api.admin.crud_modules.router import router

__all__ = ["router"]
