#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

BASE_URL="${1:-http://localhost:8081}"
REPORT_DIR="${REPORT_DIR:-reports/perf}"
ITERATIONS="${PERF_ITERATIONS:-5}"
ADMIN_EMAIL="${PERF_ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${PERF_ADMIN_PASSWORD:-admin123}"
MESSAGE_COUNT="${PERF_LONG_CHAT_MESSAGES:-2000}"
WINDOW_LIMIT="${PERF_CHAT_WINDOW_LIMIT:-50}"
TS_HUMAN="$(date -u +"%Y-%m-%d %H:%M:%S UTC")"
TS_FILE="$(date -u +"%Y%m%d-%H%M%S")"
REPORT_FILE="${REPORT_DIR}/perf-long-chat-workspace-${TS_FILE}.md"

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
require_cmd docker

json_escape() {
  python3 - "$1" <<'PY'
import json
import sys
print(json.dumps(sys.argv[1]))
PY
}

SEED_JSON_FILE="$TMP_DIR/seed.json"
PERF_LONG_CHAT_MESSAGES="$MESSAGE_COUNT" docker compose -f docker-compose.yml -f docker-compose.local.yml exec -T backend python - <<'PY' >"$SEED_JSON_FILE"
import json
import os
from datetime import datetime, timedelta, timezone

from app.db.session import SessionLocal
from app.models.request import Request
from app.models.message import Message

message_count = max(1, int(os.environ.get("PERF_LONG_CHAT_MESSAGES") or "2000"))
now = datetime.now(timezone.utc)
track = f"TRK-PERF-CHAT-{now.strftime('%Y%m%d%H%M%S')}"

db = SessionLocal()
try:
    req = Request(
        track_number=track,
        client_name="Perf Chat Client",
        client_phone="+79990009999",
        topic_code="consulting",
        status_code="IN_PROGRESS",
        description=f"Perf long chat seed ({message_count})",
        extra_fields={},
    )
    db.add(req)
    db.flush()

    started_at = now - timedelta(minutes=message_count)
    batch = []
    for index in range(message_count):
        created_at = started_at + timedelta(minutes=index)
        batch.append(
            Message(
                request_id=req.id,
                author_type="CLIENT" if index % 2 == 0 else "LAWYER",
                author_name="Клиент" if index % 2 == 0 else "Юрист",
                body=f"perf message {index}",
                created_at=created_at,
                updated_at=created_at,
            )
        )
        if len(batch) >= 500:
            db.add_all(batch)
            db.flush()
            batch.clear()
    if batch:
        db.add_all(batch)
        db.flush()

    db.commit()
    print(json.dumps({"request_id": str(req.id), "track_number": req.track_number, "message_count": message_count}))
finally:
    db.close()
PY

REQUEST_ID="$(python3 - "$SEED_JSON_FILE" <<'PY'
import json
import sys
with open(sys.argv[1], "r", encoding="utf-8") as fh:
    data = json.load(fh)
print(str(data["request_id"]))
PY
)"

TRACK_NUMBER="$(python3 - "$SEED_JSON_FILE" <<'PY'
import json
import sys
with open(sys.argv[1], "r", encoding="utf-8") as fh:
    data = json.load(fh)
print(str(data["track_number"]))
PY
)"

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

measure_endpoint() {
  local name="$1"
  local path="$2"
  local headers_file body_file curl_meta status_code total_ms
  for run in $(seq 1 "$ITERATIONS"); do
    headers_file="$TMP_DIR/${name}-${run}.headers"
    body_file="$TMP_DIR/${name}-${run}.body"
    curl_meta="$(curl -sS \
      -D "$headers_file" \
      -o "$body_file" \
      -H "Authorization: Bearer $AUTH_TOKEN" \
      -w '%{http_code} %{time_total}' \
      "$BASE_URL$path")"

    status_code="$(echo "$curl_meta" | awk '{print $1}')"
    total_ms="$(echo "$curl_meta" | awk '{printf "%.2f", $2 * 1000}')"

    if [[ "$status_code" != "200" ]]; then
      echo "endpoint ${name} failed: HTTP ${status_code}" >&2
      cat "$body_file" >&2 || true
      exit 1
    fi

    python3 - "$headers_file" "$body_file" "$name" "$run" "$total_ms" >>"$TMP_DIR/raw.tsv" <<'PY'
import json
import sys

headers_path, body_path, name, run, total_ms = sys.argv[1:6]
headers = {}
with open(headers_path, "r", encoding="utf-8") as fh:
    for line in fh:
        line = line.strip()
        if not line or ":" not in line:
            continue
        key, value = line.split(":", 1)
        headers[key.strip().lower()] = value.strip()

payload = {}
with open(body_path, "r", encoding="utf-8") as fh:
    try:
        payload = json.load(fh)
    except Exception:
        payload = {}

rows = payload.get("rows") or payload.get("messages") or []
print("\t".join([
    name,
    run,
    total_ms,
    headers.get("x-perf-label", ""),
    headers.get("x-perf-duration-ms", ""),
    str(len(rows) if isinstance(rows, list) else 0),
    str(payload.get("total", payload.get("messages_total", 0)) or 0),
    str(payload.get("has_more", payload.get("messages_has_more", False))),
]))
PY
  done
}

: >"$TMP_DIR/raw.tsv"

measure_endpoint "request_workspace_long_chat" "/api/admin/requests/${REQUEST_ID}/workspace"
measure_endpoint "messages_window_older_page" "/api/admin/chat/requests/${REQUEST_ID}/messages-window?before_count=${WINDOW_LIMIT}&limit=${WINDOW_LIMIT}"

python3 - "$TMP_DIR/raw.tsv" "$REPORT_FILE" "$TS_HUMAN" "$BASE_URL" "$REQUEST_ID" "$TRACK_NUMBER" "$MESSAGE_COUNT" "$ITERATIONS" <<'PY'
import csv
import statistics
import sys
from collections import defaultdict

raw_path, report_path, ts_human, base_url, request_id, track_number, message_count, iterations = sys.argv[1:9]

rows = defaultdict(list)
with open(raw_path, "r", encoding="utf-8") as fh:
    reader = csv.reader(fh, delimiter="\t")
    for name, run, total_ms, perf_label, perf_duration, rows_len, total_items, has_more in reader:
        rows[name].append(
            {
                "run": int(run),
                "total_ms": float(total_ms or 0),
                "perf_label": perf_label or "-",
                "perf_duration_ms": float(perf_duration or 0),
                "rows_len": int(rows_len or 0),
                "total_items": int(total_items or 0),
                "has_more": str(has_more).strip().lower() == "true",
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
    out.write("# Perf Long Chat Workspace Report\n\n")
    out.write(f"- Timestamp: `{ts_human}`\n")
    out.write(f"- Base URL: `{base_url}`\n")
    out.write(f"- Request ID: `{request_id}`\n")
    out.write(f"- Track Number: `{track_number}`\n")
    out.write(f"- Seeded Messages: `{message_count}`\n")
    out.write(f"- Iterations per endpoint: `{iterations}`\n\n")
    out.write("| Endpoint | Perf Label | Avg Total ms | P95 Total ms | Avg Server ms | Rows | Total | Has More |\n")
    out.write("|---|---|---:|---:|---:|---:|---:|---|\n")
    for name in ["request_workspace_long_chat", "messages_window_older_page"]:
        items = rows.get(name, [])
        totals = sorted(item["total_ms"] for item in items)
        servers = [item["perf_duration_ms"] for item in items if item["perf_duration_ms"] > 0]
        avg_total = statistics.mean(totals) if totals else 0.0
        p95_total = percentile(totals, 0.95)
        avg_server = statistics.mean(servers) if servers else 0.0
        label = items[0]["perf_label"] if items else "-"
        sample = items[0] if items else {"rows_len": 0, "total_items": 0, "has_more": False}
        out.write(
            f"| {name} | `{label}` | {avg_total:.2f} | {p95_total:.2f} | {avg_server:.2f} | "
            f"{sample['rows_len']} | {sample['total_items']} | {sample['has_more']} |\n"
        )
    out.write("\n## Raw Runs\n\n")
    out.write("| Endpoint | Run | Total ms | Server ms | Rows | Total | Has More |\n")
    out.write("|---|---:|---:|---:|---:|---:|---|\n")
    for name, items in rows.items():
        for item in sorted(items, key=lambda value: value["run"]):
            out.write(
                f"| {name} | {item['run']} | {item['total_ms']:.2f} | {item['perf_duration_ms']:.2f} | "
                f"{item['rows_len']} | {item['total_items']} | {item['has_more']} |\n"
            )
PY

echo "report: $REPORT_FILE"
