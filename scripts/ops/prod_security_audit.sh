#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

DOMAIN="${DOMAIN:-ruakb.ru}"
WWW_DOMAIN="${WWW_DOMAIN:-www.ruakb.ru}"
SECOND_DOMAIN="${SECOND_DOMAIN:-ruakb.online}"
SECOND_WWW_DOMAIN="${SECOND_WWW_DOMAIN:-www.ruakb.online}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-admin@ruakb.ru}"
AUTO_CERT_INIT="${AUTO_CERT_INIT:-0}"
SKIP_LOCAL_SMOKE="${SKIP_LOCAL_SMOKE:-0}"
LOCAL_SMOKE_BASE_URL="${LOCAL_SMOKE_BASE_URL:-https://127.0.0.1}"
LOCAL_SMOKE_CANDIDATES="${LOCAL_SMOKE_CANDIDATES:-${LOCAL_SMOKE_BASE_URL},https://localhost,http://127.0.0.1,http://localhost}"
LOCAL_SMOKE_SKIP_DOCKER_CHECKS="${LOCAL_SMOKE_SKIP_DOCKER_CHECKS:-1}"
LOCAL_SMOKE_DEBUG="${LOCAL_SMOKE_DEBUG:-0}"

PROD_COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.nginx.yml)
CERT_COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.nginx.yml -f docker-compose.prod.cert.yml)

log() {
  echo "[SEC-AUDIT] $*"
}

warn() {
  echo "[SEC-AUDIT][WARN] $*" >&2
}

fail() {
  echo "[SEC-AUDIT][ERROR] $*" >&2
  exit 1
}

file_missing() {
  [[ ! -f "$1" ]]
}

lower() {
  echo "${1:-}" | tr '[:upper:]' '[:lower:]'
}

read_env_value() {
  local file="$1"
  local key="$2"
  if [[ ! -f "$file" ]]; then
    echo ""
    return 0
  fi
  grep -E "^${key}=" "$file" | tail -n1 | cut -d= -f2- || true
}

upsert_env_value() {
  local file="$1"
  local key="$2"
  local value="$3"
  local tmp
  tmp="$(mktemp)"
  awk -v k="$key" -v v="$value" '
    BEGIN { done = 0 }
    $0 ~ ("^" k "=") { print k "=" v; done = 1; next }
    { print }
    END { if (!done) print k "=" v }
  ' "$file" > "$tmp"
  mv "$tmp" "$file"
}

is_prod_env() {
  local value
  value="$(lower "${1:-}")"
  [[ "$value" == "prod" || "$value" == "production" ]]
}

is_valid_samesite() {
  local value
  value="$(lower "${1:-}")"
  [[ "$value" == "lax" || "$value" == "strict" || "$value" == "none" ]]
}

is_truthy() {
  local value
  value="$(lower "${1:-}")"
  [[ "$value" == "true" || "$value" == "1" || "$value" == "yes" || "$value" == "on" ]]
}

ensure_env_file() {
  if [[ ! -f ".env" ]]; then
    if [[ -f ".env.prod" ]]; then
      cp .env.prod .env
      chmod 600 .env
      log ".env was missing -> restored from .env.prod"
    elif [[ -f ".env.production" ]]; then
      cp .env.production .env
      chmod 600 .env
      log ".env was missing -> restored from .env.production"
    else
      fail "Cannot build .env automatically: missing .env, .env.prod and .env.production"
    fi
  fi

  local app_env cookie_secure current_samesite strict_origin target_samesite
  local changed=0

  app_env="$(read_env_value ".env" "APP_ENV")"
  cookie_secure="$(read_env_value ".env" "PUBLIC_COOKIE_SECURE")"
  current_samesite="$(read_env_value ".env" "PUBLIC_COOKIE_SAMESITE")"
  strict_origin="$(read_env_value ".env" "PUBLIC_STRICT_ORIGIN_CHECK")"

  target_samesite="$(lower "$current_samesite")"
  if ! is_valid_samesite "$target_samesite"; then
    local fallback_samesite
    fallback_samesite="$(lower "$(read_env_value ".env.prod" "PUBLIC_COOKIE_SAMESITE")")"
    if is_valid_samesite "$fallback_samesite"; then
      target_samesite="$fallback_samesite"
    else
      target_samesite="lax"
    fi
  fi

  if ! is_prod_env "$app_env"; then
    changed=1
  fi
  if ! is_truthy "$cookie_secure"; then
    changed=1
  fi
  if ! is_valid_samesite "$current_samesite"; then
    changed=1
  fi
  if ! is_truthy "$strict_origin"; then
    changed=1
  fi

  if [[ "$changed" == "1" ]]; then
    local backup_file
    backup_file=".env.backup.$(date +%Y%m%d-%H%M%S)"
    cp .env "$backup_file"
    chmod 600 "$backup_file"

    upsert_env_value ".env" "APP_ENV" "prod"
    upsert_env_value ".env" "PUBLIC_COOKIE_SECURE" "true"
    upsert_env_value ".env" "PUBLIC_COOKIE_SAMESITE" "$target_samesite"
    upsert_env_value ".env" "PUBLIC_STRICT_ORIGIN_CHECK" "true"
    chmod 600 .env

    warn ".env updated in-place for production smoke checks (backup: ${backup_file})"
  else
    log ".env found (APP_ENV=$(lower "$app_env"), PUBLIC_COOKIE_SAMESITE=$(lower "$current_samesite"))"
  fi
}

ensure_minio_tls_bundle() {
  if file_missing "deploy/tls/minio/public.crt" || file_missing "deploy/tls/minio/private.key" || file_missing "deploy/tls/minio/ca.crt"; then
    log "MinIO TLS bundle is missing -> generating"
    MINIO_TLS_OVERWRITE=true ./scripts/ops/minio_tls_bootstrap.sh
    return 0
  fi

  if ! openssl x509 -in "deploy/tls/minio/ca.crt" -noout >/dev/null 2>&1; then
    log "MinIO CA certificate is invalid -> regenerating"
    MINIO_TLS_OVERWRITE=true ./scripts/ops/minio_tls_bootstrap.sh
    return 0
  fi

  if ! openssl x509 -in "deploy/tls/minio/public.crt" -noout >/dev/null 2>&1; then
    log "MinIO public certificate is invalid -> regenerating"
    MINIO_TLS_OVERWRITE=true ./scripts/ops/minio_tls_bootstrap.sh
  else
    log "MinIO TLS bundle present"
  fi
}

ensure_compose_files() {
  file_missing "docker-compose.prod.nginx.yml" && fail "Missing docker-compose.prod.nginx.yml"
  file_missing "docker-compose.prod.cert.yml" && fail "Missing docker-compose.prod.cert.yml"
  file_missing "frontend/nginx.prod.conf" && fail "Missing frontend/nginx.prod.conf"
  file_missing "deploy/nginx/edge-http-only.conf" && fail "Missing deploy/nginx/edge-http-only.conf"
  file_missing "deploy/nginx/edge-https.conf" && fail "Missing deploy/nginx/edge-https.conf"
  log "Compose/nginx files present"
}

stack_up_and_migrate() {
  log "Starting core infra services"
  "${PROD_COMPOSE[@]}" up -d --build --remove-orphans --force-recreate db redis minio clamav

  log "Starting app services (backend/chat/email/worker/beat)"
  "${PROD_COMPOSE[@]}" up -d --build --remove-orphans --force-recreate backend chat-service email-service worker beat security-scheduler

  log "Waiting app services to become healthy"
  wait_service_healthy "backend" 60
  wait_service_healthy "chat-service" 60
  wait_service_healthy "email-service" 60
  wait_service_healthy "security-scheduler" 90

  # Force recreate frontend/edge after chat/backend to avoid stale DNS upstream cache in nginx.
  log "Starting/recreating frontend and edge"
  "${PROD_COMPOSE[@]}" up -d --build --remove-orphans --force-recreate frontend edge

  log "Applying migrations"
  "${PROD_COMPOSE[@]}" exec -T backend alembic upgrade head
}

run_security_preflight() {
  log "Running production security preflight (app-level config validation)"
  "${PROD_COMPOSE[@]}" run --rm --no-deps backend python - <<'PY'
from app.core.config import validate_production_security_or_raise
validate_production_security_or_raise("prod-security-audit")
print("production security config validation: ok")
PY
}

wait_service_healthy() {
  local service="$1"
  local max_attempts="${2:-60}"
  local attempt=1
  local cid=""
  local status=""

  while (( attempt <= max_attempts )); do
    cid="$("${PROD_COMPOSE[@]}" ps -q "$service" 2>/dev/null || true)"
    if [[ -n "$cid" ]]; then
      status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || true)"
      case "$status" in
        healthy|running)
          return 0
          ;;
      esac
    fi
    sleep 2
    attempt=$((attempt + 1))
  done

  fail "Service '${service}' did not become healthy in time (last_status=${status:-unknown})"
}

run_local_smoke() {
  if [[ "$SKIP_LOCAL_SMOKE" == "1" ]]; then
    log "Skipping local smoke checks (SKIP_LOCAL_SMOKE=1)"
    return 0
  fi

  log "Running local smoke checks (candidates: ${LOCAL_SMOKE_CANDIDATES})"
  local max_attempts="${LOCAL_SMOKE_MAX_ATTEMPTS:-24}"
  local sleep_seconds="${LOCAL_SMOKE_SLEEP_SECONDS:-5}"
  local attempt=1
  local candidate
  local ok=0
  local debug_log
  debug_log="$(mktemp)"
  trap 'rm -f "$debug_log"' RETURN

  while (( attempt <= max_attempts )); do
    ok=0
    IFS=',' read -r -a _urls <<< "$LOCAL_SMOKE_CANDIDATES"
    for candidate in "${_urls[@]}"; do
      candidate="$(echo "$candidate" | xargs)"
      [[ -z "$candidate" ]] && continue

      : > "$debug_log"
      local health_rc smoke_rc
      if CHECK_CHAT_HEALTH_SKIP_DOCKER_CHECKS="$LOCAL_SMOKE_SKIP_DOCKER_CHECKS" ./scripts/ops/check_chat_health.sh "$candidate" >"$debug_log" 2>&1; then
        health_rc=0
      else
        health_rc=$?
      fi
      if [[ $health_rc -ne 0 ]]; then
        if [[ "$LOCAL_SMOKE_DEBUG" == "1" || "$attempt" -eq "$max_attempts" ]]; then
          warn "local smoke health check failed for ${candidate} (rc=${health_rc})"
          sed -n '1,120p' "$debug_log" >&2 || true
        fi
        continue
      fi

      : > "$debug_log"
      if SECURITY_SMOKE_SKIP_DOCKER_CHECKS="$LOCAL_SMOKE_SKIP_DOCKER_CHECKS" ./scripts/ops/security_smoke.sh "$candidate" >"$debug_log" 2>&1; then
        smoke_rc=0
      else
        smoke_rc=$?
      fi
      if [[ $smoke_rc -ne 0 ]]; then
        if [[ "$LOCAL_SMOKE_DEBUG" == "1" || "$attempt" -eq "$max_attempts" ]]; then
          warn "local smoke security checks failed for ${candidate} (rc=${smoke_rc})"
          sed -n '1,160p' "$debug_log" >&2 || true
        fi
        continue
      fi

      if [[ $health_rc -eq 0 && $smoke_rc -eq 0 ]]; then
        log "Local smoke checks passed via ${candidate} (attempt ${attempt}/${max_attempts})"
        ok=1
        break
      fi
    done

    if [[ "$ok" == "1" ]]; then
      return 0
    fi

    warn "Local smoke not ready yet (attempt ${attempt}/${max_attempts}), retrying in ${sleep_seconds}s"
    sleep "$sleep_seconds"
    attempt=$((attempt + 1))
  done

  fail "Local smoke checks failed after ${max_attempts} attempts (candidates: ${LOCAL_SMOKE_CANDIDATES})"
}

run_domain_quick_health_wait() {
  local url="$1"
  local max_attempts="${DOMAIN_HEALTH_MAX_ATTEMPTS:-24}"
  local sleep_seconds="${DOMAIN_HEALTH_SLEEP_SECONDS:-5}"
  local attempt=1

  while (( attempt <= max_attempts )); do
    if https_health_ok "$url"; then
      return 0
    fi
    warn "HTTPS health not ready for ${url} (attempt ${attempt}/${max_attempts}), retrying in ${sleep_seconds}s"
    sleep "$sleep_seconds"
    attempt=$((attempt + 1))
  done

  return 1
}

run_domain_smoke() {
  local domain="$1"
  [[ -z "$domain" ]] && return 0
  local url="https://${domain}"

  if ! run_domain_quick_health_wait "$url"; then
    if [[ "$AUTO_CERT_INIT" == "1" ]]; then
      cert_bootstrap
      run_domain_quick_health_wait "$url" || fail "HTTPS health still failing after cert bootstrap: ${url}/health"
    else
      fail "HTTPS health check failed: ${url}/health (set AUTO_CERT_INIT=1 to auto-bootstrap certs)"
    fi
  fi

  log "Running security smoke for $url"
  ./scripts/ops/security_smoke.sh "$url" >/dev/null
  log "Domain security smoke passed: $url"
}

https_health_ok() {
  local url="$1"
  local code
  code="$(curl -k -sS -o /dev/null -w "%{http_code}" "${url%/}/health" || true)"
  [[ "$code" == "200" ]]
}

cert_bootstrap() {
  log "AUTO_CERT_INIT=1 and https health failed -> running cert bootstrap"
  "${CERT_COMPOSE[@]}" up -d --build db redis minio backend chat-service email-service worker beat frontend edge
  "${CERT_COMPOSE[@]}" run --rm certbot certonly --webroot -w /var/www/certbot \
    --email "$LETSENCRYPT_EMAIL" --agree-tos --no-eff-email --non-interactive --expand \
    -d "$DOMAIN" -d "$WWW_DOMAIN" -d "$SECOND_DOMAIN" -d "$SECOND_WWW_DOMAIN"
  "${PROD_COMPOSE[@]}" up -d --build edge
}

run_incident_report() {
  log "Generating incident checklist snapshot"
  ./scripts/ops/incident_checklist.sh \
    --severity LOW \
    --category MONITORING_ALERT \
    --summary "Scheduled production security audit completed"
}

print_summary() {
  log "Collecting final status"
  "${PROD_COMPOSE[@]}" ps
  local latest_security_report
  latest_security_report="$(ls -1t reports/security/security-smoke-*.md 2>/dev/null | head -n 1 || true)"
  local latest_incident_report
  latest_incident_report="$(ls -1t reports/incidents/incident-*.md 2>/dev/null | head -n 1 || true)"
  [[ -n "$latest_security_report" ]] && log "Latest security smoke report: $latest_security_report"
  [[ -n "$latest_incident_report" ]] && log "Latest incident checklist: $latest_incident_report"
}

main() {
  ensure_compose_files
  ensure_env_file
  ensure_minio_tls_bundle

  stack_up_and_migrate
  run_security_preflight
  run_local_smoke
  run_domain_smoke "$DOMAIN"
  run_domain_smoke "$SECOND_DOMAIN"
  run_incident_report
  print_summary

  log "Production security audit completed successfully"
}

main "$@"
