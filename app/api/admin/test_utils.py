from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import require_role
from app.db.session import get_db
from app.services.test_data_cleanup import CleanupSpec, cleanup_test_data


router = APIRouter()


class TestDataCleanupPayload(BaseModel):
    track_numbers: list[str] = Field(default_factory=list)
    phones: list[str] = Field(default_factory=list)
    emails: list[str] = Field(default_factory=list)
    include_default_e2e_patterns: bool = True


def _guard_local_only() -> None:
    env = str(settings.APP_ENV or "").strip().lower()
    if env in {"prod", "production"}:
        raise HTTPException(status_code=404, detail="Not found")


@router.post("/cleanup-test-data")
def cleanup_test_data_endpoint(
    payload: TestDataCleanupPayload,
    db: Session = Depends(get_db),
    admin: dict[str, Any] = Depends(require_role("ADMIN")),
):
    _guard_local_only()
    counts = cleanup_test_data(
        db,
        CleanupSpec(
            track_numbers=payload.track_numbers,
            phones=payload.phones,
            emails=payload.emails,
            include_default_e2e_patterns=bool(payload.include_default_e2e_patterns),
        ),
    )
    return {
        "status": "ok",
        "environment": settings.APP_ENV,
        "requested_by": str(admin.get("email") or admin.get("sub") or ""),
        "deleted": counts,
    }
