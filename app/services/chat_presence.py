from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from typing import Any

import redis

from app.core.config import settings

_DEFAULT_TYPING_TTL_SECONDS = 9

_redis_client: redis.Redis | None = None
_redis_lock = threading.Lock()

_memory_lock = threading.Lock()
_memory_state: dict[str, dict[str, dict[str, Any]]] = {}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso_utc(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def _get_redis_client() -> redis.Redis | None:
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    with _redis_lock:
        if _redis_client is not None:
            return _redis_client
        try:
            client = redis.Redis.from_url(
                settings.REDIS_URL,
                decode_responses=True,
                socket_timeout=0.25,
                socket_connect_timeout=0.25,
            )
            client.ping()
            _redis_client = client
            return _redis_client
        except Exception:
            _redis_client = None
            return None


def _request_actors_key(request_key: str) -> str:
    return f"chat:typing:req:{request_key}:actors"


def _actor_payload_key(request_key: str, actor_key: str) -> str:
    return f"chat:typing:req:{request_key}:actor:{actor_key}"


def set_typing_presence(
    *,
    request_key: str,
    actor_key: str,
    actor_label: str,
    actor_role: str,
    typing: bool,
    ttl_seconds: int = _DEFAULT_TYPING_TTL_SECONDS,
) -> None:
    normalized_request = str(request_key or "").strip()
    normalized_actor = str(actor_key or "").strip()
    if not normalized_request or not normalized_actor:
        return

    ttl = max(2, int(ttl_seconds or _DEFAULT_TYPING_TTL_SECONDS))
    if typing:
        payload = {
            "actor_key": normalized_actor,
            "actor_label": str(actor_label or "").strip() or "Собеседник",
            "actor_role": str(actor_role or "").strip().upper() or "UNKNOWN",
            "updated_at": _iso_utc(_utc_now()),
        }
    else:
        payload = None

    client = _get_redis_client()
    if client is not None:
        actors_key = _request_actors_key(normalized_request)
        actor_payload_key = _actor_payload_key(normalized_request, normalized_actor)
        try:
            pipe = client.pipeline()
            if payload is None:
                pipe.delete(actor_payload_key)
                pipe.srem(actors_key, normalized_actor)
            else:
                pipe.sadd(actors_key, normalized_actor)
                pipe.setex(actor_payload_key, ttl, json.dumps(payload, ensure_ascii=False))
                pipe.expire(actors_key, max(60, ttl * 8))
            pipe.execute()
            return
        except Exception:
            pass

    with _memory_lock:
        actors = _memory_state.setdefault(normalized_request, {})
        if payload is None:
            actors.pop(normalized_actor, None)
            if not actors:
                _memory_state.pop(normalized_request, None)
            return
        expires_at = _utc_now().timestamp() + ttl
        actors[normalized_actor] = {**payload, "expires_at": expires_at}


def list_typing_presence(
    *,
    request_key: str,
    exclude_actor_key: str | None = None,
) -> list[dict[str, Any]]:
    normalized_request = str(request_key or "").strip()
    if not normalized_request:
        return []
    excluded = str(exclude_actor_key or "").strip()
    now_ts = _utc_now().timestamp()

    client = _get_redis_client()
    if client is not None:
        actors_key = _request_actors_key(normalized_request)
        try:
            members = list(client.smembers(actors_key) or [])
            if not members:
                return []
            keys = [_actor_payload_key(normalized_request, str(member)) for member in members]
            rows = client.mget(keys)
            stale_members: list[str] = []
            result: list[dict[str, Any]] = []
            for actor, raw in zip(members, rows):
                actor_str = str(actor)
                if not raw:
                    stale_members.append(actor_str)
                    continue
                try:
                    payload = json.loads(str(raw))
                except Exception:
                    stale_members.append(actor_str)
                    continue
                if excluded and actor_str == excluded:
                    continue
                result.append(
                    {
                        "actor_key": actor_str,
                        "actor_label": str(payload.get("actor_label") or "Собеседник"),
                        "actor_role": str(payload.get("actor_role") or "UNKNOWN"),
                        "updated_at": str(payload.get("updated_at") or ""),
                    }
                )
            if stale_members:
                try:
                    client.srem(actors_key, *stale_members)
                except Exception:
                    pass
            result.sort(key=lambda item: str(item.get("updated_at") or ""), reverse=True)
            return result
        except Exception:
            pass

    with _memory_lock:
        actors = _memory_state.get(normalized_request) or {}
        stale: list[str] = []
        result: list[dict[str, Any]] = []
        for actor_key, payload in actors.items():
            expires_at = float(payload.get("expires_at") or 0)
            if expires_at <= now_ts:
                stale.append(actor_key)
                continue
            if excluded and actor_key == excluded:
                continue
            result.append(
                {
                    "actor_key": actor_key,
                    "actor_label": str(payload.get("actor_label") or "Собеседник"),
                    "actor_role": str(payload.get("actor_role") or "UNKNOWN"),
                    "updated_at": str(payload.get("updated_at") or ""),
                }
            )
        for actor_key in stale:
            actors.pop(actor_key, None)
        if not actors:
            _memory_state.pop(normalized_request, None)
        result.sort(key=lambda item: str(item.get("updated_at") or ""), reverse=True)
        return result


def clear_presence_for_tests() -> None:
    with _memory_lock:
        _memory_state.clear()

