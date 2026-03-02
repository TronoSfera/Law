#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

ENV_IN=".env.production"
ENV_OUT=".env.prod"
APPLY_RUNNING=0
SKIP_DB_ROTATE=0
SKIP_RESTART=0
COMPOSE_OVERRIDE="docker-compose.prod.nginx.yml"
NON_INTERACTIVE=0
REQUIRED_CONFIRM_TOKEN="ROTATE-PROD-SECRETS"
CONFIRM_TOKEN_INPUT=""

usage() {
  cat <<'EOF'
Usage:
  scripts/ops/rotate_prod_secrets.sh [options]

Options:
  --env-in <file>           Source env template (default: .env.production)
  --env-out <file>          Output env file with rotated secrets (default: .env.prod)
  --compose-override <file> Compose override for production apply (default: docker-compose.prod.nginx.yml)
  --apply-running           Apply generated env to running stack (.env replace + DB password rotate + recreate)
  --non-interactive         Disable prompt confirmation (requires valid --require-confirmation-token)
  --require-confirmation-token <token>
                            Mandatory token for --apply-running. Expected: ROTATE-PROD-SECRETS
  --skip-db-rotate          With --apply-running: do not run ALTER USER in Postgres
  --skip-restart            With --apply-running: do not recreate stack / migrate / health checks
  -h, --help                Show help

Examples:
  scripts/ops/rotate_prod_secrets.sh
  scripts/ops/rotate_prod_secrets.sh --apply-running
  scripts/ops/rotate_prod_secrets.sh --env-in .env --env-out .env.prod --apply-running
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-in)
      ENV_IN="${2:-}"
      shift 2
      ;;
    --env-out)
      ENV_OUT="${2:-}"
      shift 2
      ;;
    --compose-override)
      COMPOSE_OVERRIDE="${2:-}"
      shift 2
      ;;
    --apply-running)
      APPLY_RUNNING=1
      shift
      ;;
    --non-interactive)
      NON_INTERACTIVE=1
      shift
      ;;
    --require-confirmation-token)
      CONFIRM_TOKEN_INPUT="${2:-}"
      shift 2
      ;;
    --skip-db-rotate)
      SKIP_DB_ROTATE=1
      shift
      ;;
    --skip-restart)
      SKIP_RESTART=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[ERROR] Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ ! -f "$ENV_IN" ]]; then
  echo "[ERROR] Input env file not found: $ENV_IN" >&2
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "[ERROR] openssl not found (required for secret generation)" >&2
  exit 1
fi

COMPOSE_ARGS=(-f docker-compose.yml -f "$COMPOSE_OVERRIDE")
if [[ "$APPLY_RUNNING" -eq 1 && ! -f "$COMPOSE_OVERRIDE" ]]; then
  echo "[ERROR] Compose override file not found: $COMPOSE_OVERRIDE" >&2
  exit 1
fi

rand_alnum() {
  local length="${1:-64}"
  local bytes=$(( (length + 1) / 2 ))
  openssl rand -hex "$bytes" | cut -c1-"$length"
}

rand_secret() {
  local length="${1:-64}"
  local out
  out="$(openssl rand -base64 "$length" | tr -d '\n' | tr '+/' 'AZ' | tr -dc 'A-Za-z0-9' | cut -c1-"$length")"
  if [[ "${#out}" -lt "$length" ]]; then
    out="${out}$(rand_alnum "$((length - ${#out}))")"
  fi
  echo "$out"
}

read_env_value() {
  local key="$1"
  local file="$2"
  local value
  value="$(grep -E "^${key}=" "$file" | tail -n1 | cut -d= -f2- || true)"
  echo "$value"
}

upsert_env_value() {
  local key="$1"
  local value="$2"
  local file="$3"
  local tmp
  tmp="$(mktemp)"
  awk -v k="$key" -v v="$value" '
    BEGIN { done = 0 }
    $0 ~ ("^" k "=") { print k "=" v; done = 1; next }
    { print }
    END {
      if (!done) print k "=" v
    }
  ' "$file" > "$tmp"
  mv "$tmp" "$file"
}

db_url_with_password() {
  local current_url="$1"
  local user="$2"
  local pass="$3"
  local db_name="$4"
  if [[ -n "$current_url" && "$current_url" =~ ^([^:]+://[^:]+:)[^@]*(@.*)$ ]]; then
    echo "${BASH_REMATCH[1]}${pass}${BASH_REMATCH[2]}"
    return 0
  fi
  echo "postgresql+psycopg://${user}:${pass}@db:5432/${db_name}"
}

echo "[1/5] Preparing output env file..."
cp "$ENV_IN" "$ENV_OUT"
chmod 600 "$ENV_OUT"

NEW_ADMIN_JWT_SECRET="$(rand_secret 64)"
NEW_PUBLIC_JWT_SECRET="$(rand_secret 64)"
NEW_DATA_ENCRYPTION_SECRET="$(rand_secret 64)"
NEW_CHAT_ENCRYPTION_SECRET="$(rand_secret 64)"
NEW_ENC_KID="k$(date -u +%Y%m%d%H%M)"
NEW_INTERNAL_SERVICE_TOKEN="$(rand_secret 64)"
NEW_POSTGRES_PASSWORD="$(rand_secret 40)"
NEW_MINIO_ROOT_USER="minio_$(rand_alnum 14 | tr '[:upper:]' '[:lower:]')"
NEW_MINIO_ROOT_PASSWORD="$(rand_secret 48)"
NEW_S3_ACCESS_KEY="$(rand_alnum 20)"
NEW_S3_SECRET_KEY="$(rand_secret 48)"
NEW_BOOTSTRAP_PASSWORD="$(rand_secret 32)"

POSTGRES_USER_VALUE="$(read_env_value "POSTGRES_USER" "$ENV_OUT")"
POSTGRES_DB_VALUE="$(read_env_value "POSTGRES_DB" "$ENV_OUT")"
DATABASE_URL_VALUE="$(read_env_value "DATABASE_URL" "$ENV_OUT")"

if [[ -z "$POSTGRES_USER_VALUE" ]]; then
  POSTGRES_USER_VALUE="postgres"
fi
if [[ -z "$POSTGRES_DB_VALUE" ]]; then
  POSTGRES_DB_VALUE="legal"
fi

NEW_DATABASE_URL="$(db_url_with_password "$DATABASE_URL_VALUE" "$POSTGRES_USER_VALUE" "$NEW_POSTGRES_PASSWORD" "$POSTGRES_DB_VALUE")"

echo "[2/5] Writing rotated internal secrets into $ENV_OUT..."
upsert_env_value "APP_ENV" "prod" "$ENV_OUT"
upsert_env_value "PRODUCTION_ENFORCE_SECURE_SETTINGS" "true" "$ENV_OUT"
upsert_env_value "OTP_DEV_MODE" "false" "$ENV_OUT"
upsert_env_value "ADMIN_BOOTSTRAP_ENABLED" "false" "$ENV_OUT"
upsert_env_value "PUBLIC_COOKIE_SECURE" "true" "$ENV_OUT"
upsert_env_value "S3_USE_SSL" "true" "$ENV_OUT"
upsert_env_value "S3_VERIFY_SSL" "true" "$ENV_OUT"
upsert_env_value "S3_CA_CERT_PATH" "/etc/ssl/minio/ca.crt" "$ENV_OUT"
upsert_env_value "MINIO_TLS_ENABLED" "true" "$ENV_OUT"
upsert_env_value "PUBLIC_STRICT_ORIGIN_CHECK" "true" "$ENV_OUT"
upsert_env_value "CORS_ALLOW_METHODS" "GET,POST,PUT,PATCH,DELETE,OPTIONS" "$ENV_OUT"
upsert_env_value "CORS_ALLOW_HEADERS" "Authorization,Content-Type,X-Requested-With,X-Request-ID" "$ENV_OUT"
upsert_env_value "CORS_ALLOW_CREDENTIALS" "true" "$ENV_OUT"
upsert_env_value "ADMIN_AUTH_MODE" "password_totp_required" "$ENV_OUT"

upsert_env_value "ADMIN_JWT_SECRET" "$NEW_ADMIN_JWT_SECRET" "$ENV_OUT"
upsert_env_value "PUBLIC_JWT_SECRET" "$NEW_PUBLIC_JWT_SECRET" "$ENV_OUT"
upsert_env_value "DATA_ENCRYPTION_SECRET" "$NEW_DATA_ENCRYPTION_SECRET" "$ENV_OUT"
upsert_env_value "CHAT_ENCRYPTION_SECRET" "$NEW_CHAT_ENCRYPTION_SECRET" "$ENV_OUT"
upsert_env_value "DATA_ENCRYPTION_ACTIVE_KID" "$NEW_ENC_KID" "$ENV_OUT"
upsert_env_value "CHAT_ENCRYPTION_ACTIVE_KID" "$NEW_ENC_KID" "$ENV_OUT"
upsert_env_value "DATA_ENCRYPTION_KEYS" "${NEW_ENC_KID}=${NEW_DATA_ENCRYPTION_SECRET}" "$ENV_OUT"
upsert_env_value "CHAT_ENCRYPTION_KEYS" "${NEW_ENC_KID}=${NEW_CHAT_ENCRYPTION_SECRET}" "$ENV_OUT"
upsert_env_value "INTERNAL_SERVICE_TOKEN" "$NEW_INTERNAL_SERVICE_TOKEN" "$ENV_OUT"

upsert_env_value "POSTGRES_PASSWORD" "$NEW_POSTGRES_PASSWORD" "$ENV_OUT"
upsert_env_value "DATABASE_URL" "$NEW_DATABASE_URL" "$ENV_OUT"

upsert_env_value "MINIO_ROOT_USER" "$NEW_MINIO_ROOT_USER" "$ENV_OUT"
upsert_env_value "MINIO_ROOT_PASSWORD" "$NEW_MINIO_ROOT_PASSWORD" "$ENV_OUT"
upsert_env_value "S3_ACCESS_KEY" "$NEW_S3_ACCESS_KEY" "$ENV_OUT"
upsert_env_value "S3_SECRET_KEY" "$NEW_S3_SECRET_KEY" "$ENV_OUT"
upsert_env_value "ADMIN_BOOTSTRAP_PASSWORD" "$NEW_BOOTSTRAP_PASSWORD" "$ENV_OUT"

if [[ "$APPLY_RUNNING" -eq 0 ]]; then
  echo "[3/5] Completed in prepare mode."
  echo "Generated file: $ENV_OUT"
  echo "Next step: run with --apply-running to update live stack."
  exit 0
fi

if [[ ! -f ".env" ]]; then
  echo "[ERROR] .env not found for --apply-running mode" >&2
  exit 1
fi

if [[ "$CONFIRM_TOKEN_INPUT" != "$REQUIRED_CONFIRM_TOKEN" ]]; then
  echo "[ERROR] Invalid or missing confirmation token." >&2
  echo "Pass: --require-confirmation-token $REQUIRED_CONFIRM_TOKEN" >&2
  exit 1
fi

if [[ "$NON_INTERACTIVE" -eq 0 ]]; then
  echo "WARNING: applying rotated secrets to running production stack."
  echo "This will recreate services and invalidate active auth sessions."
  read -r -p "Type $REQUIRED_CONFIRM_TOKEN to continue: " typed_token
  if [[ "$typed_token" != "$REQUIRED_CONFIRM_TOKEN" ]]; then
    echo "[ABORT] Confirmation token mismatch." >&2
    exit 1
  fi
fi

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE=".env.backup.${TIMESTAMP}"

echo "[3/5] Backing up and activating new .env..."
cp .env "$BACKUP_FILE"
chmod 600 "$BACKUP_FILE"
cp "$ENV_OUT" .env
chmod 600 .env

if [[ "$SKIP_DB_ROTATE" -eq 0 ]]; then
  echo "[4/5] Rotating Postgres user password inside DB..."
  docker compose "${COMPOSE_ARGS[@]}" up -d db >/dev/null
  docker compose "${COMPOSE_ARGS[@]}" exec -T db \
    psql -U "$POSTGRES_USER_VALUE" -d postgres \
    -c "ALTER USER \"$POSTGRES_USER_VALUE\" WITH PASSWORD '$NEW_POSTGRES_PASSWORD';"
else
  echo "[4/5] Skipped DB password ALTER USER (--skip-db-rotate)."
fi

if [[ "$SKIP_RESTART" -eq 0 ]]; then
  echo "[5/5] Recreating stack, applying migrations, and checking health..."
  docker compose "${COMPOSE_ARGS[@]}" up -d --build --force-recreate --remove-orphans
  docker compose "${COMPOSE_ARGS[@]}" exec -T backend alembic upgrade head
  curl -fsS http://localhost/health >/dev/null
  curl -fsS http://localhost/chat-health >/dev/null
  curl -fsS http://localhost/email-health >/dev/null
else
  echo "[5/5] Skipped stack restart/migrations/health checks (--skip-restart)."
fi

echo "Rotation completed."
echo "Backup file: $BACKUP_FILE"
echo "Active env: .env"
echo "Generated env snapshot: $ENV_OUT"
