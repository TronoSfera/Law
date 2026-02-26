# Runbook Проверок (Тесты и Валидация по Плану)

## Назначение
Этот файл фиксирует, где находятся проверки для каждого пункта `P01-P46` и как их запускать.
Использовать перед переводом пункта в статус `сделано`.
Детальная role-based матрица пользовательских сценариев (UI + corner cases): `/Users/tronosfera/Develop/Law/context/13_role_flows_test_matrix.md`.
Приоритизированный e2e backlog (P0/P1/P2 + покрытие): `/Users/tronosfera/Develop/Law/context/14_e2e_backlog_prioritized.md`.

## Базовые команды
1. Применить миграции:
```bash
docker compose exec -T backend alembic upgrade head
```
2. Полный прогон автотестов:
```bash
docker compose exec -T backend python -m unittest discover -s tests -p 'test_*.py' -v
```
3. Быстрая проверка импорта/синтаксиса Python:
```bash
docker compose exec -T backend python -m compileall app tests alembic
```
4. Проверка сборки admin фронта через Docker Compose (на образе `frontend`, entrypoint `admin/index.jsx`):
```bash
docker compose build frontend
docker compose run --rm --no-deps --entrypoint sh frontend -lc "apk add --no-cache nodejs npm >/dev/null && npx --yes esbuild /usr/share/nginx/html/admin/index.jsx --loader:.jsx=jsx --bundle --outfile=/tmp/admin.bundle.js"
```
5. Браузерный E2E (Playwright) для ролевых UI-флоу (PUBLIC / LAWYER / ADMIN) через фиксированный образ `law-e2e-playwright:1.58.2`:
```bash
docker compose build e2e
docker compose run --rm --no-deps e2e playwright --version
docker compose run --rm --no-deps \
  -e E2E_BASE_URL=http://frontend \
  -e E2E_ADMIN_EMAIL=admin@example.com \
  -e E2E_ADMIN_PASSWORD='admin123' \
  -e E2E_LAWYER_EMAIL=ivan@mail.ru \
  -e E2E_LAWYER_PASSWORD='LawyerPass-123!' \
  e2e playwright test --config=playwright.config.js
```
Примечание: образ `e2e` собирается один раз и переиспользуется, браузеры/Playwright не скачиваются при каждом запуске.
6. Очистка e2e/тестовых артефактов в dev-БД (ручной запуск, если нужен вне e2e):
```bash
docker compose exec -T backend python -m app.data.cleanup_test_artifacts
```
7. Сид ручных тестовых данных (10 клиентов, 4 юриста, заявки/чаты/счета):
```bash
docker compose exec -T backend python -m app.data.manual_test_seed
```
Доступы и список тестовых заявок сохраняются в `/Users/tronosfera/Develop/Law/context/15_manual_test_access.md`.

## Матрица проверок по задачам
| ID | Что проверяем | Где тесты | Как запускать |
|---|---|---|---|
| P01 | Базовый запуск сервисов и API | smoke + общие тесты | `docker compose up -d`; затем базовые команды 1-3 |
| P02 | Таблицы и миграции | `tests/test_migrations.py` | `docker compose exec -T backend python -m unittest tests.test_migrations -v` |
| P03 | Universal CRUD + RBAC + audit | `tests/test_admin_universal_crud.py` | `docker compose exec -T backend python -m unittest tests.test_admin_universal_crud.AdminUniversalCrudTests -v` |
| P04 | Пользователи, роли, пароли | `tests/test_admin_universal_crud.py` (тесты про `admin_users`) | команда как для `P03` |
| P05 | Базовый auto-assign | `tests/test_auto_assign.py` | `docker compose exec -T backend python -m unittest tests.test_auto_assign -v` |
| P06 | Админка `admin.jsx` + базовый UI контур | сборка admin фронта + CRUD/API тесты | базовая команда 4 + тесты `P03` |
| P07 | Доп. темы юристов (`admin_user_topics`) | `tests/test_admin_universal_crud.py` | команда как для `P03` |
| P08 | Ручной claim (без гонок) | `tests/test_admin_universal_crud.py` (claim-тесты) | команда как для `P03` |
| P09 | ADMIN-only переназначение | `tests/test_admin_universal_crud.py` (reassign-тесты) | команда как для `P03` |
| P10 | Auto-assign v2 приоритетов | `tests/test_auto_assign.py` | команда как для `P05` |
| P11 | OTP create/view + 7-day cookie + rate-limit | `tests/test_public_requests.py`, `tests/test_otp_rate_limit.py` | `docker compose exec -T backend python -m unittest tests.test_public_requests tests.test_otp_rate_limit -v` |
| P12 | Публичный кабинет (статус/чат/файлы/таймлайн) | `tests/test_public_cabinet.py` | `docker compose exec -T backend python -m unittest tests.test_public_cabinet -v` |
| P13 | Read/unread маркеры | `tests/test_public_requests.py`, `tests/test_admin_universal_crud.py`, `tests/test_uploads_s3.py` | запустить 3 набора: `test_public_requests`, `test_admin_universal_crud`, `test_uploads_s3` |
| P14 | Валидация флоу статусов по темам | `tests/test_admin_universal_crud.py` (status-flow тесты) | команда как для `P03` |
| P15 | Иммутабельность сообщений/файлов на смене статуса | `tests/test_admin_universal_crud.py`, `tests/test_uploads_s3.py` | `test_admin_universal_crud` + `test_uploads_s3` |
| P16 | Шаблоны данных (required + request template) | `tests/test_public_requests.py`, `tests/test_admin_universal_crud.py`, `tests/test_migrations.py` | запустить 3 набора + миграции |
| P17 | Файловый контур и лимиты | `tests/test_uploads_s3.py`, `tests/test_worker_maintenance.py` | `docker compose exec -T backend python -m unittest tests.test_uploads_s3 tests.test_worker_maintenance -v` |
| P18 | SLA-конфиг | `tests/test_admin_universal_crud.py`, `tests/test_migrations.py` | `alembic upgrade head`; затем `python -m unittest tests.test_admin_universal_crud tests.test_migrations -v` |
| P19 | SLA overdue/FRT расчеты | `tests/test_worker_maintenance.py`, `tests/test_admin_universal_crud.py` (metrics) | `docker compose exec -T backend python -m unittest tests.test_worker_maintenance tests.test_admin_universal_crud -v`; проверить `overdue_by_transition` |
| P20 | Уведомления | `tests/test_notifications.py`, а также регрессии `tests/test_public_cabinet.py`, `tests/test_uploads_s3.py`, `tests/test_worker_maintenance.py` | `docker compose exec -T backend python -m unittest tests.test_notifications tests.test_public_cabinet tests.test_uploads_s3 tests.test_worker_maintenance -v`; затем полный прогон |
| P21 | Dashboard ADMIN/LAWYER | `tests/test_admin_universal_crud.py` (metrics/dashboard) + `tests/test_dashboard_finance.py` | `docker compose exec -T backend python -m unittest tests.test_dashboard_finance tests.test_admin_universal_crud -v`; проверить role-scope и метрики юристов: загрузка, сумма активных, вал за месяц, зарплата за месяц |
| P22 | Hardening/release | `tests/test_http_hardening.py` + весь regression + compile + миграции + UI build | `docker compose exec -T backend python -m unittest tests.test_http_hardening -v`; затем базовые команды 1-4 |
| P23 | Мобильная адаптация лендинга/клиентских форм | `app/web/landing.html` + ручная проверка в mobile viewport | собрать admin фронт при затрагивании админки + открыть `landing.html` в 320px/375px/768px, проверить формы/чат/файлы без горизонтального скролла |
| P24 | Ставки юриста и ставка заявки | `tests/test_rates.py` + интеграционные в `tests/test_admin_universal_crud.py` | `docker compose exec -T backend python -m unittest tests.test_rates tests.test_admin_universal_crud -v`; проверка что public API не отдает поля ставок/процентов |
| P25 | Billing-статус и шаблон счета | `tests/test_billing_flow.py`, `tests/test_invoices.py` + e2e статусных переходов | `docker compose exec -T backend python -m unittest tests.test_billing_flow tests.test_invoices tests.test_admin_universal_crud -v`; валидация автогенерации счета при billing-статусе и фиксации оплаты только при ADMIN->`Оплачено` (в т.ч. множественные оплаты в одной заявке) |
| P26 | Security audit S3/ПДн | `tests/test_security_audit.py` + `tests/test_uploads_s3.py` + `tests/test_migrations.py` | `docker compose exec -T backend python -m unittest tests.test_security_audit tests.test_uploads_s3 tests.test_migrations -v`; проверить события allow/deny в `security_audit_log` и применимость миграции `0014_security_audit_log` |
| P27 | Итоговые E2E критические сценарии | набор `tests/test_*.py` + новые E2E-тесты | базовые команды 1-3 + прогон Playwright через сервис `e2e` (образ `law-e2e-playwright:1.58.2`) |
| P28 | Все таблицы БД в справочниках (+ `clients`, если добавляется) | `tests/test_admin_universal_crud.py`, `tests/test_migrations.py`, UI e2e admin dictionaries | миграции + `python -m unittest tests.test_admin_universal_crud tests.test_migrations -v` + e2e admin |
| P29 | Единая модальная форма заявки + тема обращения + удаление рекомендаций | `e2e/tests/public_client_flow.spec.js` + UI smoke лендинга | прогон Playwright через `docker compose run --rm --no-deps e2e ...` + ручная проверка текста/полей на лендинге |
| P30 | Отдельная страница работы с заявкой клиента | новые e2e для client workspace route + `tests/test_public_cabinet.py` | добавить e2e route-flow + прогон `test_public_cabinet` |
| P31 | Вход клиента через phone+OTP модалку | новые e2e OTP modal flow + `tests/test_otp_rate_limit.py`, `tests/test_public_requests.py` | e2e + backend OTP тесты |
| P32 | Переключение между заявками клиента | новые e2e multi-request flow + `tests/test_public_cabinet.py` | e2e multi-request + backend regression |
| P33 | Чат в отдельном сервисе | `tests/test_public_cabinet.py`, `tests/test_admin_universal_crud.py` (chat service cases) + UI smoke (`client.js`, `admin.jsx`) | `docker compose run --rm backend python -m unittest tests.test_public_cabinet tests.test_admin_universal_crud -v` + фронт-сборка admin entrypoint |
| P34 | Ненавязчивые цитаты в блоке «Первая консультация» | UI e2e/smoke лендинга | визуальная регрессия лендинга + Playwright public smoke |
| P35 | Предпросмотр документов | `tests/test_uploads_s3.py` (`test_public_attachment_object_preview_returns_inline_response`) + Playwright (`e2e/tests/public_client_flow.spec.js`, `e2e/tests/lawyer_role_flow.spec.js`) | `docker compose run --rm backend python -m unittest tests.test_uploads_s3 -v` + Playwright UI-прогон preview в клиенте и во вкладке работы с заявкой юриста/админа через сервис `e2e` |
| P36 | Навигация в админку и редиректы | `e2e/tests/admin_entry_flow.spec.js` + redirect checks | Playwright `admin_entry_flow` + `curl -I -H 'Host: localhost:8081' http://localhost:8081/admin` (ожидается `302` и `Location: /admin.html`) + `curl -I http://localhost:8081/admin.html` |
| P37 | Единые bootstrap-креды админа | `tests/test_admin_auth.py` + auth smoke (`/api/admin/auth/login`) + docs consistency check | `docker compose run --rm backend python -m unittest tests.test_admin_auth -v` + UI/API login smoke с `admin@example.com` / `admin123` |
| P38 | Конструктор маршрутов статусов (темы) | `tests/test_admin_universal_crud.py`, `tests/test_worker_maintenance.py` + e2e `e2e/tests/admin_status_designer_flow.spec.js` | `docker compose exec -T backend python -m unittest tests.test_admin_universal_crud tests.test_worker_maintenance -v` + `docker compose run --rm --no-deps -e E2E_BASE_URL=http://frontend e2e playwright test --config=playwright.config.js e2e/tests/admin_status_designer_flow.spec.js` |
| P39 | Канбан заявок для LAWYER/ADMIN | `tests/test_admin_universal_crud.py` (`test_requests_kanban_returns_grouped_cards_and_role_scope`) + e2e `e2e/tests/kanban_role_flow.spec.js` | `docker compose exec -T backend python -m unittest tests.test_admin_universal_crud.AdminUniversalCrudTests.test_requests_kanban_returns_grouped_cards_and_role_scope -v` и `docker compose run --rm --no-deps -e E2E_BASE_URL=http://frontend e2e playwright test --config=playwright.config.js e2e/tests/kanban_role_flow.spec.js`; дополнительно регресс `admin_role_flow`, `lawyer_role_flow` |
| P40 | Подготовка модульной сборки admin фронта | `frontend/Dockerfile`, `app/web/admin/index.jsx`, smoke e2e | базовая команда 4 + `e2e/tests/admin_entry_flow.spec.js` |
| P41 | Декомпозиция shared-слоя admin | сборка admin фронта + role e2e smoke | базовая команда 4 + `e2e/tests/admin_role_flow.spec.js`, `e2e/tests/kanban_role_flow.spec.js` |
| P42 | Декомпозиция feature-слоя admin | сборка admin фронта + role e2e regression | базовая команда 4 + полный e2e через сервис `e2e` |
| P43 | Декомпозиция backend CRUD | `tests/test_admin_universal_crud.py`, `tests/test_migrations.py` | `docker compose exec -T backend python -m unittest tests.test_admin_universal_crud tests.test_migrations -v` |
| P44 | Декомпозиция backend Requests | `tests/test_admin_universal_crud.py`, `tests/test_worker_maintenance.py`, e2e kanban | `docker compose exec -T backend python -m unittest tests.test_admin_universal_crud tests.test_worker_maintenance -v` + `e2e/tests/kanban_role_flow.spec.js` |
| P45 | Декомпозиция тестового слоя | пакетный запуск `tests/admin/*` + discovery | целевые команды по новым модулям + `python -m unittest discover -s tests -p 'test_*.py' -v` |
| P46 | Финализация декомпозиции | полный backend + frontend + e2e регресс | базовые команды 1-5 |

## Ролевое покрытие (PUBLIC / LAWYER / ADMIN)
### PUBLIC (клиент)
- Лендинг и клиентский контур через UI e2e: `e2e/tests/public_client_flow.spec.js` (создание заявки, кабинет, чат, загрузка файла).
- OTP create/view + 7-day cookie + rate-limit: `tests/test_public_requests.py`, `tests/test_otp_rate_limit.py`.
- Просмотр статуса/истории/чата/файлов/таймлайна по `track_number`: `tests/test_public_cabinet.py`.
- Переписка клиент -> юрист и маркеры непрочитанного: `tests/test_public_cabinet.py`, `tests/test_notifications.py`.
- Загрузка и скачивание файлов + лимиты 25MB/250MB + контроль доступа: `tests/test_uploads_s3.py`, `tests/test_public_cabinet.py`.
- Публичные счета и PDF в кабинете: `tests/test_invoices.py`.

### LAWYER (юрист)
- UI e2e: `e2e/tests/lawyer_role_flow.spec.js` (вход, claim неназначенной заявки, новая вкладка работы с заявкой, чтение обновлений, смена статуса).
- UI e2e: `e2e/tests/request_data_file_flow.spec.js` (юрист создает `Запрос` с `file`-полем, клиент загружает файл, юрист видит заполнение запроса).
- Дашборд юриста (свои, неназначенные, непрочитанные): `tests/test_dashboard_finance.py`.
- Видимость заявок: свои + неназначенные; запрет доступа к чужим: `tests/test_admin_universal_crud.py`.
- Claim неназначенной заявки, запрет takeover, запрет назначения через CRUD: `tests/test_admin_universal_crud.py`.
- Смена статуса и завершение только своих заявок: `tests/test_admin_universal_crud.py`.
- Оповещения (алерты): список/прочтение и генерация по событиям: `tests/test_notifications.py`.
- Сообщения/файлы по заявке и непрочитанные маркеры: `tests/test_notifications.py`, `tests/test_uploads_s3.py`, `tests/test_admin_universal_crud.py`.
- Счета: видимость только своих, запрет ставить `PAID`: `tests/test_invoices.py`, `tests/test_billing_flow.py`.

### ADMIN (администратор)
- UI e2e: `e2e/tests/admin_role_flow.spec.js` (вход, справочники, создание пользователя/темы, создание и оплата счета).
- UI e2e entry/redirect smoke: `e2e/tests/admin_entry_flow.spec.js` (нет CTA админки на лендинге, вход через `/admin`).
- Bootstrap-auth: `tests/test_admin_auth.py` (автосоздание bootstrap-admin и негативные кейсы логина).
- CRUD пользователей/юристов (пароли, роли, профильная тема, аватар): `tests/test_admin_universal_crud.py`, `tests/test_uploads_s3.py`.
- Темы и флоу статусов (включая ветвление), SLA-переходы: `tests/test_admin_universal_crud.py`, `tests/test_worker_maintenance.py`.
- Шаблоны обязательных/дозапрашиваемых данных: `tests/test_admin_universal_crud.py`, `tests/test_public_requests.py`.
- Счета и оплаты (создание, статусы, подтверждение оплаты, multiple cycles): `tests/test_invoices.py`, `tests/test_billing_flow.py`.
- Дашборд портала и загрузка юристов + финансовые метрики: `tests/test_dashboard_finance.py`, `tests/test_admin_universal_crud.py`.
- Безопасность: security-audit по S3 доступам, RBAC и шифрование реквизитов: `tests/test_security_audit.py`, `tests/test_uploads_s3.py`, `tests/test_invoices.py`.

## Минимальный чеклист закрытия пункта
1. Выполнить миграции (если были изменения схемы).
2. Выполнить целевые тесты пункта по матрице выше.
3. Выполнить полный прогон `unittest discover`.
4. Выполнить `compileall`.
5. Для изменений админ-фронта выполнить сборку entrypoint `admin/index.jsx` через Docker Compose.
6. После успешной проверки обновить статус пункта в `context/10_development_execution_plan.md`.

## Последние подтвержденные прогоны
- `docker compose run --rm backend python -m unittest -v tests.test_admin_auth` — `3 passed`.
- `docker compose run --rm backend python -m unittest discover -s tests -p 'test_*.py' -v` — `105 passed`.
- `docker compose run --rm backend python -m compileall app tests alembic` — успешно.
- `docker compose run --rm --no-deps --entrypoint sh frontend -lc "apk add --no-cache nodejs npm >/dev/null && npx --yes esbuild /usr/share/nginx/html/admin/index.jsx --loader:.jsx=jsx --bundle --outfile=/tmp/admin.bundle.js"` — успешно (`admin.bundle.js` собран).
- `docker compose run --rm --no-deps -e E2E_BASE_URL=http://frontend e2e playwright test tests/admin_entry_flow.spec.js --config=playwright.config.js` — `1 passed`.
- `docker compose run --rm --no-deps -e E2E_BASE_URL=http://frontend e2e playwright test --config=playwright.config.js e2e/tests/admin_entry_flow.spec.js e2e/tests/admin_role_flow.spec.js` — `2 passed`.
- `docker compose run --rm --no-deps -e E2E_BASE_URL=http://frontend e2e playwright test --config=playwright.config.js e2e/tests/kanban_role_flow.spec.js` — `1 passed`.
- `docker compose run --rm -e E2E_BASE_URL=http://frontend e2e playwright test e2e/tests/admin_role_flow.spec.js e2e/tests/lawyer_role_flow.spec.js --reporter=line` — `2 passed` (после выноса `dashboard/requests/invoices` из `admin.jsx`).
- `docker compose run --rm -e E2E_BASE_URL=http://frontend e2e playwright test e2e/tests/admin_role_flow.spec.js e2e/tests/admin_status_designer_flow.spec.js --reporter=line` — `2 passed` (после выноса `config`-секции в `ConfigSection`).
- `docker compose run --rm -e E2E_BASE_URL=http://frontend e2e playwright test e2e/tests/admin_role_flow.spec.js --reporter=line` — `1 passed` (после выноса `quotes/availableTables/meta` секций).
- `docker compose run --rm -e E2E_BASE_URL=http://frontend e2e playwright test e2e/tests/admin_role_flow.spec.js e2e/tests/kanban_role_flow.spec.js --reporter=line` — `2 passed` (после выноса `useKanban`).
- `docker compose run --rm -e E2E_BASE_URL=http://frontend e2e playwright test e2e/tests/lawyer_role_flow.spec.js --reporter=line` — `1 passed` (после выноса `useRequestWorkspace` state/actions).
- `docker compose run --rm -e E2E_BASE_URL=http://frontend e2e playwright test e2e/tests/request_data_file_flow.spec.js --reporter=line` — `1 passed` (E2E: `REQUEST_DATA` с типом `file`, загрузка клиентом через S3, отметка выполнения у юриста).
- `docker compose run --rm -e E2E_BASE_URL=http://frontend e2e playwright test e2e/tests/admin_role_flow.spec.js e2e/tests/kanban_role_flow.spec.js e2e/tests/lawyer_role_flow.spec.js --reporter=line` — `3 passed` (после внедрения `useTablesState` и переноса registry state таблиц).
- `docker compose run --rm -e E2E_BASE_URL=http://frontend e2e playwright test e2e/tests/admin_role_flow.spec.js e2e/tests/lawyer_role_flow.spec.js --reporter=line` — `2 passed` (после переноса `loadRequestModalData`/`refreshRequestModal` в `useRequestWorkspace`).
- `docker compose run --rm -e E2E_BASE_URL=http://frontend e2e playwright test e2e/tests/admin_role_flow.spec.js e2e/tests/lawyer_role_flow.spec.js --reporter=line` — `2 passed` (после переноса `openRequestDetails` и `submitRequestModalMessage` в `useRequestWorkspace`).
- `docker compose run --rm -e E2E_BASE_URL=http://frontend e2e playwright test e2e/tests/admin_role_flow.spec.js e2e/tests/admin_status_designer_flow.spec.js e2e/tests/kanban_role_flow.spec.js e2e/tests/lawyer_role_flow.spec.js --reporter=line` — `4 passed` (после выноса `useTableActions`: `loadTable` + paging/sort).
- `docker compose run --rm -e E2E_BASE_URL=http://frontend e2e playwright test e2e/tests/admin_role_flow.spec.js e2e/tests/admin_status_designer_flow.spec.js e2e/tests/kanban_role_flow.spec.js e2e/tests/lawyer_role_flow.spec.js --reporter=line` — `4 passed` (после выноса `useTableFilterActions` и `useAdminCatalogLoaders`, закрытие `P42`).
- `docker compose run --rm --no-deps -e E2E_BASE_URL=http://frontend e2e playwright test --config=playwright.config.js` — `6 passed` (рольовые e2e + конструктор статусов + канбан: `admin_entry_flow`, `admin_role_flow`, `admin_status_designer_flow`, `kanban_role_flow`, `lawyer_role_flow`, `public_client_flow`).
