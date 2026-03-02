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
  log "Starting production stack (nginx profile)"
  "${PROD_COMPOSE[@]}" up -d --build --remove-orphans db redis minio backend chat-service email-service worker beat frontend edge clamav

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

run_local_smoke() {
  log "Running local smoke checks via localhost"
  ./scripts/ops/check_chat_health.sh http://localhost >/dev/null
  ./scripts/ops/security_smoke.sh http://localhost >/dev/null
  log "Local smoke checks passed"
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

run_domain_smoke() {
  local domain="$1"
  [[ -z "$domain" ]] && return 0
  local url="https://${domain}"

  if ! https_health_ok "$url"; then
    if [[ "$AUTO_CERT_INIT" == "1" ]]; then
      cert_bootstrap
      https_health_ok "$url" || fail "HTTPS health still failing after cert bootstrap: ${url}/health"
    else
      fail "HTTPS health check failed: ${url}/health (set AUTO_CERT_INIT=1 to auto-bootstrap certs)"
    fi
  fi

  log "Running security smoke for $url"
  ./scripts/ops/security_smoke.sh "$url" >/dev/null
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
