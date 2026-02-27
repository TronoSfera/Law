from __future__ import annotations

import asyncio
import importlib.util
from typing import Any

from app.core.config import settings


class SmsDeliveryError(Exception):
    pass


def _module_available(module_name: str) -> bool:
    return importlib.util.find_spec(module_name) is not None


def _normalize_phone_to_int(phone: str) -> int:
    digits = "".join(ch for ch in str(phone or "") if ch.isdigit())
    if not digits:
        raise SmsDeliveryError("Некорректный номер телефона")
    try:
        return int(digits)
    except ValueError as exc:
        raise SmsDeliveryError("Некорректный номер телефона") from exc


def _build_otp_message(*, code: str, purpose: str, track_number: str | None) -> str:
    template = str(settings.OTP_SMS_TEMPLATE or "").strip() or "Ваш код подтверждения: {code}"
    try:
        rendered = template.format(code=code, purpose=purpose, track_number=track_number or "")
    except Exception:
        rendered = f"Ваш код подтверждения: {code}"
    return rendered


def _mock_sms_send(*, phone: str, code: str, purpose: str, track_number: str | None) -> dict[str, Any]:
    print(f"[OTP MOCK] purpose={purpose} phone={phone} track={track_number or '-'} code={code}")
    return {
        "provider": "mock_sms",
        "status": "accepted",
        "message": "SMS provider response mocked",
        "sent": False,
        "mocked": True,
    }


async def _send_sms_aero_async(*, phone: int, message: str) -> dict[str, Any]:
    try:
        import smsaero
    except Exception as exc:  # pragma: no cover - runtime dependency branch
        raise SmsDeliveryError("Библиотека smsaero-api-async не установлена") from exc

    email = str(settings.SMSAERO_EMAIL or "").strip()
    api_key = str(settings.SMSAERO_API_KEY or "").strip()
    if not email or not api_key:
        raise SmsDeliveryError("Не заданы SMSAERO_EMAIL и/или SMSAERO_API_KEY")

    api = smsaero.SmsAero(email, api_key)
    try:
        result = await api.send_sms(phone, message)
    except Exception as exc:  # pragma: no cover - network/runtime branch
        raise SmsDeliveryError(f"Ошибка отправки SMS через SMS Aero: {exc}") from exc
    finally:
        await api.close_session()
    return {
        "provider": "smsaero",
        "status": "accepted",
        "message": "SMS отправлено",
        "sent": True,
        "response": result,
    }


def _send_sms_aero(*, phone: str, message: str) -> dict[str, Any]:
    phone_int = _normalize_phone_to_int(phone)
    return asyncio.run(_send_sms_aero_async(phone=phone_int, message=message))


async def _get_sms_aero_balance_async() -> dict[str, Any]:
    try:
        import smsaero
    except Exception as exc:  # pragma: no cover - runtime dependency branch
        raise SmsDeliveryError("Библиотека smsaero-api-async не установлена") from exc

    email = str(settings.SMSAERO_EMAIL or "").strip()
    api_key = str(settings.SMSAERO_API_KEY or "").strip()
    if not email or not api_key:
        raise SmsDeliveryError("Не заданы SMSAERO_EMAIL и/или SMSAERO_API_KEY")

    api = smsaero.SmsAero(email, api_key)
    try:
        result = await api.balance()
    except Exception as exc:  # pragma: no cover - network/runtime branch
        raise SmsDeliveryError(f"Ошибка получения баланса SMS Aero: {exc}") from exc
    finally:
        await api.close_session()
    return dict(result or {})


def _get_sms_aero_balance() -> tuple[float | None, dict[str, Any] | None, str | None]:
    try:
        raw = _get_sms_aero_balance_async()
        data = asyncio.run(raw)
        amount = data.get("balance")
        number = float(amount)
        return number, data, None
    except Exception as exc:
        return None, None, str(exc)


def sms_provider_health() -> dict[str, Any]:
    provider = str(settings.SMS_PROVIDER or "dummy").strip().lower()
    if provider in {"", "dummy", "mock", "console"}:
        return {
            "provider": "dummy",
            "status": "ok",
            "mode": "mock",
            "can_send": True,
            "balance_available": False,
            "balance_amount": None,
            "balance_currency": "RUB",
            "checks": {"mock_mode": True},
            "issues": [],
        }

    if provider in {"smsaero", "sms_aero"}:
        email = str(settings.SMSAERO_EMAIL or "").strip()
        api_key = str(settings.SMSAERO_API_KEY or "").strip()
        installed = _module_available("smsaero")
        checks = {
            "smsaero_installed": bool(installed),
            "email_configured": bool(email),
            "api_key_configured": bool(api_key),
        }
        issues: list[str] = []
        if not checks["smsaero_installed"]:
            issues.append("Не установлена библиотека smsaero-api-async")
        if not checks["email_configured"]:
            issues.append("Не задан SMSAERO_EMAIL")
        if not checks["api_key_configured"]:
            issues.append("Не задан SMSAERO_API_KEY")
        can_send = all(checks.values())
        balance_available = False
        balance_amount: float | None = None
        balance_raw: dict[str, Any] | None = None
        if can_send:
            amount, raw_balance, balance_error = _get_sms_aero_balance()
            if amount is None:
                issues.append(str(balance_error or "Не удалось получить баланс SMS Aero"))
            else:
                balance_available = True
                balance_amount = amount
                balance_raw = raw_balance
        return {
            "provider": "smsaero",
            "status": "ok" if can_send and balance_available else "degraded",
            "mode": "real",
            "can_send": can_send,
            "balance_available": balance_available,
            "balance_amount": balance_amount,
            "balance_currency": "RUB",
            "balance_raw": balance_raw,
            "checks": checks,
            "issues": issues,
        }

    return {
        "provider": provider,
        "status": "error",
        "mode": "unknown",
        "can_send": False,
        "balance_available": False,
        "balance_amount": None,
        "balance_currency": "RUB",
        "checks": {"provider_supported": False},
        "issues": [f"Неизвестный SMS_PROVIDER: {provider}"],
    }


def send_otp_message(*, phone: str, code: str, purpose: str, track_number: str | None = None) -> dict[str, Any]:
    provider = str(settings.SMS_PROVIDER or "dummy").strip().lower()
    if provider in {"", "dummy", "mock", "console"}:
        return _mock_sms_send(phone=phone, code=code, purpose=purpose, track_number=track_number)
    if provider in {"smsaero", "sms_aero"}:
        message = _build_otp_message(code=code, purpose=purpose, track_number=track_number)
        return _send_sms_aero(phone=phone, message=message)
    raise SmsDeliveryError(f"Неизвестный SMS_PROVIDER: {provider}")
