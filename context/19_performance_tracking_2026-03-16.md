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
| PERF-03 | Убрать full reload карточки заявки при live-обновлениях | completed | P0 | PERF-01 |
| PERF-04 | Собрать единый endpoint карточки заявки | in_progress | P0 | PERF-01 |
| PERF-05 | Выделить узкие request-scoped endpoints для вложений и счетов | completed | P0 | PERF-04 |
| PERF-06 | Переписать kanban на SQL-first фильтрацию/limit | in_progress | P0 | PERF-01, PERF-02 |
| PERF-07 | Ограничить initial chat payload и добавить догрузку истории | in_progress | P1 | PERF-03, PERF-04 |
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
- 2026-03-16: dashboard перестроен на приоритетную загрузку `overview`, справочники уходят в неблокирующий bootstrap.
- 2026-03-16: карточка заявки переведена с generic `attachments/query` и `invoices/query` на узкие request-scoped endpoint.
- 2026-03-16: `PERF-05` закрыт, backend регресс по чатам/счетам/hardening пройден.
- 2026-03-16: `PERF-03` начат - admin `/live` отдает delta `messages/attachments`, hook больше не делает полный `loadRequestModalData()` на polling.
- 2026-03-16: регресс `tests.admin.test_lawyer_chat` пройден, локальная сборка `admin/index.jsx` пройдена.
- 2026-03-16: `PERF-03` завершен - client `/live` тоже переведен на delta без полного reload workspace.
- 2026-03-16: `PERF-04` начат - admin карточка заявки переведена на единый endpoint `/api/admin/requests/{id}/workspace`.
- 2026-03-16: `PERF-06` начат - для канбана в сценарии `created_newest` без boolean-фильтров `count/order_by/limit` перенесены в SQL, чтобы не загружать весь filtered set в Python.
- 2026-03-16: добавлен регресс на канбан `limit + total + truncated`, контейнерный тест `tests.admin.test_status_flow_kanban` пройден.
- 2026-03-16: в `compute_sla_snapshot` выборки `StatusHistory` и первых lawyer messages ограничены только активными заявками; это должно ускорить `/api/admin/metrics/overview` на первом запросе.
- 2026-03-16: `overview` добавлен в perf-labels и в `scripts/ops/perf_baseline.sh`, чтобы дальше мерить dashboard отдельно от канбана/workspace.
- 2026-03-16: контейнерный регресс `tests.admin.test_metrics_templates tests.test_dashboard_finance` пройден после оптимизации overview/SLA.
- 2026-03-16: поднят минимальный локальный контур для живых замеров (`db`, `redis`, `minio`, `email-service`, `chat-service`, `backend`, `frontend`); `frontend` ушел в restart-loop из-за `host not found in upstream "minio"` в nginx-конфиге, поэтому full baseline через `:8081` не собран.
- 2026-03-16: снят manual backend-baseline напрямую через `:8002` для `metrics_overview`, `kanban`, `request_workspace`; цифры получились низкими на локальном seed и полезны только как smoke-check, а не как репрезентативный perf baseline.
- 2026-03-16: исправлен restart-loop `frontend` через lazy DNS resolve для `minio` в nginx, полноценный baseline через `http://localhost:8081` снова доступен.
- 2026-03-16: получен baseline через `:8081` после оптимизаций dashboard/workspace: `kanban ~17.8 ms avg`, `metrics_overview core ~12.9 ms avg`, `metrics_overview_sla ~8.2 ms avg`, `request_workspace ~14.9 ms avg`, `chat_live ~14.4 ms avg` на локальном seed.
- 2026-03-16: `overview` переведен на двухфазную загрузку: быстрый `include_sla=false` + фоновый `/api/admin/metrics/overview-sla`, чтобы убрать `compute_sla_snapshot()` из критического пути dashboard.
- 2026-03-16: `PERF-07` начат - initial chat payload ограничен окном сообщений, добавлены `messages-window` endpoints для admin/public и догрузка старой истории в UI по кнопке.
- 2026-03-16: контейнерные регрессы после paged-chat пройдены: `tests.admin.test_lawyer_chat`, `tests.test_public_cabinet`, `tests.admin.test_metrics_templates`, `tests.test_dashboard_finance`, `tests.test_http_hardening`.
- 2026-03-16: добавлен сценарий `scripts/ops/perf_long_chat_workspace.sh`, который сидит request с длинным чатом и меряет first open workspace и `messages-window` на живом контуре.
- 2026-03-16: long-chat baseline снят на `2000` сообщениях, отчет `reports/perf/perf-long-chat-workspace-20260316-201459.md`: `request_workspace ~579 ms avg`, `messages_window ~650 ms avg`, initial payload и older-page оба возвращают только `50` сообщений из `2000`.
- 2026-03-16: при первом прогоне long-chat сценария выяснилось, что `chat-service` работал на старом контейнере без актуальных `X-Perf-*` headers; после rebuild `chat-service` server timing для `messages-window` подтвержден на живом контуре.
- 2026-03-16: `PERF-06` продвинут дальше - SQL-first window теперь покрывает не только `created_newest`, но и `sort_mode=lawyer`, а boolean-фильтр `deadline_alert` переносится в SQL до загрузки строк.
- 2026-03-16: добавлен контейнерный регресс `test_requests_kanban_lawyer_sort_uses_limit_without_losing_total`, подтверждающий `limit/truncated/total` для `sort_mode=lawyer`.
- 2026-03-17: по продовым замерам dashboard все еще создает сетевое давление пачкой справочников на первом маунте; admin UI перестроен так, чтобы на дефолтном входе сначала грузить `dashboard + totp`, а `bootstrapReferenceData()` откладывать до idle.
- 2026-03-17: `UserAvatar` переведен на `loading="lazy"`, `decoding="async"` и low fetch priority для крупных аватаров, чтобы тяжелые изображения юристов меньше конкурировали с API на первом экране dashboard.
- 2026-03-17: для `workspace` добавлены составные индексы `messages(request_id, created_at, id)`, `attachments(request_id, created_at, id)`, `invoices(request_id, issued_at, id)`; это должно снизить стоимость order-by выборок при открытии заявки.
- 2026-03-17: добавлена миграция `0035_workspace_perf_indexes`, обновлен `tests.test_migrations`, контейнерный прогон миграций пройден.
- 2026-03-17: avatar pipeline исправлен архитектурно: оригинал аватара больше не переписывается, рядом создается `thumb.webp`, а admin avatar URLs для small/medium render идут через `variant=thumb`.
- 2026-03-17: admin avatar proxy умеет по `variant=thumb` отдавать сжатый вариант и, если его еще нет, достраивать его на лету из оригинала; public featured staff URLs тоже переключены на `?variant=thumb` и умеют так же достраивать thumb на лету.
- 2026-03-17: `workspace` упрощен server-side: убрано дублирующее `get_request_service() + db.get(Request)` внутри одного запроса, read-mark side effects сведены в один проход, `mark_admin_notifications_read` переведен на bulk update, `status_route` повторно использует уже загруженный `Request`.
- 2026-03-17: контейнерные регрессы после avatar/workspace правок пройдены: `tests.test_uploads_s3`, `tests.test_featured_staff_public`, `tests.admin.test_lawyer_chat`.

## Дальше

1. Разобрать server-side стоимость `request_workspace` и `messages-window` на длинном чате: window-пагинация уже работает, но оба endpoint остаются около `0.6-0.65s`, значит узкое место теперь в запросах/сериализации, а не в объеме initial payload.
2. Довести `PERF-04` до конца и решить, нужен ли такой же unified endpoint для client workspace.
3. Продолжить `PERF-06` для оставшихся режимов канбана, где все еще остается Python-side post-processing: `deadline`, `overdue`, `has_unread_updates`.
