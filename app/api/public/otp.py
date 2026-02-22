from fastapi import APIRouter, Response
from datetime import timedelta
from app.schemas.public import OtpSend, OtpVerify
from app.core.config import settings
from app.core.security import create_jwt

router = APIRouter()

@router.post("/send")
def send_otp(payload: OtpSend):
    return {"status": "sent"}

@router.post("/verify")
def verify_otp(payload: OtpVerify, response: Response):
    token = create_jwt({"sub": payload.track_number or "unknown", "purpose": payload.purpose},
                       settings.PUBLIC_JWT_SECRET, timedelta(days=settings.PUBLIC_JWT_TTL_DAYS))
    response.set_cookie(
        key=settings.PUBLIC_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=settings.PUBLIC_JWT_TTL_DAYS * 24 * 3600,
    )
    return {"status": "verified"}
