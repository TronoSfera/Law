from __future__ import annotations

import secrets
import hashlib
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_jwt, hash_password, verify_password
from app.db.session import get_db
from app.models.otp_session import OtpSession
from app.models.request import Request as RequestModel
from app.schemas.public import OtpSend, OtpVerify
from app.services.rate_limit import get_rate_limiter

router = APIRouter()

OTP_TTL_MINUTES = 10
OTP_MAX_ATTEMPTS = 5
OTP_CREATE_PURPOSE = "CREATE_REQUEST"
OTP_VIEW_PURPOSE = "VIEW_REQUEST"
ALLOWED_PURPOSES = {OTP_CREATE_PURPOSE, OTP_VIEW_PURPOSE}


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(dt: datetime | None) -> datetime:
    if dt is None:
        return _now_utc()
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _normalize_purpose(raw: str | None) -> str:
    return str(raw or "").strip().upper()


def _normalize_phone(raw: str | None) -> str:
    phone = str(raw or "").strip()
    if not phone:
        return ""
    allowed = {"+", "(", ")", "-", " "}
    digits = [ch for ch in phone if ch.isdigit() or ch in allowed]
    return "".join(digits).strip()


def _normalize_track(raw: str | None) -> str:
    return str(raw or "").strip().upper()


def _generate_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def _client_ip(request: Request) -> str:
    xff = str(request.headers.get("x-forwarded-for") or "").strip()
    if xff:
        first = xff.split(",")[0].strip()
        if first:
            return first
    client = request.client
    return str(client.host if client else "unknown")


def _hash_key_part(value: str | None) -> str:
    raw = str(value or "").strip()
    if not raw:
        return "-"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:20]


def _rate_limit_or_429(action: str, *, purpose: str, client_ip: str, phone: str | None, track_number: str | None) -> None:
    limiter = get_rate_limiter()
    window = int(max(settings.OTP_RATE_LIMIT_WINDOW_SECONDS, 1))
    limit = int(max(settings.OTP_SEND_RATE_LIMIT if action == "send" else settings.OTP_VERIFY_RATE_LIMIT, 1))
    purpose_norm = str(purpose or "").strip().upper()
    keys = [
        f"otp:{action}:ip:{_hash_key_part(client_ip)}:purpose:{purpose_norm}",
    ]
    if phone:
        keys.append(f"otp:{action}:phone:{_hash_key_part(phone)}:purpose:{purpose_norm}")
    if track_number:
        keys.append(f"otp:{action}:track:{_hash_key_part(track_number)}:purpose:{purpose_norm}")

    for key in keys:
        result = limiter.hit(key, limit=limit, window_seconds=window)
        if not result.allowed:
            raise HTTPException(
                status_code=429,
                detail=f"Слишком много OTP-запросов. Повторите через {max(result.retry_after_seconds, 1)} сек.",
            )


def _set_public_cookie(response: Response, *, subject: str, purpose: str) -> None:
    token = create_jwt(
        {"sub": subject, "purpose": purpose},
        settings.PUBLIC_JWT_SECRET,
        timedelta(days=settings.PUBLIC_JWT_TTL_DAYS),
    )
    response.set_cookie(
        key=settings.PUBLIC_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=settings.PUBLIC_JWT_TTL_DAYS * 24 * 3600,
    )


def _mock_sms_send(phone: str, code: str, purpose: str, track_number: str | None = None) -> dict:
    # Dev-only behavior: emit OTP in console instead of sending real SMS.
    print(f"[OTP MOCK] purpose={purpose} phone={phone} track={track_number or '-'} code={code}")
    return {
        "provider": "mock_sms",
        "status": "accepted",
        "message": "SMS provider response mocked",
    }


@router.post("/send")
def send_otp(payload: OtpSend, request: Request, db: Session = Depends(get_db)):
    purpose = _normalize_purpose(payload.purpose)
    if purpose not in ALLOWED_PURPOSES:
        raise HTTPException(status_code=400, detail="Некорректная цель OTP")

    track_number: str | None = None
    phone = ""
    if purpose == OTP_CREATE_PURPOSE:
        phone = _normalize_phone(payload.client_phone)
        if not phone:
            raise HTTPException(status_code=400, detail='Поле "client_phone" обязательно для CREATE_REQUEST')
    else:
        track_number = _normalize_track(payload.track_number)
        if not track_number:
            raise HTTPException(status_code=400, detail='Поле "track_number" обязательно для VIEW_REQUEST')
        request_row = db.query(RequestModel).filter(RequestModel.track_number == track_number).first()
        if request_row is None:
            raise HTTPException(status_code=404, detail="Заявка не найдена")
        phone = _normalize_phone(request_row.client_phone)
        if not phone:
            raise HTTPException(status_code=400, detail="У заявки отсутствует номер телефона")

    _rate_limit_or_429(
        "send",
        purpose=purpose,
        client_ip=_client_ip(request),
        phone=phone or None,
        track_number=track_number,
    )

    code = _generate_code()
    now = _now_utc()
    expires_at = now + timedelta(minutes=OTP_TTL_MINUTES)

    existing_query = db.query(OtpSession).filter(
        OtpSession.purpose == purpose,
        OtpSession.phone == phone,
        OtpSession.track_number == track_number,
    )
    existing_query.delete(synchronize_session=False)

    row = OtpSession(
        purpose=purpose,
        track_number=track_number,
        phone=phone,
        code_hash=hash_password(code),
        attempts=0,
        expires_at=expires_at,
        responsible="Система OTP",
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    sms_response = _mock_sms_send(phone, code, purpose, track_number)
    return {
        "status": "sent",
        "purpose": purpose,
        "track_number": track_number,
        "ttl_seconds": OTP_TTL_MINUTES * 60,
        "sms_response": sms_response,
    }


@router.post("/verify")
def verify_otp(payload: OtpVerify, request: Request, response: Response, db: Session = Depends(get_db)):
    purpose = _normalize_purpose(payload.purpose)
    if purpose not in ALLOWED_PURPOSES:
        raise HTTPException(status_code=400, detail="Некорректная цель OTP")

    track_number: str | None = None
    phone: str | None = None
    if purpose == OTP_CREATE_PURPOSE:
        phone = _normalize_phone(payload.client_phone)
        if not phone:
            raise HTTPException(status_code=400, detail='Поле "client_phone" обязательно для CREATE_REQUEST')
    else:
        track_number = _normalize_track(payload.track_number)
        if not track_number:
            raise HTTPException(status_code=400, detail='Поле "track_number" обязательно для VIEW_REQUEST')

    _rate_limit_or_429(
        "verify",
        purpose=purpose,
        client_ip=_client_ip(request),
        phone=phone,
        track_number=track_number,
    )

    query = db.query(OtpSession).filter(
        OtpSession.purpose == purpose,
        OtpSession.track_number == track_number,
    )
    if phone is not None:
        query = query.filter(OtpSession.phone == phone)

    row = query.order_by(OtpSession.created_at.desc()).first()
    if row is None:
        raise HTTPException(status_code=400, detail="OTP не найден или истек")

    now = _now_utc()
    if _as_utc(row.expires_at) <= now:
        db.delete(row)
        db.commit()
        raise HTTPException(status_code=400, detail="OTP не найден или истек")

    if int(row.attempts or 0) >= OTP_MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Превышено количество попыток")

    code = str(payload.code or "").strip()
    if not code or not verify_password(code, row.code_hash):
        row.attempts = int(row.attempts or 0) + 1
        db.add(row)
        db.commit()
        raise HTTPException(status_code=400, detail="Неверный OTP-код")

    subject = row.phone if purpose == OTP_CREATE_PURPOSE else str(row.track_number or "")
    if not subject:
        raise HTTPException(status_code=400, detail="Некорректная OTP-сессия")

    _set_public_cookie(response, subject=subject, purpose=purpose)

    db.delete(row)
    db.commit()
    return {"status": "verified", "purpose": purpose}
