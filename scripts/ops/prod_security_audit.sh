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

ensure_env_file() {
  if [[ -f ".env" ]]; then
    log ".env found"
    return 0
  fi

  if [[ -f ".env.prod" ]]; then
    cp .env.prod .env
    chmod 600 .env
    log ".env was missing -> restored from .env.prod"
    return 0
  fi

  if [[ -f ".env.production" ]]; then
    log ".env/.env.prod missing -> generating .env.prod from .env.production"
    ./scripts/ops/rotate_prod_secrets.sh --env-in .env.production --env-out .env.prod
    cp .env.prod .env
    chmod 600 .env
    log ".env created from generated .env.prod"
    return 0
  fi

  fail "Cannot build .env automatically: missing both .env.prod and .env.production"
}

ensure_minio_tls_bundle() {
  if file_missing "deploy/tls/minio/public.crt" || file_missing "deploy/tls/minio/private.key" || file_missing "deploy/tls/minio/ca.crt"; then
    log "MinIO TLS bundle is missing -> generating"
    ./scripts/ops/minio_tls_bootstrap.sh
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
  "${PROD_COMPOSE[@]}" up -d --build --remove-orphans --force-recreate backend chat-service email-service worker beat

  log "Waiting app services to become healthy"
  wait_service_healthy "backend" 60
  wait_service_healthy "chat-service" 60
  wait_service_healthy "email-service" 60

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

  while (( attempt <= max_attempts )); do
    ok=0
    IFS=',' read -r -a _urls <<< "$LOCAL_SMOKE_CANDIDATES"
    for candidate in "${_urls[@]}"; do
      candidate="$(echo "$candidate" | xargs)"
      [[ -z "$candidate" ]] && continue

      if ./scripts/ops/check_chat_health.sh "$candidate" >/dev/null 2>&1 && \
         ./scripts/ops/security_smoke.sh "$candidate" >/dev/null 2>&1; then
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
