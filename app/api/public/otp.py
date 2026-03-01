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
from app.services.email_service import EmailDeliveryError, send_otp_email_message
from app.services.rate_limit import get_rate_limiter
from app.services.sms_service import SmsDeliveryError, send_otp_message, sms_provider_health

router = APIRouter()

OTP_TTL_MINUTES = 10
OTP_MAX_ATTEMPTS = 5
OTP_CREATE_PURPOSE = "CREATE_REQUEST"
OTP_VIEW_PURPOSE = "VIEW_REQUEST"
ALLOWED_PURPOSES = {OTP_CREATE_PURPOSE, OTP_VIEW_PURPOSE}
CHANNEL_SMS = "SMS"
CHANNEL_EMAIL = "EMAIL"
SUPPORTED_CHANNELS = {CHANNEL_SMS, CHANNEL_EMAIL}
AUTH_MODE_SMS = "sms"
AUTH_MODE_EMAIL = "email"
AUTH_MODE_SMS_OR_EMAIL = "sms_or_email"
AUTH_MODE_TOTP = "totp"
SUPPORTED_AUTH_MODES = {AUTH_MODE_SMS, AUTH_MODE_EMAIL, AUTH_MODE_SMS_OR_EMAIL, AUTH_MODE_TOTP}


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


def _normalize_email(raw: str | None) -> str:
    return str(raw or "").strip().lower()


def _normalize_track(raw: str | None) -> str:
    return str(raw or "").strip().upper()


def _normalize_channel(raw: str | None) -> str:
    value = str(raw or "").strip().upper()
    if value in {"SMS", "PHONE"}:
        return CHANNEL_SMS
    if value in {"EMAIL", "MAIL"}:
        return CHANNEL_EMAIL
    return ""


def _auth_mode() -> str:
    mode = str(getattr(settings, "PUBLIC_AUTH_MODE", AUTH_MODE_SMS) or "").strip().lower()
    if mode not in SUPPORTED_AUTH_MODES:
        return AUTH_MODE_SMS
    return mode


def _resolve_channel(requested_channel: str | None, *, client_phone: str, client_email: str) -> str:
    explicit = _normalize_channel(requested_channel)
    mode = _auth_mode()
    if mode == AUTH_MODE_TOTP:
        raise HTTPException(status_code=501, detail="Режим TOTP еще не реализован")
    if mode == AUTH_MODE_SMS:
        if explicit and explicit != CHANNEL_SMS:
            raise HTTPException(status_code=400, detail="Разрешен только SMS-канал")
        return CHANNEL_SMS
    if mode == AUTH_MODE_EMAIL:
        if explicit and explicit != CHANNEL_EMAIL:
            raise HTTPException(status_code=400, detail="Разрешен только Email-канал")
        return CHANNEL_EMAIL
    # sms_or_email
    if explicit:
        return explicit
    if client_email and not client_phone:
        return CHANNEL_EMAIL
    return CHANNEL_SMS


def _email_fallback_allowed(email: str | None) -> bool:
    return bool(str(email or "").strip()) and bool(getattr(settings, "OTP_EMAIL_FALLBACK_ENABLED", True))


def _sms_balance_low() -> bool:
    health = sms_provider_health()
    if str(health.get("mode") or "").lower() != "real":
        return False
    amount = health.get("balance_amount")
    try:
        balance = float(amount)
    except Exception:
        return False
    threshold = float(getattr(settings, "OTP_SMS_MIN_BALANCE", 20.0))
    return balance < threshold


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


def _rate_limit_or_429(
    action: str,
    *,
    purpose: str,
    client_ip: str,
    phone: str | None,
    email: str | None,
    track_number: str | None,
) -> None:
    limiter = get_rate_limiter()
    window = int(max(settings.OTP_RATE_LIMIT_WINDOW_SECONDS, 1))
    limit = int(max(settings.OTP_SEND_RATE_LIMIT if action == "send" else settings.OTP_VERIFY_RATE_LIMIT, 1))
    purpose_norm = str(purpose or "").strip().upper()
    keys = [
        f"otp:{action}:ip:{_hash_key_part(client_ip)}:purpose:{purpose_norm}",
    ]
    if phone:
        keys.append(f"otp:{action}:phone:{_hash_key_part(phone)}:purpose:{purpose_norm}")
    if email:
        keys.append(f"otp:{action}:email:{_hash_key_part(email)}:purpose:{purpose_norm}")
    if track_number:
        keys.append(f"otp:{action}:track:{_hash_key_part(track_number)}:purpose:{purpose_norm}")

    for key in keys:
        result = limiter.hit(key, limit=limit, window_seconds=window)
        if not result.allowed:
            raise HTTPException(
                status_code=429,
                detail=f"Слишком много OTP-запросов. Повторите через {max(result.retry_after_seconds, 1)} сек.",
            )


def _set_public_cookie(response: Response, *, subject: str, purpose: str, auth_channel: str) -> None:
    token = create_jwt(
        {"sub": subject, "purpose": purpose, "auth_channel": auth_channel},
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


@router.get("/config")
def get_auth_config():
    mode = _auth_mode()
    available_channels: list[str] = [CHANNEL_SMS]
    if mode == AUTH_MODE_EMAIL:
        available_channels = [CHANNEL_EMAIL]
    elif mode == AUTH_MODE_SMS_OR_EMAIL:
        available_channels = [CHANNEL_SMS, CHANNEL_EMAIL]
    elif mode == AUTH_MODE_TOTP:
        available_channels = []
    return {
        "public_auth_mode": mode,
        "available_channels": available_channels,
        "totp_implemented": False,
        "email_provider": str(getattr(settings, "EMAIL_PROVIDER", "dummy") or "dummy").strip().lower(),
        "sms_provider": str(getattr(settings, "SMS_PROVIDER", "dummy") or "dummy").strip().lower(),
    }


@router.post("/send")
def send_otp(payload: OtpSend, request: Request, db: Session = Depends(get_db)):
    purpose = _normalize_purpose(payload.purpose)
    if purpose not in ALLOWED_PURPOSES:
        raise HTTPException(status_code=400, detail="Некорректная цель OTP")

    track_number: str | None = None
    phone = _normalize_phone(payload.client_phone)
    email = _normalize_email(payload.client_email)
    channel = _resolve_channel(payload.channel, client_phone=phone, client_email=email)

    if purpose == OTP_CREATE_PURPOSE:
        if channel == CHANNEL_SMS and not phone:
            raise HTTPException(status_code=400, detail='Поле "client_phone" обязательно для SMS OTP')
        if channel == CHANNEL_EMAIL and not email:
            raise HTTPException(status_code=400, detail='Поле "client_email" обязательно для Email OTP')
    else:
        track_number = _normalize_track(payload.track_number)
        if track_number:
            request_row = db.query(RequestModel).filter(RequestModel.track_number == track_number).first()
            if request_row is None:
                raise HTTPException(status_code=404, detail="Заявка не найдена")
            phone = _normalize_phone(request_row.client_phone)
            email = _normalize_email(request_row.client_email)
        elif channel == CHANNEL_SMS and phone:
            has_requests = db.query(RequestModel.id).filter(RequestModel.client_phone == phone).first()
            if has_requests is None:
                raise HTTPException(status_code=404, detail="Заявки по номеру телефона не найдены")
        elif channel == CHANNEL_EMAIL and email:
            has_requests = (
                db.query(RequestModel.id)
                .filter(RequestModel.client_email.isnot(None), RequestModel.client_email == email)
                .first()
            )
            if has_requests is None:
                raise HTTPException(status_code=404, detail="Заявки по email не найдены")
        else:
            if channel == CHANNEL_EMAIL:
                raise HTTPException(status_code=400, detail='Для VIEW_REQUEST укажите "track_number" или "client_email"')
            raise HTTPException(status_code=400, detail='Для VIEW_REQUEST укажите "track_number" или "client_phone"')
        if channel == CHANNEL_SMS and not phone:
            raise HTTPException(status_code=400, detail="У заявки отсутствует номер телефона")
        if channel == CHANNEL_EMAIL and not email:
            raise HTTPException(status_code=400, detail="У заявки отсутствует email")

    _rate_limit_or_429(
        "send",
        purpose=purpose,
        client_ip=_client_ip(request),
        phone=phone or None,
        email=email or None,
        track_number=track_number,
    )

    code = _generate_code()
    effective_channel = channel
    fallback_reason: str | None = None
    if channel == CHANNEL_SMS and _email_fallback_allowed(email):
        try:
            if _sms_balance_low():
                effective_channel = CHANNEL_EMAIL
                fallback_reason = "low_sms_balance"
        except Exception:
            effective_channel = channel

    if effective_channel == CHANNEL_EMAIL:
        try:
            delivery_response = send_otp_email_message(
                email=email,
                code=code,
                purpose=purpose,
                track_number=track_number,
            )
        except EmailDeliveryError as exc:
            raise HTTPException(status_code=502, detail=f"Не удалось отправить OTP по email: {exc}") from exc
    else:
        try:
            delivery_response = send_otp_message(phone=phone, code=code, purpose=purpose, track_number=track_number)
        except SmsDeliveryError as exc:
            if _email_fallback_allowed(email):
                try:
                    delivery_response = send_otp_email_message(
                        email=email,
                        code=code,
                        purpose=purpose,
                        track_number=track_number,
                    )
                    effective_channel = CHANNEL_EMAIL
                    fallback_reason = "sms_send_failed"
                except EmailDeliveryError:
                    pass
            if effective_channel == CHANNEL_SMS:
                raise HTTPException(status_code=502, detail=f"Не удалось отправить OTP: {exc}") from exc

    now = _now_utc()
    expires_at = now + timedelta(minutes=OTP_TTL_MINUTES)

    existing_query = db.query(OtpSession).filter(OtpSession.purpose == purpose, OtpSession.channel == effective_channel)
    if track_number:
        existing_query = existing_query.filter(OtpSession.track_number == track_number)
    if effective_channel == CHANNEL_EMAIL:
        existing_query = existing_query.filter(OtpSession.email == email)
    else:
        existing_query = existing_query.filter(OtpSession.phone == phone)
    existing_query.delete(synchronize_session=False)

    row = OtpSession(
        purpose=purpose,
        channel=effective_channel,
        track_number=track_number,
        phone=phone if effective_channel == CHANNEL_SMS else "",
        email=email if effective_channel == CHANNEL_EMAIL else None,
        code_hash=hash_password(code),
        attempts=0,
        expires_at=expires_at,
        responsible="Система OTP",
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return {
        "status": "sent",
        "purpose": purpose,
        "channel": effective_channel,
        "track_number": track_number,
        "ttl_seconds": OTP_TTL_MINUTES * 60,
        "delivery_response": delivery_response,
        "sms_response": delivery_response if effective_channel == CHANNEL_SMS else None,
        "fallback_reason": fallback_reason,
    }


@router.post("/verify")
def verify_otp(payload: OtpVerify, request: Request, response: Response, db: Session = Depends(get_db)):
    purpose = _normalize_purpose(payload.purpose)
    if purpose not in ALLOWED_PURPOSES:
        raise HTTPException(status_code=400, detail="Некорректная цель OTP")

    track_number: str | None = None
    phone: str = _normalize_phone(payload.client_phone)
    email: str = _normalize_email(payload.client_email)
    channel = _resolve_channel(payload.channel, client_phone=phone, client_email=email)

    if purpose == OTP_CREATE_PURPOSE:
        if channel == CHANNEL_SMS and not phone:
            raise HTTPException(status_code=400, detail='Поле "client_phone" обязательно для SMS OTP')
        if channel == CHANNEL_EMAIL and not email:
            raise HTTPException(status_code=400, detail='Поле "client_email" обязательно для Email OTP')
    else:
        track_number = _normalize_track(payload.track_number)
        if not track_number and not phone and not email:
            raise HTTPException(
                status_code=400,
                detail='Для VIEW_REQUEST укажите "track_number" или "client_phone/client_email"',
            )

    _rate_limit_or_429(
        "verify",
        purpose=purpose,
        client_ip=_client_ip(request),
        phone=phone or None,
        email=email or None,
        track_number=track_number,
    )

    query = db.query(OtpSession).filter(OtpSession.purpose == purpose, OtpSession.channel == channel)
    if track_number is not None and track_number != "":
        query = query.filter(OtpSession.track_number == track_number)
    if channel == CHANNEL_EMAIL:
        if email:
            query = query.filter(OtpSession.email == email)
    elif phone:
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

    if purpose == OTP_CREATE_PURPOSE:
        subject = str((row.email or "").strip() if channel == CHANNEL_EMAIL else (row.phone or ""))
    else:
        if phone:
            subject = str((row.phone or "").strip())
        elif email:
            subject = str((row.email or "").strip())
        elif track_number:
            subject = str(row.track_number or "")
        else:
            subject = str((row.phone or row.email or row.track_number or "")).strip()
    if not subject:
        raise HTTPException(status_code=400, detail="Некорректная OTP-сессия")

    _set_public_cookie(response, subject=subject, purpose=purpose, auth_channel=channel)

    db.delete(row)
    db.commit()
    return {"status": "verified", "purpose": purpose, "channel": channel}
