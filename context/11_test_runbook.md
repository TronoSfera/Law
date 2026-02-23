# Runbook Проверок (Тесты и Валидация по Плану)

## Назначение
Этот файл фиксирует, где находятся проверки для каждого пункта `P01-P23` и как их запускать.
Использовать перед переводом пункта в статус `сделано`.

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
4. Проверка сборки `admin.jsx` через Docker Compose (на образе `frontend`):
```bash
docker compose build frontend
docker compose run --rm --no-deps --entrypoint sh frontend -lc "apk add --no-cache nodejs npm >/dev/null && npx --yes esbuild /usr/share/nginx/html/admin.jsx --loader:.jsx=jsx --bundle --outfile=/tmp/admin.bundle.js"
```

## Матрица проверок по задачам
| ID | Что проверяем | Где тесты | Как запускать |
|---|---|---|---|
| P01 | Базовый запуск сервисов и API | smoke + общие тесты | `docker compose up -d`; затем базовые команды 1-3 |
| P02 | Таблицы и миграции | `tests/test_migrations.py` | `docker compose exec -T backend python -m unittest tests.test_migrations -v` |
| P03 | Universal CRUD + RBAC + audit | `tests/test_admin_universal_crud.py` | `docker compose exec -T backend python -m unittest tests.test_admin_universal_crud.AdminUniversalCrudTests -v` |
| P04 | Пользователи, роли, пароли | `tests/test_admin_universal_crud.py` (тесты про `admin_users`) | команда как для `P03` |
| P05 | Базовый auto-assign | `tests/test_auto_assign.py` | `docker compose exec -T backend python -m unittest tests.test_auto_assign -v` |
| P06 | Админка `admin.jsx` + базовый UI контур | сборка `admin.jsx` + CRUD/API тесты | базовая команда 4 + тесты `P03` |
| P07 | Доп. темы юристов (`admin_user_topics`) | `tests/test_admin_universal_crud.py` | команда как для `P03` |
| P08 | Ручной claim (без гонок) | `tests/test_admin_universal_crud.py` (claim-тесты) | команда как для `P03` |
| P09 | ADMIN-only переназначение | `tests/test_admin_universal_crud.py` (reassign-тесты) | команда как для `P03` |
| P10 | Auto-assign v2 приоритетов | `tests/test_auto_assign.py` | команда как для `P05` |
| P11 | OTP create/view + 7-day cookie | `tests/test_public_requests.py` | `docker compose exec -T backend python -m unittest tests.test_public_requests -v` |
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
| P22 | E2E критические сценарии | набор `tests/test_*.py` + новые E2E-тесты | базовые команды 1-3 + полный прогон |
| P23 | Hardening/release | весь regression + compile + миграции + UI build | базовые команды 1-4 |
| P24 | Мобильная адаптация лендинга/клиентских форм | `app/web/landing.html` + ручная проверка в mobile viewport | собрать `admin.jsx` при затрагивании админки + открыть `landing.html` в 320px/375px/768px, проверить формы/чат/файлы без горизонтального скролла |
| P25 | Ставки юриста и ставка заявки | новые тесты `tests/test_rates.py` + интеграционные в `tests/test_admin_universal_crud.py` | прогон `test_rates` + `test_admin_universal_crud`; проверка что public API не отдает поля ставок/процентов |
| P26 | Billing-статус и шаблон счета | новые тесты `tests/test_billing_flow.py` + e2e статусных переходов | прогон `test_billing_flow` + `test_admin_universal_crud`; валидация генерации счета и фиксации оплаты при ADMIN->\"Оплачено\" (в т.ч. множественные оплаты в одной заявке) |
| P27 | Security audit S3/ПДн | новые тесты `tests/test_security_audit.py` + `tests/test_uploads_s3.py` | прогон `test_security_audit` + `test_uploads_s3`; проверка логирования и ограничений доступа |

## Минимальный чеклист закрытия пункта
1. Выполнить миграции (если были изменения схемы).
2. Выполнить целевые тесты пункта по матрице выше.
3. Выполнить полный прогон `unittest discover`.
4. Выполнить `compileall`.
5. Для изменений `admin.jsx` выполнить сборку `admin.jsx` через Docker Compose.
6. После успешной проверки обновить статус пункта в `context/10_development_execution_plan.md`.
