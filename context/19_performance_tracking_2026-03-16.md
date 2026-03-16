# Performance Tracking

Дата старта: 2026-03-16

## Цель

Снизить воспринимаемую задержку при открытии канбана, карточки заявки и чата. Базовая инфраструктура: `4 vCPU / 8 GB RAM / SSD 150 GB`.

## Текущая гипотеза

- Основная задержка создается не железом, а лишними round-trip между фронтом и backend/chat-service.
- Карточка заявки загружается несколькими параллельными запросами и при live-обновлениях перезагружается целиком.
- Канбан собирается через загрузку большого массива заявок в Python и дальнейшую агрегацию в памяти.

## Backlog

| ID | Задача | Статус | Приоритет | Зависимости |
|---|---|---|---|---|
| PERF-01 | Зафиксировать baseline по ключевым endpoint и сценариям | in_progress | P0 | — |
| PERF-02 | Добавить индекс на `requests.assigned_lawyer_id` | completed | P0 | — |
| PERF-03 | Убрать full reload карточки заявки при live-обновлениях | planned | P0 | PERF-01 |
| PERF-04 | Собрать единый endpoint карточки заявки | planned | P0 | PERF-01 |
| PERF-05 | Выделить узкие request-scoped endpoints для вложений и счетов | planned | P0 | PERF-04 |
| PERF-06 | Переписать kanban на SQL-first фильтрацию/limit | planned | P0 | PERF-01, PERF-02 |
| PERF-07 | Ограничить initial chat payload и добавить догрузку истории | planned | P1 | PERF-03, PERF-04 |
| PERF-08 | Добавить нужные вспомогательные индексы и повторный profiling | planned | P1 | PERF-01 |

## PERF-01

### Scope

- Добавить серверные замеры для проблемных endpoint без изменения контрактов.
- Помечать в логах и headers целевые сценарии:
  - kanban
  - request workspace
  - chat messages
  - chat live
  - status route
  - attachments
  - invoices

### Progress

- 2026-03-16: создан tracking-файл.
- 2026-03-16: в работе точечная инструментализация через существующий HTTP middleware.
- 2026-03-16: добавлены `Server-Timing`, `X-Perf-Label`, `X-Perf-Duration-Ms` для ключевых endpoint.
- 2026-03-16: контейнерный тест `python -m unittest tests.test_http_hardening -v` пройден.
- 2026-03-16: добавлен ops-скрипт `scripts/ops/perf_baseline.sh` для repeatable baseline по admin workspace.
- 2026-03-16: baseline еще не снят, потому что локальный контур на `localhost:8081` не поднят.
- 2026-03-16: выполнен `PERF-02` - добавлен индекс `ix_requests_assigned_lawyer_id`, миграционный тест пройден.

## Дальше

1. Поднять локальный контур и выполнить `./scripts/ops/perf_baseline.sh http://localhost:8081`.
2. После снятия baseline перейти к `PERF-06` и убирать `base_query.all()` из kanban.
