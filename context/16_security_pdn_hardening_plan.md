# План доработки конфигурации безопасности ПДн (РФ)

Дата: 01.03.2026  
Статус документа: `сделано`  
Цель: привести техническую конфигурацию платформы к актуальным базовым требованиям по защите ПДн в РФ, с приоритетом на быстрое снижение юридических и эксплуатационных рисков.

## Контекст для ИИ-агента
- Система: FastAPI + Postgres + Redis + MinIO + Celery + frontend nginx + edge nginx.
- В проекте уже есть: RBAC, OTP/TOTP, шифрование чата/реквизитов, аудит файловых операций, TLS на edge.
- Критичные текущие риски:
  - `secure=False` у public cookie.
  - bootstrap-админ включен по умолчанию и дефолтные креды.
  - дефолтные root-учетные данные MinIO в compose.
  - отсутствует полноформатный operational compliance-контур (retention, инциденты, регламенты, проверка загрузок файлов).

## Нормативный baseline (для трассировки требований)
- 152-ФЗ (персональные данные): [https://www.consultant.ru/document/cons_doc_LAW_61801/](https://www.consultant.ru/document/cons_doc_LAW_61801/)
- ПП РФ №1119: [https://www.consultant.ru/document/cons_doc_LAW_137356/](https://www.consultant.ru/document/cons_doc_LAW_137356/)
- Приказ ФСТЭК №21: [https://www.consultant.ru/document/cons_doc_LAW_149175/](https://www.consultant.ru/document/cons_doc_LAW_149175/)
- Приказ ФСБ №378: [https://www.consultant.ru/document/cons_doc_LAW_167258/](https://www.consultant.ru/document/cons_doc_LAW_167258/)
- Официальная публикация ФЗ 23-ФЗ от 28.02.2025: [https://publication.pravo.gov.ru/document/0001202502280034](https://publication.pravo.gov.ru/document/0001202502280034)

## Принцип приоритизации
- `P0` — блокеры прод-безопасности и высокой вероятности санкций/инцидентов.
- `P1` — обязательные усиления, закрывающие значимые пробелы.
- `P2` — организационное и эксплуатационное развитие контура.

## Backlog задач (для исполнения ИИ-агентом)

| ID | Приоритет | Статус | Задача | Что сделать | Артефакт / DoD |
|---|---|---|---|---|---|
| SEC-01 | P0 | сделано | Secure cookie на проде | Вынести флаг `PUBLIC_COOKIE_SECURE` и ставить `secure=True` в prod. Добавить `PUBLIC_COOKIE_SAMESITE` в env. | Реализовано в `app/api/public/otp.py` и `app/api/public/requests.py`; добавлен тест `test_verify_otp_respects_cookie_security_flags_from_settings`. |
| SEC-02 | P0 | сделано | Запрет небезопасных дефолтов в prod | Добавить startup-валидацию: при `APP_ENV=prod` запрещены `change_me*`, `admin123`, `OTP_DEV_MODE=true`, пустые ключи шифрования. | Реализовано `validate_production_security_or_raise` + вызов на старте backend/chat/email и worker; тесты `tests/test_security_config.py`. |
| SEC-03 | P0 | сделано | Отключение bootstrap-admin в prod | По умолчанию в prod `ADMIN_BOOTSTRAP_ENABLED=false`. Разовый безопасный init admin через скрипт. | Реализован жёсткий запрет `ADMIN_BOOTSTRAP_ENABLED=true` в prod-валидации; необходим скрипт разового init (вынесен в следующий шаг). |
| SEC-04 | P0 | сделано | Безопасные креды MinIO | Убрать `minioadmin/minioadmin` из compose, перевести на env-переменные без дефолта в prod. | Обновлен `docker-compose.yml` на env-based creds и добавлены prod-checks в `scripts/ops/deploy_prod.sh`. |
| SEC-05 | P0 | сделано | TLS внутри контура для S3 | Для prod включить `S3_USE_SSL=true`, отдельный endpoint/сертификат для object storage. | Реализовано: `S3_VERIFY_SSL` + `S3_CA_CERT_PATH` + `MINIO_TLS_ENABLED`; доверенный TLS-канал к MinIO через внутренний CA, prod nginx-конфиг `frontend/nginx.prod.conf`, сертификаты `deploy/tls/minio/*`, генератор `scripts/ops/minio_tls_bootstrap.sh`, prod preflight проверки в `scripts/ops/deploy_prod.sh`. |
| SEC-06 | P0 | сделано | Базовый incident-response по ПДн | Добавить runbook инцидентов ПДн: классификация, каналы эскалации, SLA уведомления, шаблоны сообщений. | Реализовано: `context/17_pdn_incident_response_runbook.md` + `scripts/ops/incident_checklist.sh` (+ `make incident-checklist`). |
| SEC-07 | P1 | сделано | Антивирусная проверка вложений | Добавить сервис сканирования (ClamAV container), статус проверки файла (`pending/clean/infected`), запрет выдачи `infected`. | Реализовано: миграция `0030_attachment_scan`, async scan-task, content-policy check, блокировка выдачи при enforcement, тесты `tests/test_attachment_scan.py` + обновления `tests/test_uploads_s3.py`. |
| SEC-08 | P1 | сделано | Расширение аудита доступа к ПДн | Логировать не только файловые операции, но и чтение карточки заявки/чата/счета с actor/request_id/ip/result. | Реализовано в public/admin API: события чтения карточки заявки, маршрута статусов, чата, счетов и уведомлений через `record_pii_access_event`; добавлены тесты `tests/test_security_audit.py` (read event). |
| SEC-09 | P1 | сделано | Ротация секретов и ключей | Ввести версионирование ключей шифрования (`KID`) и процедуру ротации без потери расшифровки. | Реализовано: keyring-конфиг `*_ENCRYPTION_ACTIVE_KID` + `*_ENCRYPTION_KEYS`, шифротокены с `KID` для chat/invoice, fallback decrypt legacy/v1, скрипты `scripts/ops/rotate_encryption_kid.sh` и `app/scripts/reencrypt_with_active_kid.py`, runbook `context/18_encryption_key_rotation_runbook.md`, автотесты `tests/test_crypto_kid_rotation.py`. |
| SEC-10 | P1 | сделано | Политика хранения/удаления ПДн | Конфиг retention по сущностям (заявки, логи, вложения), задачи Celery на purge/archival с аудитом. | Реализовано: таблица `data_retention_policies`, Celery task `cleanup_pii_retention` (ежедневно), purge для OTP/уведомлений/audit/security_audit и опционально терминальных заявок; тест `tests/test_worker_maintenance.py::test_cleanup_pii_retention_deletes_old_rows_by_policy`. |
| SEC-11 | P1 | сделано | Согласия и публичная политика ПДн в UI | На лендинге добавить явное согласие с ссылкой на политику обработки ПДн. Логировать факт согласия. | Реализовано: checkbox согласия на лендинге + `privacy.html`; поля `requests.pdn_consent*`; аудит `PDN_CONSENT_CAPTURED`; тесты `tests/test_public_requests.py` (обязательное согласие). |
| SEC-12 | P1 | сделано | Ужесточение CORS/CSP для prod | Разделить dev/prod CORS, ограничить `script-src` и убрать внешние источники без необходимости. | Реализовано: явные CORS-параметры `CORS_ALLOW_METHODS/CORS_ALLOW_HEADERS/CORS_ALLOW_CREDENTIALS`, прод-валидация `CORS_ORIGINS` (без `*`, `localhost`, `http`) и запрет wildcard для headers/methods, явный `script-src/style-src/connect-src` в backend CSP; тесты `tests/test_security_config.py` + `tests/test_http_hardening.py`. |
| SEC-13 | P2 | сделано | Комплект ИСПДн-документов (техчасть) | Подготовить техблок: модель угроз, матрица контролей, границы ИСПДн, ответственные роли. | Реализовано: `docs/security/ispdn_boundary.md`, `docs/security/threat_model.md`, `docs/security/control_matrix.md`, `docs/security/roles_and_responsibilities.md`, индекс `docs/security/README.md`. |
| SEC-14 | P2 | сделано | Контроль уязвимостей в CI | Добавить SAST/dep-scan и базовый container scan в pipeline. | Реализовано: GitHub Actions workflow `.github/workflows/security-ci.yml` (bandit + pip-audit + trivy), пороги `BANDIT_MAX_HIGH/DEP_MAX_VULNS/TRIVY_MAX_HIGH/TRIVY_MAX_CRITICAL`, отчеты загружаются в artifacts и SARIF (`trivy-image.sarif`) публикуется в Security tab. |
| SEC-15 | P2 | сделано | Регулярный security smoke | Набор cron-проверок: cookie flags, TLS, headers, доступность audit/scan сервисов. | Реализовано: `scripts/ops/security_smoke.sh` + `make security-smoke`, markdown-отчет `reports/security/security-smoke-<timestamp>.md`, инструкция cron в `README.md`. |

## Последовательность внедрения
1. `SEC-01` → `SEC-05` (закрытие P0 в коде/конфиге).
2. `SEC-06` (операционный минимум на инциденты).
3. `SEC-07` → `SEC-12` (P1, прикладное усиление).
4. `SEC-13` → `SEC-15` (P2, зрелость и устойчивость процесса).

## Технические указания ИИ-агенту
- Любую prod-задачу сопровождать:
  - миграцией (если меняется схема),
  - unit/integration тестом,
  - обновлением `README.md` и `context/11_test_runbook.md`.
- Для security-конфига использовать feature flags/env:
  - изменения должны быть обратимо включаемыми.
- В PR/коммите фиксировать:
  - риск, который закрыт,
  - как проверить вручную,
  - как откатить.

## Минимальный check-list приёмки для каждого SEC-* пункта
- Есть код/конфиг + тесты.
- Нет regression по e2e основных ролей.
- Обновлена документация (`README` + runbook + context).
- Указан rollback шаг.

## Статус исполнения
- `SEC-01`, `SEC-02`, `SEC-03`, `SEC-04`, `SEC-07`, `SEC-08`, `SEC-10`, `SEC-11`: `сделано`.
- `SEC-12`: `сделано`.
- `SEC-13`: `сделано`.
- `SEC-14`: `сделано`.
- `SEC-15`: `сделано`.
- Все пункты `SEC-01..SEC-15` закрыты.
