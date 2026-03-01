from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage
from typing import Any
import httpx

from app.core.config import settings


class EmailDeliveryError(Exception):
    pass


logger = logging.getLogger("uvicorn.error")


def _otp_dev_mode_enabled() -> bool:
    return bool(getattr(settings, "OTP_DEV_MODE", False))


def _normalize_email(value: str | None) -> str:
    return str(value or "").strip().lower()


def _build_subject(*, code: str, purpose: str, track_number: str | None) -> str:
    template = str(settings.OTP_EMAIL_SUBJECT_TEMPLATE or "").strip() or "Код подтверждения: {code}"
    try:
        return template.format(code=code, purpose=purpose, track_number=track_number or "")
    except Exception:
        return f"Код подтверждения: {code}"


def _build_body(*, code: str, purpose: str, track_number: str | None) -> str:
    template = str(settings.OTP_EMAIL_TEMPLATE or "").strip() or "Ваш код подтверждения: {code}"
    try:
        return template.format(code=code, purpose=purpose, track_number=track_number or "")
    except Exception:
        return f"Ваш код подтверждения: {code}"


def _mock_send(*, email: str, code: str, purpose: str, track_number: str | None) -> dict[str, Any]:
    line = f"[OTP EMAIL MOCK] purpose={purpose} email={email} track={track_number or '-'} code={code}"
    logger.warning(line)
    return {
        "provider": "mock_email",
        "status": "accepted",
        "message": "Email provider response mocked",
        "sent": False,
        "mocked": True,
        "dev_mode": bool(_otp_dev_mode_enabled()),
        "debug_code": str(code),
    }


def _send_smtp(*, email: str, subject: str, body: str) -> dict[str, Any]:
    host = str(settings.SMTP_HOST or "").strip()
    port = int(settings.SMTP_PORT or 0)
    username = str(settings.SMTP_USER or "").strip()
    password = str(settings.SMTP_PASSWORD or "").strip()
    sender = str(settings.SMTP_FROM or "").strip()
    use_tls = bool(getattr(settings, "SMTP_USE_TLS", True))
    use_ssl = bool(getattr(settings, "SMTP_USE_SSL", False))

    if not host or not port or not sender:
        raise EmailDeliveryError("Не заданы SMTP_HOST/SMTP_PORT/SMTP_FROM")
    if use_tls and use_ssl:
        raise EmailDeliveryError("Нельзя включать одновременно SMTP_USE_TLS и SMTP_USE_SSL")

    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = email
    msg["Subject"] = subject
    msg.set_content(body)

    try:
        if use_ssl:
            smtp = smtplib.SMTP_SSL(host=host, port=port, timeout=15)
        else:
            smtp = smtplib.SMTP(host=host, port=port, timeout=15)
        with smtp as client:
            client.ehlo()
            if use_tls:
                client.starttls()
                client.ehlo()
            if username:
                client.login(username, password)
            client.send_message(msg)
    except Exception as exc:
        raise EmailDeliveryError(f"Ошибка отправки Email OTP: {exc}") from exc

    return {
        "provider": "smtp",
        "status": "accepted",
        "message": "Email отправлен",
        "sent": True,
    }


def send_email_via_smtp(*, email: str, subject: str, body: str) -> dict[str, Any]:
    normalized_email = _normalize_email(email)
    if not normalized_email:
        raise EmailDeliveryError("Некорректный email")
    return _send_smtp(email=normalized_email, subject=subject, body=body)


def _send_via_email_service(*, email: str, subject: str, body: str) -> dict[str, Any]:
    base_url = str(settings.EMAIL_SERVICE_URL or "").strip().rstrip("/")
    token = str(settings.INTERNAL_SERVICE_TOKEN or "").strip()
    if not base_url:
        raise EmailDeliveryError("Не задан EMAIL_SERVICE_URL")
    if not token:
        raise EmailDeliveryError("Не задан INTERNAL_SERVICE_TOKEN")
    try:
        with httpx.Client(timeout=15.0) as client:
            response = client.post(
                f"{base_url}/internal/send-otp",
                headers={"X-Internal-Token": token, "Content-Type": "application/json"},
                json={"email": email, "subject": subject, "body": body},
            )
    except Exception as exc:
        raise EmailDeliveryError(f"Ошибка обращения к email-service: {exc}") from exc
    payload: dict[str, Any] = {}
    try:
        payload = response.json() if response.content else {}
    except Exception:
        payload = {}
    if response.status_code >= 400:
        detail = str(payload.get("detail") or payload.get("error") or response.text or response.status_code)
        raise EmailDeliveryError(f"email-service ошибка: {detail}")
    return {
        "provider": "email-service",
        "status": "accepted",
        "message": "Email отправлен через отдельный сервис",
        "sent": True,
        "response": payload,
    }


def send_otp_email_message(*, email: str, code: str, purpose: str, track_number: str | None = None) -> dict[str, Any]:
    normalized_email = _normalize_email(email)
    if not normalized_email:
        raise EmailDeliveryError("Некорректный email")

    if _otp_dev_mode_enabled():
        return _mock_send(email=normalized_email, code=code, purpose=purpose, track_number=track_number)

    provider = str(settings.EMAIL_PROVIDER or "dummy").strip().lower()
    if provider in {"", "dummy", "mock", "console"}:
        return _mock_send(email=normalized_email, code=code, purpose=purpose, track_number=track_number)

    subject = _build_subject(code=code, purpose=purpose, track_number=track_number)
    body = _build_body(code=code, purpose=purpose, track_number=track_number)

    if provider in {"service", "email_service"}:
        return _send_via_email_service(email=normalized_email, subject=subject, body=body)

    if provider == "smtp":
        return _send_smtp(email=normalized_email, subject=subject, body=body)

    raise EmailDeliveryError(f"Неизвестный EMAIL_PROVIDER: {provider}")


def email_provider_health() -> dict[str, Any]:
    provider = str(settings.EMAIL_PROVIDER or "dummy").strip().lower()
    if _otp_dev_mode_enabled():
        return {
            "provider": provider or "dummy",
            "effective_provider": "mock_email",
            "status": "ok",
            "mode": "mock",
            "dev_mode": True,
            "can_send": True,
            "checks": {"otp_dev_mode": True},
            "issues": ["OTP_DEV_MODE включен: реальная Email-рассылка отключена"],
        }

    if provider in {"", "dummy", "mock", "console"}:
        return {
            "provider": "dummy",
            "status": "ok",
            "mode": "mock",
            "dev_mode": False,
            "can_send": True,
            "checks": {"mock_mode": True},
            "issues": [],
        }

    if provider in {"service", "email_service"}:
        base_url = str(settings.EMAIL_SERVICE_URL or "").strip().rstrip("/")
        token = str(settings.INTERNAL_SERVICE_TOKEN or "").strip()
        checks = {"email_service_url_configured": bool(base_url), "internal_service_token_configured": bool(token)}
        issues: list[str] = []
        if not checks["email_service_url_configured"]:
            issues.append("Не задан EMAIL_SERVICE_URL")
        if not checks["internal_service_token_configured"]:
            issues.append("Не задан INTERNAL_SERVICE_TOKEN")
        can_send = all(checks.values())
        if can_send:
            try:
                with httpx.Client(timeout=5.0) as client:
                    response = client.get(f"{base_url}/health")
                if response.status_code >= 400:
                    can_send = False
                    issues.append(f"email-service недоступен: HTTP {response.status_code}")
            except Exception as exc:
                can_send = False
                issues.append(f"email-service недоступен: {exc}")
        return {
            "provider": "email-service",
            "status": "ok" if can_send else "degraded",
            "mode": "service",
            "dev_mode": False,
            "can_send": can_send,
            "checks": checks,
            "issues": issues,
        }

    if provider == "smtp":
        host = str(settings.SMTP_HOST or "").strip()
        sender = str(settings.SMTP_FROM or "").strip()
        checks = {"smtp_host_configured": bool(host), "smtp_from_configured": bool(sender)}
        issues = []
        if not checks["smtp_host_configured"]:
            issues.append("Не задан SMTP_HOST")
        if not checks["smtp_from_configured"]:
            issues.append("Не задан SMTP_FROM")
        return {
            "provider": "smtp",
            "status": "ok" if all(checks.values()) else "degraded",
            "mode": "real",
            "dev_mode": False,
            "can_send": all(checks.values()),
            "checks": checks,
            "issues": issues,
        }

    return {
        "provider": provider,
        "status": "error",
        "mode": "unknown",
        "dev_mode": False,
        "can_send": False,
        "checks": {"provider_supported": False},
        "issues": [f"Неизвестный EMAIL_PROVIDER: {provider}"],
    }
