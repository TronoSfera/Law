#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

BASE_URL="${1:-http://localhost:8081}"
REPORT_DIR="${REPORT_DIR:-reports/security}"
TS_HUMAN="$(date -u +"%Y-%m-%d %H:%M:%S UTC")"
TS_FILE="$(date -u +"%Y%m%d-%H%M%S")"
REPORT_FILE="${REPORT_DIR}/security-smoke-${TS_FILE}.md"

mkdir -p "$REPORT_DIR"

failures=()
warnings=()
passes=()

add_pass() { passes+=("$1"); }
add_warn() { warnings+=("$1"); }
add_fail() { failures+=("$1"); }

lower() {
  echo "$1" | tr '[:upper:]' '[:lower:]'
}

read_env_var() {
  local key="$1"
  if [[ ! -f ".env" ]]; then
    echo ""
    return 0
  fi
  grep -E "^${key}=" .env | tail -n1 | cut -d= -f2- || true
}

is_truthy() {
  local value
  value="$(lower "${1:-}")"
  [[ "$value" == "true" || "$value" == "1" || "$value" == "yes" || "$value" == "on" ]]
}

http_status_ok() {
  local url="$1"
  local code
  code="$(curl -k -sS -o /dev/null -w "%{http_code}" "$url" || true)"
  [[ "$code" == "200" ]]
}

check_required_headers() {
  local url="$1"
  local head
  head="$(curl -k -sS -I "$url" || true)"
  local normalized
  normalized="$(echo "$head" | tr -d '\r' | tr '[:upper:]' '[:lower:]')"

  if [[ "$normalized" == *"x-content-type-options: nosniff"* ]]; then
    add_pass "header: X-Content-Type-Options=nosniff"
  else
    add_fail "missing/invalid header X-Content-Type-Options at ${url}"
  fi
  if [[ "$normalized" == *"x-frame-options:"* ]]; then
    add_pass "header: X-Frame-Options present"
  else
    add_fail "missing header X-Frame-Options at ${url}"
  fi
  if [[ "$normalized" == *"referrer-policy:"* ]]; then
    add_pass "header: Referrer-Policy present"
  else
    add_fail "missing header Referrer-Policy at ${url}"
  fi
  if [[ "$normalized" == *"content-security-policy:"* ]]; then
    add_pass "header: Content-Security-Policy present"
  else
    add_fail "missing header Content-Security-Policy at ${url}"
  fi
}

check_tls_cert() {
  local url="$1"
  if [[ "$url" != https://* ]]; then
    add_warn "tls check skipped (BASE_URL is not https): ${url}"
    return 0
  fi

  local hostport host port cert not_after
  hostport="${url#https://}"
  hostport="${hostport%%/*}"
  host="${hostport%%:*}"
  port="443"
  if [[ "$hostport" == *:* ]]; then
    port="${hostport##*:}"
  fi

  cert="$(echo | openssl s_client -connect "${host}:${port}" -servername "${host}" 2>/dev/null || true)"
  if [[ "$cert" != *"BEGIN CERTIFICATE"* ]]; then
    add_fail "tls certificate is not available for ${host}:${port}"
    return 1
  fi

  not_after="$(echo "$cert" | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2- || true)"
  if [[ -z "$not_after" ]]; then
    add_fail "tls certificate enddate cannot be read for ${host}:${port}"
    return 1
  fi

  local days_left
  days_left="$(python3 - <<PY
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
value = """${not_after}""".strip()
try:
    dt = parsedate_to_datetime(value)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    left = int((dt - datetime.now(timezone.utc)).total_seconds() // 86400)
    print(left)
except Exception:
    print(-9999)
PY
)"
  if [[ "$days_left" == "-9999" ]]; then
    add_fail "tls certificate date parse error for ${host}:${port}"
    return 1
  fi
  if (( days_left < 7 )); then
    add_fail "tls certificate expires too soon (${days_left} days) for ${host}:${port}"
    return 1
  fi
  add_pass "tls certificate valid for ${host}:${port} (days_left=${days_left})"
  return 0
}

check_cookie_and_security_flags() {
  if [[ ! -f ".env" ]]; then
    add_warn ".env not found: config smoke checks skipped"
    return 0
  fi

  local app_env cookie_secure samesite strict_origin
  app_env="$(lower "$(read_env_var APP_ENV)")"
  cookie_secure="$(read_env_var PUBLIC_COOKIE_SECURE)"
  samesite="$(lower "$(read_env_var PUBLIC_COOKIE_SAMESITE)")"
  strict_origin="$(read_env_var PUBLIC_STRICT_ORIGIN_CHECK)"

  if [[ "$app_env" == "prod" || "$app_env" == "production" ]]; then
    if is_truthy "$cookie_secure"; then
      add_pass "env: PUBLIC_COOKIE_SECURE=true (prod)"
    else
      add_fail "env: PUBLIC_COOKIE_SECURE must be true in prod"
    fi

    if [[ "$samesite" == "lax" || "$samesite" == "strict" || "$samesite" == "none" ]]; then
      add_pass "env: PUBLIC_COOKIE_SAMESITE is valid (${samesite})"
    else
      add_fail "env: invalid PUBLIC_COOKIE_SAMESITE (${samesite})"
    fi

    if is_truthy "$strict_origin"; then
      add_pass "env: PUBLIC_STRICT_ORIGIN_CHECK=true (prod)"
    else
      add_fail "env: PUBLIC_STRICT_ORIGIN_CHECK must be true in prod"
    fi
  else
    add_warn "APP_ENV=${app_env:-unknown}: prod-only cookie checks skipped"
  fi
}

check_compose_service_running() {
  local service="$1"
  if ! command -v docker >/dev/null 2>&1; then
    add_warn "docker is not available: service checks skipped"
    return 0
  fi
  local running
  running="$(docker compose ps --services --filter status=running 2>/dev/null || true)"
  if echo "$running" | grep -qx "$service"; then
    add_pass "service running: ${service}"
    return 0
  fi
  add_fail "service is not running: ${service}"
  return 1
}

check_db_security_audit_table() {
  if ! command -v docker >/dev/null 2>&1; then
    add_warn "docker is not available: DB checks skipped"
    return 0
  fi
  if [[ ! -f ".env" ]]; then
    add_warn ".env not found: DB checks skipped"
    return 0
  fi

  local pg_user pg_db
  pg_user="$(read_env_var POSTGRES_USER)"
  pg_db="$(read_env_var POSTGRES_DB)"
  pg_user="${pg_user:-postgres}"
  pg_db="${pg_db:-legal}"

  local exists
  exists="$(docker compose exec -T db psql -U "$pg_user" -d "$pg_db" -Atc "select to_regclass('public.security_audit_log') is not null;" 2>/dev/null || true)"
  if [[ "$exists" == "t" ]]; then
    add_pass "db table exists: security_audit_log"
  else
    add_fail "db table missing or inaccessible: security_audit_log"
    return 1
  fi

  local recent
  recent="$(docker compose exec -T db psql -U "$pg_user" -d "$pg_db" -Atc "select count(*) from security_audit_log where created_at >= now() - interval '7 days';" 2>/dev/null || true)"
  if [[ "$recent" =~ ^[0-9]+$ ]]; then
    add_pass "db access: security_audit_log query ok (rows_7d=${recent})"
  else
    add_fail "db access error: cannot query security_audit_log"
    return 1
  fi
}

check_attachment_scan_availability() {
  local scan_enabled clam_enabled
  scan_enabled="$(read_env_var ATTACHMENT_SCAN_ENABLED)"
  clam_enabled="$(read_env_var CLAMAV_ENABLED)"

  if is_truthy "$scan_enabled" || is_truthy "$clam_enabled"; then
    check_compose_service_running "clamav"
  else
    add_warn "attachment scan disabled by config (ATTACHMENT_SCAN_ENABLED/CLAMAV_ENABLED)"
  fi
}

run_smoke() {
  local health_url chat_health_url email_health_url
  health_url="${BASE_URL%/}/health"
  chat_health_url="${BASE_URL%/}/chat-health"
  email_health_url="${BASE_URL%/}/email-health"

  if http_status_ok "$health_url"; then
    add_pass "http 200: ${health_url}"
  else
    add_fail "http check failed: ${health_url}"
  fi
  if http_status_ok "$chat_health_url"; then
    add_pass "http 200: ${chat_health_url}"
  else
    add_fail "http check failed: ${chat_health_url}"
  fi
  if http_status_ok "$email_health_url"; then
    add_pass "http 200: ${email_health_url}"
  else
    add_fail "http check failed: ${email_health_url}"
  fi

  check_required_headers "$health_url"
  check_tls_cert "$BASE_URL"
  check_cookie_and_security_flags
  check_attachment_scan_availability
  check_db_security_audit_table
}

write_report() {
  {
    echo "# Security Smoke Report"
    echo
    echo "- Timestamp: ${TS_HUMAN}"
    echo "- Base URL: ${BASE_URL}"
    echo "- Result: $([[ ${#failures[@]} -eq 0 ]] && echo "PASS" || echo "FAIL")"
    echo
    echo "## Passed checks (${#passes[@]})"
    for item in "${passes[@]}"; do
      echo "- [x] ${item}"
    done
    echo
    echo "## Warnings (${#warnings[@]})"
    if [[ ${#warnings[@]} -eq 0 ]]; then
      echo "- none"
    else
      for item in "${warnings[@]}"; do
        echo "- [!] ${item}"
      done
    fi
    echo
    echo "## Failures (${#failures[@]})"
    if [[ ${#failures[@]} -eq 0 ]]; then
      echo "- none"
    else
      for item in "${failures[@]}"; do
        echo "- [ ] ${item}"
      done
    fi
  } > "$REPORT_FILE"
}

run_smoke
write_report

if [[ ${#failures[@]} -gt 0 ]]; then
  echo "[ALERT] Security smoke failed (${#failures[@]} failure(s)). Report: ${REPORT_FILE}" >&2
  exit 2
fi

echo "[OK] Security smoke passed. Report: ${REPORT_FILE}"
exit 0
