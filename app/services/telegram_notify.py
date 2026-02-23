from __future__ import annotations

from typing import Any

import httpx

from app.core.config import settings


def _telegram_enabled() -> bool:
    token = str(settings.TELEGRAM_BOT_TOKEN or "").strip()
    chat_id = str(settings.TELEGRAM_CHAT_ID or "").strip()
    if not token or token == "change_me":
        return False
    if not chat_id or chat_id == "0":
        return False
    return True


def send_telegram_message(text: str) -> dict[str, Any]:
    payload_text = str(text or "").strip()
    if not payload_text:
        return {"ok": False, "sent": False, "reason": "empty_text"}

    if not _telegram_enabled():
        # Dev-safe fallback: show delivery payload in logs.
        print(f"[TELEGRAM MOCK] {payload_text}")
        return {"ok": True, "sent": False, "mocked": True}

    token = str(settings.TELEGRAM_BOT_TOKEN).strip()
    chat_id = str(settings.TELEGRAM_CHAT_ID).strip()
    url = f"https://api.telegram.org/bot{token}/sendMessage"

    try:
        with httpx.Client(timeout=5.0) as client:
            response = client.post(
                url,
                json={
                    "chat_id": chat_id,
                    "text": payload_text,
                    "disable_web_page_preview": True,
                },
            )
        data = response.json() if response.content else {}
        if response.status_code >= 400 or not bool(data.get("ok")):
            print(f"[TELEGRAM ERROR] status={response.status_code} body={data}")
            return {"ok": False, "sent": False, "status_code": response.status_code, "response": data}
        return {"ok": True, "sent": True}
    except Exception as exc:
        print(f"[TELEGRAM ERROR] {exc}")
        return {"ok": False, "sent": False, "error": str(exc)}
