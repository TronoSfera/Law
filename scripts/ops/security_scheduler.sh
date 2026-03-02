#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

INTERVAL_SECONDS="${SECURITY_SCHEDULER_INTERVAL_SECONDS:-900}"
INTERNAL_BASE_URL="${SECURITY_SCHEDULER_INTERNAL_BASE_URL:-http://frontend}"
EXTERNAL_DOMAINS="${SECURITY_SCHEDULER_EXTERNAL_DOMAINS:-ruakb.ru,ruakb.online}"
SKIP_DOCKER_CHECKS="${SECURITY_SCHEDULER_SKIP_DOCKER_CHECKS:-1}"
RUN_INCIDENT_ON_FAIL="${SECURITY_SCHEDULER_RUN_INCIDENT_ON_FAIL:-1}"
HEARTBEAT_FILE="${SECURITY_SCHEDULER_HEARTBEAT_FILE:-/tmp/security_scheduler_heartbeat}"

log() {
  echo "[SEC-SCHEDULER] $*"
}

run_smoke() {
  local url="$1"
  if SECURITY_SMOKE_SKIP_DOCKER_CHECKS="$SKIP_DOCKER_CHECKS" ./scripts/ops/security_smoke.sh "$url"; then
    log "smoke ok: ${url}"
    return 0
  fi
  log "smoke failed: ${url}"
  return 1
}

run_cycle() {
  local failed=0
  run_smoke "$INTERNAL_BASE_URL" || failed=1

  IFS=',' read -r -a _domains <<< "$EXTERNAL_DOMAINS"
  local domain
  for domain in "${_domains[@]}"; do
    domain="$(echo "$domain" | xargs)"
    [[ -z "$domain" ]] && continue
    run_smoke "https://${domain}" || failed=1
  done

  date +%s > "$HEARTBEAT_FILE"

  if [[ "$failed" == "1" && "$RUN_INCIDENT_ON_FAIL" == "1" && -x "./scripts/ops/incident_checklist.sh" ]]; then
    ./scripts/ops/incident_checklist.sh \
      --severity MEDIUM \
      --category MONITORING_ALERT \
      --summary "security-scheduler detected smoke check failure" || true
  fi
}

validate_interval() {
  if ! [[ "$INTERVAL_SECONDS" =~ ^[0-9]+$ ]] || [[ "$INTERVAL_SECONDS" -lt 60 ]]; then
    log "invalid SECURITY_SCHEDULER_INTERVAL_SECONDS=${INTERVAL_SECONDS}, fallback to 900"
    INTERVAL_SECONDS=900
  fi
}

main() {
  validate_interval
  mkdir -p reports/security reports/incidents
  log "started: interval=${INTERVAL_SECONDS}s internal=${INTERNAL_BASE_URL} external=${EXTERNAL_DOMAINS}"
  while true; do
    local started_at
    started_at="$(date +%s)"
    run_cycle
    local elapsed
    elapsed="$(( $(date +%s) - started_at ))"
    local sleep_for
    sleep_for="$(( INTERVAL_SECONDS - elapsed ))"
    if (( sleep_for < 1 )); then
      sleep_for=1
    fi
    sleep "$sleep_for"
  done
}

main "$@"
