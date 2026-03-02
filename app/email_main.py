from __future__ import annotations

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

from app.core.config import settings, validate_production_security_or_raise
from app.services.email_service import EmailDeliveryError, send_email_via_smtp

app = FastAPI(title="law-email-service")


class InternalEmailSend(BaseModel):
    email: str
    subject: str
    body: str


@app.on_event("startup")
def _validate_security_config_on_startup() -> None:
    if not bool(getattr(settings, "EMAIL_SERVICE_ENABLED", True)):
        return
    validate_production_security_or_raise("email-service")


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "email-service",
        "enabled": bool(getattr(settings, "EMAIL_SERVICE_ENABLED", True)),
    }


@app.post("/internal/send-otp")
def internal_send_otp(payload: InternalEmailSend, x_internal_token: str | None = Header(default=None)):
    if not bool(getattr(settings, "EMAIL_SERVICE_ENABLED", True)):
        raise HTTPException(status_code=503, detail="Email service disabled")
    expected = str(settings.INTERNAL_SERVICE_TOKEN or "").strip()
    if not expected:
        raise HTTPException(status_code=500, detail="INTERNAL_SERVICE_TOKEN не настроен")
    if str(x_internal_token or "").strip() != expected:
        raise HTTPException(status_code=401, detail="Недействительный internal token")
    try:
        result = send_email_via_smtp(email=payload.email, subject=payload.subject, body=payload.body)
    except EmailDeliveryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"status": "sent", "result": result}
