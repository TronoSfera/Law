#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=".env"
KID=""
DATA_SECRET=""
CHAT_SECRET=""

usage() {
  cat <<USAGE
Usage:
  scripts/ops/rotate_encryption_kid.sh [options]

Options:
  --env-file <path>      Env file to update (default: .env)
  --kid <kid>            KID to activate (default: kYYYYMMDDHHMM)
  --data-secret <value>  DATA key secret (default: generated)
  --chat-secret <value>  CHAT key secret (default: same as data secret)
  -h, --help

Result:
  - Updates DATA_ENCRYPTION_KEYS / CHAT_ENCRYPTION_KEYS
  - Sets DATA_ENCRYPTION_ACTIVE_KID / CHAT_ENCRYPTION_ACTIVE_KID

After updating env:
  1) restart backend/chat/worker with new env
  2) run re-encryption:
     docker compose exec -T backend python -m app.scripts.reencrypt_with_active_kid --apply
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      ENV_FILE="${2:-}"
      shift 2
      ;;
    --kid)
      KID="${2:-}"
      shift 2
      ;;
    --data-secret)
      DATA_SECRET="${2:-}"
      shift 2
      ;;
    --chat-secret)
      CHAT_SECRET="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[ERROR] Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[ERROR] Env file not found: $ENV_FILE" >&2
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "[ERROR] openssl not found" >&2
  exit 1
fi

if [[ -z "$KID" ]]; then
  KID="k$(date -u +%Y%m%d%H%M)"
fi

if [[ -z "$DATA_SECRET" ]]; then
  DATA_SECRET="$(openssl rand -base64 64 | tr -d '\n' | tr '+/' 'AZ' | tr -dc 'A-Za-z0-9' | cut -c1-64)"
fi

if [[ -z "$CHAT_SECRET" ]]; then
  CHAT_SECRET="$DATA_SECRET"
fi

read_env_var() {
  local key="$1"
  grep -E "^${key}=" "$ENV_FILE" | tail -n1 | cut -d= -f2- || true
}

upsert_env_var() {
  local key="$1"
  local value="$2"
  local tmp
  tmp="$(mktemp)"
  awk -v k="$key" -v v="$value" '
    BEGIN { done = 0 }
    $0 ~ ("^" k "=") { print k "=" v; done = 1; next }
    { print }
    END { if (!done) print k "=" v }
  ' "$ENV_FILE" > "$tmp"
  mv "$tmp" "$ENV_FILE"
}

merge_kid_secret() {
  local csv="$1"
  local kid="$2"
  local secret="$3"
  local out=""
  local found="0"
  IFS=',' read -r -a parts <<< "$csv"
  for part in "${parts[@]}"; do
    local token key value
    token="$(echo "$part" | xargs)"
    [[ -z "$token" ]] && continue
    if [[ "$token" == *=* ]]; then
      key="${token%%=*}"
      value="${token#*=}"
      key="$(echo "$key" | xargs)"
      value="$(echo "$value" | xargs)"
      if [[ "$key" == "$kid" ]]; then
        token="${kid}=${secret}"
        found="1"
      fi
    fi
    if [[ -n "$out" ]]; then
      out+="${out:+,}${token}"
    else
      out="$token"
    fi
  done
  if [[ "$found" != "1" ]]; then
    if [[ -n "$out" ]]; then
      out+=",${kid}=${secret}"
    else
      out="${kid}=${secret}"
    fi
  fi
  echo "$out"
}

current_data_keys="$(read_env_var DATA_ENCRYPTION_KEYS)"
current_chat_keys="$(read_env_var CHAT_ENCRYPTION_KEYS)"
new_data_keys="$(merge_kid_secret "$current_data_keys" "$KID" "$DATA_SECRET")"
new_chat_keys="$(merge_kid_secret "$current_chat_keys" "$KID" "$CHAT_SECRET")"

upsert_env_var "DATA_ENCRYPTION_KEYS" "$new_data_keys"
upsert_env_var "CHAT_ENCRYPTION_KEYS" "$new_chat_keys"
upsert_env_var "DATA_ENCRYPTION_ACTIVE_KID" "$KID"
upsert_env_var "CHAT_ENCRYPTION_ACTIVE_KID" "$KID"

echo "[OK] Updated $ENV_FILE"
echo "  DATA_ENCRYPTION_ACTIVE_KID=$KID"
echo "  CHAT_ENCRYPTION_ACTIVE_KID=$KID"
echo
echo "Next steps:"
echo "  1) restart backend/chat/worker with updated env"
echo "  2) re-encrypt historical data:"
echo "     docker compose exec -T backend python -m app.scripts.reencrypt_with_active_kid --apply"
