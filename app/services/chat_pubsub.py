"""
Redis pub/sub для real-time событий чата.

Синхронный publish вызывается из сервисов при сохранении сообщения.
Асинхронный subscribe используется в SSE-эндпоинтах.
"""
from __future__ import annotations

import asyncio
import json
import logging
import threading
from typing import AsyncGenerator

import redis
import redis.asyncio as aioredis

from app.core.config import settings

logger = logging.getLogger(__name__)

_CHANNEL_PREFIX = "chat:events:"
_KEEPALIVE_INTERVAL = 20  # секунд между keepalive-пингами
_SUBSCRIBE_TIMEOUT = 60   # максимальное время ожидания события (сек)

# ── Синхронный клиент для publish ────────────────────────────────────────────

_sync_client: redis.Redis | None = None
_sync_lock = threading.Lock()


def _get_sync_client() -> redis.Redis | None:
    global _sync_client
    if _sync_client is not None:
        return _sync_client
    with _sync_lock:
        if _sync_client is not None:
            return _sync_client
        try:
            client = redis.Redis.from_url(
                settings.REDIS_URL,
                decode_responses=True,
                socket_timeout=0.5,
                socket_connect_timeout=0.5,
            )
            client.ping()
            _sync_client = client
            return _sync_client
        except Exception:
            _sync_client = None
            return None


def publish_chat_event(request_id: str, event_type: str = "message") -> None:
    """Публикует событие в канал чата. Ошибки логируются, но не поднимаются."""
    client = _get_sync_client()
    if client is None:
        return
    channel = f"{_CHANNEL_PREFIX}{request_id}"
    payload = json.dumps({"type": event_type, "request_id": request_id})
    try:
        client.publish(channel, payload)
    except Exception as exc:
        logger.warning("chat_pubsub: publish failed for %s: %s", request_id, exc)


# ── Асинхронный клиент для subscribe (SSE) ───────────────────────────────────

async def _make_async_client() -> aioredis.Redis:
    return aioredis.from_url(
        settings.REDIS_URL,
        decode_responses=True,
        socket_timeout=2.0,
        socket_connect_timeout=2.0,
    )


async def subscribe_chat_events(
    request_id: str,
    *,
    timeout: float = _SUBSCRIBE_TIMEOUT,
) -> AsyncGenerator[dict, None]:
    """
    Async-генератор событий из Redis pub/sub для данного request_id.
    Каждые KEEPALIVE_INTERVAL секунд yields {"type": "keepalive"}.
    Завершается через timeout секунд с {"type": "timeout"}.
    При ошибке Redis yields {"type": "error"} и завершается.
    """
    channel = f"{_CHANNEL_PREFIX}{request_id}"
    try:
        client = await _make_async_client()
    except Exception as exc:
        logger.warning("chat_pubsub: async connect failed: %s", exc)
        yield {"type": "error"}
        return

    try:
        pubsub = client.pubsub()
        await pubsub.subscribe(channel)

        deadline = asyncio.get_event_loop().time() + timeout
        next_keepalive = asyncio.get_event_loop().time() + _KEEPALIVE_INTERVAL

        while True:
            now = asyncio.get_event_loop().time()
            if now >= deadline:
                yield {"type": "timeout"}
                break

            wait = min(1.0, next_keepalive - now, deadline - now)

            try:
                msg = await asyncio.wait_for(pubsub.get_message(ignore_subscribe_messages=True), timeout=max(wait, 0.05))
            except asyncio.TimeoutError:
                msg = None
            except Exception as exc:
                logger.warning("chat_pubsub: subscribe error for %s: %s", request_id, exc)
                yield {"type": "error"}
                break

            if msg is not None and msg.get("type") == "message":
                try:
                    data = json.loads(msg["data"])
                except Exception:
                    data = {"type": "message", "request_id": request_id}
                yield data

            if asyncio.get_event_loop().time() >= next_keepalive:
                yield {"type": "keepalive"}
                next_keepalive = asyncio.get_event_loop().time() + _KEEPALIVE_INTERVAL

    finally:
        try:
            await pubsub.unsubscribe(channel)
            await client.aclose()
        except Exception:
            pass
