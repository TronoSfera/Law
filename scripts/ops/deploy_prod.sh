#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "[ERROR] .env not found in $ROOT_DIR"
  exit 1
fi

read_env_var() {
  local key="$1"
  local value
  value="$(grep -E "^${key}=" .env | tail -n1 | cut -d= -f2- || true)"
  echo "$value"
}

is_truthy() {
  local value="${1:-}"
  [[ "$value" == "true" || "$value" == "1" ]]
}

is_insecure_secret() {
  local value="${1:-}"
  local lowered
  lowered="$(echo "$value" | tr '[:upper:]' '[:lower:]')"
  if [[ -z "$value" || "${#value}" -lt 24 ]]; then
    return 0
  fi
  if [[ "$lowered" == *"change_me"* || "$lowered" == *"admin123"* || "$lowered" == *"password"* || "$lowered" == *"example"* ]]; then
    return 0
  fi
  return 1
}

contains_localhost_origin() {
  local csv="${1:-}"
  local normalized
  normalized="$(echo "$csv" | tr '[:upper:]' '[:lower:]')"
  [[ "$normalized" == *"localhost"* || "$normalized" == *"127.0.0.1"* ]]
}

fail_if_insecure_env() {
  local app_env otp_dev bootstrap cookie_secure s3_ssl s3_verify s3_endpoint s3_ca_path strict_origin
  local chat_secret minio_user minio_password
  local minio_tls_enabled
  local admin_jwt public_jwt data_secret data_kid data_keys chat_kid chat_keys internal_token
  local public_allowed cors_origins admin_auth_mode
  app_env="$(read_env_var APP_ENV)"
  otp_dev="$(read_env_var OTP_DEV_MODE)"
  bootstrap="$(read_env_var ADMIN_BOOTSTRAP_ENABLED)"
  cookie_secure="$(read_env_var PUBLIC_COOKIE_SECURE)"
  s3_ssl="$(read_env_var S3_USE_SSL)"
  s3_verify="$(read_env_var S3_VERIFY_SSL)"
  s3_endpoint="$(read_env_var S3_ENDPOINT)"
  s3_ca_path="$(read_env_var S3_CA_CERT_PATH)"
  strict_origin="$(read_env_var PUBLIC_STRICT_ORIGIN_CHECK)"
  public_allowed="$(read_env_var PUBLIC_ALLOWED_WEB_ORIGINS)"
  cors_origins="$(read_env_var CORS_ORIGINS)"
  admin_auth_mode="$(read_env_var ADMIN_AUTH_MODE)"
  chat_secret="$(read_env_var CHAT_ENCRYPTION_SECRET)"
  admin_jwt="$(read_env_var ADMIN_JWT_SECRET)"
  public_jwt="$(read_env_var PUBLIC_JWT_SECRET)"
  data_secret="$(read_env_var DATA_ENCRYPTION_SECRET)"
  data_kid="$(read_env_var DATA_ENCRYPTION_ACTIVE_KID)"
  data_keys="$(read_env_var DATA_ENCRYPTION_KEYS)"
  chat_kid="$(read_env_var CHAT_ENCRYPTION_ACTIVE_KID)"
  chat_keys="$(read_env_var CHAT_ENCRYPTION_KEYS)"
  internal_token="$(read_env_var INTERNAL_SERVICE_TOKEN)"
  minio_user="$(read_env_var MINIO_ROOT_USER)"
  minio_password="$(read_env_var MINIO_ROOT_PASSWORD)"
  minio_tls_enabled="$(read_env_var MINIO_TLS_ENABLED)"

  if [[ "$app_env" != "prod" && "$app_env" != "production" ]]; then
    echo "[WARN] APP_ENV is '$app_env' (expected: prod)"
  fi
  if is_truthy "$otp_dev"; then
    echo "[ERROR] OTP_DEV_MODE must be false for production"
    exit 1
  fi
  if is_truthy "$bootstrap"; then
    echo "[ERROR] ADMIN_BOOTSTRAP_ENABLED must be false for production"
    exit 1
  fi
  if ! is_truthy "$cookie_secure"; then
    echo "[ERROR] PUBLIC_COOKIE_SECURE must be true for production"
    exit 1
  fi
  if ! is_truthy "$s3_ssl"; then
    echo "[ERROR] S3_USE_SSL must be true for production"
    exit 1
  fi
  if ! is_truthy "$s3_verify"; then
    echo "[ERROR] S3_VERIFY_SSL must be true for production"
    exit 1
  fi
  if [[ "${s3_endpoint,,}" != https://* ]]; then
    echo "[ERROR] S3_ENDPOINT must start with https:// in production"
    exit 1
  fi
  if [[ -z "$s3_ca_path" ]]; then
    echo "[ERROR] S3_CA_CERT_PATH must be configured for trusted internal TLS"
    exit 1
  fi
  if ! is_truthy "$minio_tls_enabled"; then
    echo "[ERROR] MINIO_TLS_ENABLED must be true for production"
    exit 1
  fi
  if ! is_truthy "$strict_origin"; then
    echo "[ERROR] PUBLIC_STRICT_ORIGIN_CHECK must be true for production"
    exit 1
  fi
  if contains_localhost_origin "$public_allowed"; then
    echo "[ERROR] PUBLIC_ALLOWED_WEB_ORIGINS must not include localhost/127.0.0.1 in production"
    exit 1
  fi
  if contains_localhost_origin "$cors_origins"; then
    echo "[ERROR] CORS_ORIGINS must not include localhost/127.0.0.1 in production"
    exit 1
  fi
  if [[ "$admin_auth_mode" != "password_totp_required" ]]; then
    echo "[ERROR] ADMIN_AUTH_MODE must be password_totp_required in production"
    exit 1
  fi
  if is_insecure_secret "$chat_secret"; then
    echo "[ERROR] CHAT_ENCRYPTION_SECRET must be configured and non-default"
    exit 1
  fi
  if is_insecure_secret "$admin_jwt"; then
    echo "[ERROR] ADMIN_JWT_SECRET must be configured and strong"
    exit 1
  fi
  if is_insecure_secret "$public_jwt"; then
    echo "[ERROR] PUBLIC_JWT_SECRET must be configured and strong"
    exit 1
  fi
  if is_insecure_secret "$data_secret"; then
    echo "[ERROR] DATA_ENCRYPTION_SECRET must be configured and strong"
    exit 1
  fi
  if [[ -z "$data_kid" ]]; then
    echo "[ERROR] DATA_ENCRYPTION_ACTIVE_KID must be set"
    exit 1
  fi
  if [[ -n "$data_keys" && "$data_keys" != *"${data_kid}="* ]]; then
    echo "[ERROR] DATA_ENCRYPTION_KEYS must contain active kid (${data_kid}=...)"
    exit 1
  fi
  if [[ -n "$chat_kid" && -n "$chat_keys" && "$chat_keys" != *"${chat_kid}="* ]]; then
    echo "[ERROR] CHAT_ENCRYPTION_KEYS must contain active kid (${chat_kid}=...)"
    exit 1
  fi
  if is_insecure_secret "$internal_token"; then
    echo "[ERROR] INTERNAL_SERVICE_TOKEN must be configured and strong"
    exit 1
  fi
  if [[ -z "$minio_user" || "$minio_user" == "minioadmin" || "$minio_user" == "minio_local_admin" ]]; then
    echo "[ERROR] MINIO_ROOT_USER must be set to non-default value"
    exit 1
  fi
  if is_insecure_secret "$minio_password" || [[ "$minio_password" == "minioadmin" ]]; then
    echo "[ERROR] MINIO_ROOT_PASSWORD must be set to non-default value"
    exit 1
  fi
  if [[ ! -f "deploy/tls/minio/public.crt" || ! -f "deploy/tls/minio/private.key" || ! -f "deploy/tls/minio/ca.crt" ]]; then
    echo "[ERROR] MinIO TLS cert bundle is missing. Run: ./scripts/ops/minio_tls_bootstrap.sh"
    exit 1
  fi
}

fail_if_insecure_env

echo "[1/4] Build and start production stack..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

echo "[2/4] Apply migrations..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T backend alembic upgrade head

echo "[3/4] Service status..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps

echo "[4/4] Smoke checks..."
curl -fsS http://localhost/health >/dev/null
curl -fsS http://localhost/chat-health >/dev/null
curl -fsS http://localhost/email-health >/dev/null

echo "Done. Open https://ruakb.ru"
