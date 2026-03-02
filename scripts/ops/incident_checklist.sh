#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

SEVERITY="MEDIUM"
CATEGORY="PDN_SUSPECTED"
SUMMARY=""
REQUEST_ID=""
TRACK_NUMBER=""
REPORTER=""
OUTPUT_FILE=""

usage() {
  cat <<USAGE
Usage:
  scripts/ops/incident_checklist.sh [options]

Options:
  --severity <LOW|MEDIUM|HIGH|CRITICAL>
  --category <PDN_LEAK|UNAUTHORIZED_ACCESS|MALWARE_UPLOAD|SERVICE_COMPROMISE|PDN_SUSPECTED>
  --summary <text>
  --request-id <uuid>
  --track-number <trk>
  --reporter <name/email>
  --output <path>     Explicit output markdown file path
  -h, --help

Examples:
  scripts/ops/incident_checklist.sh --severity HIGH --category UNAUTHORIZED_ACCESS --summary "Suspicious request card reads"
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --severity) SEVERITY="${2:-}"; shift 2 ;;
    --category) CATEGORY="${2:-}"; shift 2 ;;
    --summary) SUMMARY="${2:-}"; shift 2 ;;
    --request-id) REQUEST_ID="${2:-}"; shift 2 ;;
    --track-number) TRACK_NUMBER="${2:-}"; shift 2 ;;
    --reporter) REPORTER="${2:-}"; shift 2 ;;
    --output) OUTPUT_FILE="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "[ERROR] Unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

case "$(echo "$SEVERITY" | tr '[:lower:]' '[:upper:]')" in
  LOW|MEDIUM|HIGH|CRITICAL) ;;
  *) echo "[ERROR] Invalid severity: $SEVERITY" >&2; exit 1 ;;
esac
SEVERITY="$(echo "$SEVERITY" | tr '[:lower:]' '[:upper:]')"

if [[ -z "$SUMMARY" ]]; then
  SUMMARY="Initial triage started via incident checklist"
fi

TS_UTC="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
TS_FILE="$(date -u +"%Y%m%d-%H%M%S")"
HOSTNAME_VALUE="$(hostname)"

if [[ -z "$OUTPUT_FILE" ]]; then
  mkdir -p reports/incidents
  OUTPUT_FILE="reports/incidents/incident-${TS_FILE}.md"
else
  mkdir -p "$(dirname "$OUTPUT_FILE")"
fi

BACKEND_HEALTH="unknown"
CHAT_HEALTH="unknown"
EMAIL_HEALTH="unknown"

if curl -fsS http://localhost:8081/health >/dev/null 2>&1; then BACKEND_HEALTH="ok"; else BACKEND_HEALTH="failed"; fi
if curl -fsS http://localhost:8081/chat-health >/dev/null 2>&1; then CHAT_HEALTH="ok"; else CHAT_HEALTH="failed"; fi
if curl -fsS http://localhost:8081/email-health >/dev/null 2>&1; then EMAIL_HEALTH="ok"; else EMAIL_HEALTH="failed"; fi

cat > "$OUTPUT_FILE" <<REPORT
# Инцидент ПДн: первичный чек-лист

- Дата/время (UTC): ${TS_UTC}
- Хост: ${HOSTNAME_VALUE}
- Уровень: ${SEVERITY}
- Категория: ${CATEGORY}
- Инициатор: ${REPORTER:-не указан}
- Request ID: ${REQUEST_ID:-не указан}
- Track number: ${TRACK_NUMBER:-не указан}
- Краткое описание: ${SUMMARY}

## 1. Немедленные действия (0-15 минут)
- [ ] Назначен ответственный за инцидент
- [ ] Заморожены потенциально компрометированные учетные данные
- [ ] Включен усиленный сбор логов и запрет на удаление логов
- [ ] Зафиксировано текущее состояние сервисов и времени обнаружения

## 2. Техническая локализация
- [ ] Проверены подозрительные события в таблице 'security_audit_log' (READ/UPLOAD/DOWNLOAD)
- [ ] Проверены события CRUD в таблице 'audit_log'
- [ ] Проверены запросы к заявкам/чатам/счетам по IP/actor_subject
- [ ] Ограничен доступ к затронутым данным (временный deny/rotate/rbac tighten)

## 3. Коммуникации и эскалация
- [ ] Уведомлен владелец системы и ответственный по ИБ/ПДн
- [ ] Определен объем затронутых ПДн и категорий субъектов
- [ ] Принято решение о юридических уведомлениях (внутренний контур)

## 4. Восстановление
- [ ] Выполнена ротация секретов/ключей (JWT, INTERNAL_SERVICE_TOKEN, внешние API)
- [ ] Проверена целостность данных и корректность бизнес-процессов
- [ ] Выполнен пост-инцидентный тест smoke + регрессионные проверки

## 5. Артефакты и evidence
- [ ] Сохранены логи сервисов (docker compose logs --since ...)
- [ ] Сохранены выгрузки из security_audit_log и audit_log
- [ ] Зафиксированы hash-суммы ключевых файлов evidence

## 6. Текущие health-checks
- backend: ${BACKEND_HEALTH}
- chat-service: ${CHAT_HEALTH}
- email-service: ${EMAIL_HEALTH}

## 7. Команды для первичного анализа

a. Просмотр последних security-событий:
~~~bash
 docker compose exec -T db psql -U postgres -d legal -c "select created_at, actor_role, actor_subject, actor_ip, action, scope, allowed from security_audit_log order by created_at desc limit 100;"
~~~

b. Просмотр последних CRUD-аудитов:
~~~bash
 docker compose exec -T db psql -U postgres -d legal -c "select created_at, entity, entity_id, action, responsible from audit_log order by created_at desc limit 100;"
~~~

c. Снимок логов контейнеров:
~~~bash
 docker compose logs --since 2h backend chat-service worker beat edge > reports/incidents/logs-${TS_FILE}.txt
~~~
REPORT

echo "[OK] Incident checklist created: $OUTPUT_FILE"
