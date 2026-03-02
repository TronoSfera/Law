# Матрица контролей ИБ/ПДн (Draft)

| Область | Требование/риск | Техническая мера | Где реализовано | Как проверять |
|---|---|---|---|---|
| Идентификация/доступ | Несанкционированный доступ к ПДн | JWT + OTP/TOTP, RBAC, ownership checks | `app/api/public/*`, `app/api/admin/*`, `app/core/deps.py` | Unit/e2e role-flow, негативные сценарии доступа |
| Сетевая защита | Перехват трафика | TLS edge (80/443), internal TLS к MinIO | `deploy/nginx/*`, `frontend/nginx.prod.conf`, compose prod | `curl -I https://...`, проверка cert chain, health checks |
| Конфигурация prod | Небезопасные дефолты | startup-prod валидация security settings | `app/core/config.py` | `tests/test_security_config.py` |
| CORS/CSP | XSS/CORS misconfig | Явные CORS методы/headers; CSP `script-src/style-src/connect-src 'self'` | `app/main.py`, `app/chat_main.py`, `app/core/http_hardening.py` | `tests/test_security_config.py`, `tests/test_http_hardening.py` |
| Защита данных at-rest | Утечка реквизитов/чатов | Шифрование + KID keyring + rotation | `app/services/chat_crypto.py`, `app/services/invoice_crypto.py` | `tests/test_crypto_kid_rotation.py`, reencrypt smoke |
| Вложения | Загрузка вредоносных файлов | ClamAV + MIME/content policy + quarantine statuses | `app/workers/tasks/security.py`, upload APIs | `tests/test_attachment_scan.py`, `tests/test_uploads_s3.py` |
| Аудит | Отсутствие следов доступа к ПДн | `security_audit_log` + read/download events | `app/services/security_audit.py` | `tests/test_security_audit.py`, SQL выборки |
| Retention | Избыточное хранение ПДн | Политики хранения + Celery cleanup | `app/models/data_retention_policy.py`, `cleanup_pii_retention` | `tests/test_worker_maintenance.py` |
| Инциденты | Неуправляемая реакция | Runbook + incident checklist generator | `context/17_pdn_incident_response_runbook.md`, `scripts/ops/incident_checklist.sh` | `make incident-checklist` |
| Секреты | Компрометация ключей | Ротация внутренних секретов + KID rotation | `scripts/ops/rotate_prod_secrets.sh`, `rotate_encryption_kid.sh` | dry-run + deploy smoke |

## Примечания
- Матрица покрывает технический контур. Оргмеры (регламенты, обучение, приказы, журнал СКЗИ) ведутся отдельно.
- Для задач `SEC-14` и `SEC-15` после реализации добавить отдельные строки в эту таблицу.
