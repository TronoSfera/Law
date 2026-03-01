#!/usr/bin/env sh
set -eu

BASE_URL="${1:-http://localhost:8081}"
CHAT_HEALTH_URL="${BASE_URL%/}/chat-health"
BACKEND_HEALTH_URL="${BASE_URL%/}/health"
EMAIL_HEALTH_URL="${BASE_URL%/}/email-health"

check_http_200() {
  url="$1"
  code="$(curl -sS -o /dev/null -w "%{http_code}" "$url" || true)"
  [ "$code" = "200" ]
}

if ! check_http_200 "$CHAT_HEALTH_URL"; then
  echo "[ALERT] chat-service health check failed: $CHAT_HEALTH_URL" >&2
  exit 2
fi

if ! check_http_200 "$BACKEND_HEALTH_URL"; then
  echo "[ALERT] backend health check failed: $BACKEND_HEALTH_URL" >&2
  exit 3
fi

if ! check_http_200 "$EMAIL_HEALTH_URL"; then
  echo "[ALERT] email-service health check failed: $EMAIL_HEALTH_URL" >&2
  exit 5
fi

if docker compose ps --format json 2>/dev/null | grep -q '"Health":"unhealthy"'; then
  echo "[ALERT] at least one container has unhealthy state" >&2
  exit 4
fi

echo "[OK] chat-service, backend and email-service are healthy"
