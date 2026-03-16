#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

BASE_URL="${1:-http://localhost:8081}"
REPORT_DIR="${REPORT_DIR:-reports/perf}"
ITERATIONS="${PERF_ITERATIONS:-5}"
ADMIN_EMAIL="${PERF_ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${PERF_ADMIN_PASSWORD:-admin123}"
KANBAN_LIMIT="${PERF_KANBAN_LIMIT:-400}"
TS_HUMAN="$(date -u +"%Y-%m-%d %H:%M:%S UTC")"
TS_FILE="$(date -u +"%Y%m%d-%H%M%S")"
REPORT_FILE="${REPORT_DIR}/perf-baseline-${TS_FILE}.md"

mkdir -p "$REPORT_DIR"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "missing command: $1" >&2
    exit 1
  }
}

require_cmd curl
require_cmd python3

json_escape() {
  python3 - "$1" <<'PY'
import json
import sys
print(json.dumps(sys.argv[1]))
PY
}

LOGIN_BODY="$(printf '{"email":%s,"password":%s}' "$(json_escape "$ADMIN_EMAIL")" "$(json_escape "$ADMIN_PASSWORD")")"
LOGIN_RESPONSE_FILE="$TMP_DIR/login.json"

curl -fsS \
  -H "Content-Type: application/json" \
  -X POST \
  -d "$LOGIN_BODY" \
  "$BASE_URL/api/admin/auth/login" >"$LOGIN_RESPONSE_FILE"

AUTH_TOKEN="$(python3 - "$LOGIN_RESPONSE_FILE" <<'PY'
import json
import sys
with open(sys.argv[1], "r", encoding="utf-8") as fh:
    data = json.load(fh)
token = str(data.get("access_token") or "").strip()
if not token:
    raise SystemExit("login did not return access_token")
print(token)
PY
)"

KANBAN_BODY_FILE="$TMP_DIR/kanban.json"
curl -fsS \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  "$BASE_URL/api/admin/requests/kanban?limit=${KANBAN_LIMIT}&sort_mode=created_newest" >"$KANBAN_BODY_FILE"

REQUEST_ID="$(python3 - "$KANBAN_BODY_FILE" <<'PY'
import json
import sys
with open(sys.argv[1], "r", encoding="utf-8") as fh:
    data = json.load(fh)
rows = data.get("rows") or []
if not rows:
    raise SystemExit("kanban returned no rows; seed manual data first")
request_id = str((rows[0] or {}).get("id") or "").strip()
if not request_id:
    raise SystemExit("kanban first row has no id")
print(request_id)
PY
)"

measure_endpoint() {
  local name="$1"
  local method="$2"
  local path="$3"
  local body="${4:-}"

  local headers_file body_file curl_meta status_code total_ms perf_label perf_duration
  for run in $(seq 1 "$ITERATIONS"); do
    headers_file="$TMP_DIR/${name}-${run}.headers"
    body_file="$TMP_DIR/${name}-${run}.body"
    if [[ "$method" == "POST" ]]; then
      curl_meta="$(curl -sS \
        -D "$headers_file" \
        -o "$body_file" \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        -H "Content-Type: application/json" \
        -X POST \
        -d "$body" \
        -w '%{http_code} %{time_total}' \
        "$BASE_URL$path")"
    else
      curl_meta="$(curl -sS \
        -D "$headers_file" \
        -o "$body_file" \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        -w '%{http_code} %{time_total}' \
        "$BASE_URL$path")"
    fi

    status_code="$(echo "$curl_meta" | awk '{print $1}')"
    total_ms="$(echo "$curl_meta" | awk '{printf "%.2f", $2 * 1000}')"

    if [[ "$status_code" != "200" ]]; then
      echo "endpoint ${name} failed: HTTP ${status_code}" >&2
      cat "$body_file" >&2 || true
      exit 1
    fi

    python3 - "$headers_file" "$name" "$run" "$total_ms" >>"$TMP_DIR/raw.tsv" <<'PY'
import sys

headers_path, name, run, total_ms = sys.argv[1:5]
headers = {}
with open(headers_path, "r", encoding="utf-8") as fh:
    for line in fh:
        line = line.strip()
        if not line or ":" not in line:
            continue
        key, value = line.split(":", 1)
        headers[key.strip().lower()] = value.strip()
print("\t".join([
    name,
    run,
    total_ms,
    headers.get("x-perf-label", ""),
    headers.get("x-perf-duration-ms", ""),
]))
PY
  done
}

: >"$TMP_DIR/raw.tsv"

measure_endpoint "kanban" "GET" "/api/admin/requests/kanban?limit=${KANBAN_LIMIT}&sort_mode=created_newest"
measure_endpoint "metrics_overview" "GET" "/api/admin/metrics/overview?include_sla=false"
measure_endpoint "metrics_overview_sla" "GET" "/api/admin/metrics/overview-sla"
measure_endpoint "request_workspace" "GET" "/api/admin/requests/${REQUEST_ID}/workspace"
measure_endpoint "chat_live" "GET" "/api/admin/chat/requests/${REQUEST_ID}/live"

python3 - "$TMP_DIR/raw.tsv" "$REPORT_FILE" "$TS_HUMAN" "$BASE_URL" "$REQUEST_ID" "$ITERATIONS" <<'PY'
import csv
import statistics
import sys
from collections import defaultdict

raw_path, report_path, ts_human, base_url, request_id, iterations = sys.argv[1:7]

rows = defaultdict(list)
with open(raw_path, "r", encoding="utf-8") as fh:
    reader = csv.reader(fh, delimiter="\t")
    for name, run, total_ms, perf_label, perf_duration in reader:
        rows[name].append(
            {
                "run": int(run),
                "total_ms": float(total_ms or 0),
                "perf_label": perf_label or "-",
                "perf_duration_ms": float(perf_duration or 0),
            }
        )

def percentile(sorted_values, ratio):
    if not sorted_values:
        return 0.0
    if len(sorted_values) == 1:
        return sorted_values[0]
    index = round((len(sorted_values) - 1) * ratio)
    return sorted_values[index]

with open(report_path, "w", encoding="utf-8") as out:
    out.write("# Perf Baseline Report\n\n")
    out.write(f"- Timestamp: `{ts_human}`\n")
    out.write(f"- Base URL: `{base_url}`\n")
    out.write(f"- Request ID sample: `{request_id}`\n")
    out.write(f"- Iterations per endpoint: `{iterations}`\n\n")
    out.write("| Endpoint | Perf Label | Avg Total ms | P95 Total ms | Avg Server ms |\n")
    out.write("|---|---|---:|---:|---:|\n")
    for name in [
        "kanban",
        "metrics_overview",
        "metrics_overview_sla",
        "request_workspace",
        "chat_live",
    ]:
        items = rows.get(name, [])
        totals = sorted(item["total_ms"] for item in items)
        servers = [item["perf_duration_ms"] for item in items if item["perf_duration_ms"] > 0]
        avg_total = statistics.mean(totals) if totals else 0.0
        p95_total = percentile(totals, 0.95)
        avg_server = statistics.mean(servers) if servers else 0.0
        label = items[0]["perf_label"] if items else "-"
        out.write(f"| {name} | `{label}` | {avg_total:.2f} | {p95_total:.2f} | {avg_server:.2f} |\n")
    out.write("\n## Raw Runs\n\n")
    out.write("| Endpoint | Run | Total ms | Server ms |\n")
    out.write("|---|---:|---:|---:|\n")
    for name, items in rows.items():
        for item in sorted(items, key=lambda value: value["run"]):
            out.write(f"| {name} | {item['run']} | {item['total_ms']:.2f} | {item['perf_duration_ms']:.2f} |\n")
PY

echo "report: $REPORT_FILE"
