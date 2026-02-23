from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from threading import Lock
from typing import Protocol

import redis

from app.core.config import settings

_LOG = logging.getLogger("app.rate_limit")


@dataclass
class RateLimitResult:
    allowed: bool
    retry_after_seconds: int
    current_value: int


class RateLimiter(Protocol):
    def hit(self, key: str, *, limit: int, window_seconds: int) -> RateLimitResult:
        ...


class InMemoryRateLimiter:
    def __init__(self):
        self._data: dict[str, tuple[int, datetime]] = {}
        self._lock = Lock()

    def hit(self, key: str, *, limit: int, window_seconds: int) -> RateLimitResult:
        now = datetime.now(timezone.utc)
        with self._lock:
            count, expires_at = self._data.get(key, (0, now))
            if expires_at <= now:
                count = 0
                expires_at = now + timedelta(seconds=max(int(window_seconds), 1))
            count += 1
            self._data[key] = (count, expires_at)
            retry_after = max(0, int((expires_at - now).total_seconds()))
        return RateLimitResult(allowed=count <= limit, retry_after_seconds=retry_after, current_value=count)


class RedisRateLimiter:
    def __init__(self, client: redis.Redis):
        self.client = client

    def hit(self, key: str, *, limit: int, window_seconds: int) -> RateLimitResult:
        count = int(self.client.incr(key))
        if count == 1:
            self.client.expire(key, int(max(window_seconds, 1)))
        ttl = int(self.client.ttl(key))
        if ttl < 0:
            ttl = int(max(window_seconds, 1))
        return RateLimitResult(allowed=count <= limit, retry_after_seconds=ttl, current_value=count)


_cached_limiter: RateLimiter | None = None


def _build_limiter() -> RateLimiter:
    try:
        client = redis.Redis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_timeout=0.4,
            socket_connect_timeout=0.4,
        )
        client.ping()
        return RedisRateLimiter(client)
    except Exception:
        _LOG.warning("Redis limiter unavailable; fallback to in-memory limiter")
        return InMemoryRateLimiter()


def get_rate_limiter() -> RateLimiter:
    global _cached_limiter
    if _cached_limiter is None:
        _cached_limiter = _build_limiter()
    return _cached_limiter


def reset_rate_limiter_for_tests() -> None:
    global _cached_limiter
    _cached_limiter = None
