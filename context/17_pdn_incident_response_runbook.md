# Runbook: Incident Response по ПДн

Дата: 02.03.2026  
Статус: `активен`

## Назначение
Документ задает минимальный operational-процесс реагирования на инциденты, связанные с персональными данными (ПДн):
- подозрение на несанкционированный доступ;
- утечка сообщений/файлов/карточек заявок;
- массовые неудачные обращения к защищенным объектам;
- компрометация учетных данных/секретов.

## Роли
- `Incident Lead` — координация и принятие решений.
- `Security Engineer` — анализ логов, локализация, сбор evidence.
- `Platform Engineer` — технические изменения (блокировки, ротация, релиз фиксов).
- `Business/Legal Owner` — решения по внешним уведомлениям и коммуникациям.

## SLA эскалации
- `CRITICAL`: старт реакции <= 15 минут.
- `HIGH`: <= 30 минут.
- `MEDIUM`: <= 2 часа.
- `LOW`: <= 1 рабочий день.

## Алгоритм
1. Регистрация инцидента.
- Запустить: `./scripts/ops/incident_checklist.sh`.
- Зафиксировать severity/category/summary/request_id/track.

2. Локализация.
- Выгрузить последние события из `security_audit_log` и `audit_log`.
- Ограничить доступ (RBAC deny, временная блокировка операций).
- При необходимости отключить внешние интеграции.

3. Сдерживание.
- Ротация критичных секретов (JWT, INTERNAL_SERVICE_TOKEN, внешние API ключи).
- Включение усиленного мониторинга логов и алертов.

4. Восстановление.
- Проверка целостности данных.
- Проверка health сервисов.
- Прогон smoke/autotest набора.

5. Postmortem.
- Корневая причина, окно компрометации, затронутые данные.
- План корректирующих действий и сроков.
- Обновление security backlog и runbook.

## Технические команды
Проверка health:
```bash
curl -fsS http://localhost:8081/health
curl -fsS http://localhost:8081/chat-health
curl -fsS http://localhost:8081/email-health
```

Security audit:
```bash
docker compose exec -T db psql -U postgres -d legal -c "select created_at, actor_role, actor_subject, actor_ip, action, scope, allowed from security_audit_log order by created_at desc limit 200;"
```

CRUD audit:
```bash
docker compose exec -T db psql -U postgres -d legal -c "select created_at, entity, entity_id, action, responsible from audit_log order by created_at desc limit 200;"
```

Снимок логов:
```bash
docker compose logs --since 2h backend chat-service worker beat edge > reports/incidents/logs-$(date -u +%Y%m%d-%H%M%S).txt
```

## Acceptance criteria
- Для каждого инцидента есть markdown-отчет в `reports/incidents/`.
- Есть evidence: SQL выгрузки аудита + архив логов.
- Выполнены шаги локализации и восстановления.
- Зафиксирован postmortem и follow-up задачи.
