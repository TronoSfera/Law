#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "[ERROR] .env not found in $ROOT_DIR"
  exit 1
fi

echo "[1/4] Build and start production stack..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

echo "[2/4] Apply migrations..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T backend alembic upgrade head

echo "[3/4] Service status..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps

echo "[4/4] Smoke checks..."
curl -fsS http://localhost/health >/dev/null
curl -fsS http://localhost/chat-health >/dev/null

echo "Done. Open https://ruakb.ru"
