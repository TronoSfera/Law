from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.deps import require_role
from app.services.email_service import email_provider_health
from app.services.sms_service import sms_provider_health

router = APIRouter()


@router.get("/sms-provider-health")
def get_sms_provider_health(admin: dict = Depends(require_role("ADMIN"))):
    _ = admin
    return sms_provider_health()


@router.get("/email-provider-health")
def get_email_provider_health(admin: dict = Depends(require_role("ADMIN"))):
    _ = admin
    return email_provider_health()
