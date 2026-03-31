#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://localhost:8081}"
COMPOSE_OVERRIDE="${COMPOSE_OVERRIDE:-docker-compose.local.yml}"
COMPOSE=(docker compose -f docker-compose.yml -f "$COMPOSE_OVERRIDE")
CONTENT_TYPE="text/plain"
PAYLOAD="s3-proxy-smoke $(date -u +%Y-%m-%dT%H:%M:%SZ)"
TMP_BODY="$(mktemp)"
TMP_RESP="$(mktemp)"
TMP_GET="$(mktemp)"
DELETE_URL=""

cleanup() {
  rm -f "$TMP_BODY" "$TMP_RESP" "$TMP_GET"
  if [ -n "$DELETE_URL" ]; then
    curl -sS -o /dev/null -X DELETE "${BASE_URL%/}${DELETE_URL}" || true
  fi
}
trap cleanup EXIT

printf '%s' "$PAYLOAD" > "$TMP_BODY"

JSON_PAYLOAD="$(${COMPOSE[@]} run --rm --no-deps -T backend python - <<'PY'
import json
import uuid
from app.services.s3_storage import S3Storage

storage = S3Storage()
key = f"smoke-tests/{uuid.uuid4().hex}.txt"
put_url = storage.client.generate_presigned_url(
    "put_object",
    Params={"Bucket": storage.bucket, "Key": key, "ContentType": "text/plain"},
    ExpiresIn=300,
    HttpMethod="PUT",
)
get_url = storage.client.generate_presigned_url(
    "get_object",
    Params={"Bucket": storage.bucket, "Key": key},
    ExpiresIn=300,
    HttpMethod="GET",
)
delete_url = storage.client.generate_presigned_url(
    "delete_object",
    Params={"Bucket": storage.bucket, "Key": key},
    ExpiresIn=300,
    HttpMethod="DELETE",
)
print(json.dumps({
    "key": key,
    "put_url": storage._proxy_presigned_url(put_url),
    "get_url": storage._proxy_presigned_url(get_url),
    "delete_url": storage._proxy_presigned_url(delete_url),
}))
PY
)"

KEY="$(printf '%s' "$JSON_PAYLOAD" | python3 -c 'import json,sys; print(json.load(sys.stdin)["key"])')"
PUT_URL="$(printf '%s' "$JSON_PAYLOAD" | python3 -c 'import json,sys; print(json.load(sys.stdin)["put_url"])')"
GET_URL="$(printf '%s' "$JSON_PAYLOAD" | python3 -c 'import json,sys; print(json.load(sys.stdin)["get_url"])')"
DELETE_URL="$(printf '%s' "$JSON_PAYLOAD" | python3 -c 'import json,sys; print(json.load(sys.stdin)["delete_url"])')"

HTTP_CODE="$(curl -sS -o "$TMP_RESP" -w '%{http_code}' -X PUT "${BASE_URL%/}${PUT_URL}" -H "Content-Type: $CONTENT_TYPE" --data-binary @"$TMP_BODY")"
if [ "$HTTP_CODE" != "200" ]; then
  echo "[S3-SMOKE] PUT failed: HTTP $HTTP_CODE"
  cat "$TMP_RESP"
  exit 1
fi

HTTP_CODE="$(curl -sS -o "$TMP_GET" -w '%{http_code}' -X GET "${BASE_URL%/}${GET_URL}")"
if [ "$HTTP_CODE" != "200" ]; then
  echo "[S3-SMOKE] GET failed: HTTP $HTTP_CODE"
  cat "$TMP_GET"
  exit 1
fi

if ! cmp -s "$TMP_BODY" "$TMP_GET"; then
  echo "[S3-SMOKE] downloaded body mismatch for key=$KEY"
  exit 1
fi

echo "[S3-SMOKE] OK base_url=$BASE_URL key=$KEY bytes=$(wc -c < "$TMP_BODY" | tr -d ' ')"
