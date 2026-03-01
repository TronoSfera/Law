# Legal Case Tracker (FastAPI)
Backend skeleton: public requests + OTP + public JWT cookie + admin (admin/lawyer) + files (self-hosted S3) + SLA/auto-assign (Celery) + quotes + dedicated chat microservice.

## Run (Docker)
```bash
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
```
Landing (frontend): http://localhost:8081
Admin UI: http://localhost:8081/admin
API (backend): http://localhost:8002
Swagger: http://localhost:8002/docs
Chat service health (via nginx): http://localhost:8081/chat-health
Email service health (via nginx): http://localhost:8081/email-health

## Production (ruakb.ru + ruakb.online, 80/443, TLS via Nginx + Certbot)
Production stack uses dedicated edge nginx (`docker-compose.prod.nginx.yml`).

Prerequisites:
- DNS `A` record: `ruakb.ru -> 45.150.36.116`
- Optional DNS `A` record: `www.ruakb.ru -> 45.150.36.116`
- DNS `A` record: `ruakb.online -> 45.150.36.116`
- Optional DNS `A` record: `www.ruakb.online -> 45.150.36.116`
- Open server ports: `80/tcp`, `443/tcp`
- DB credentials in `.env` must be consistent:
  - `DATABASE_URL=postgresql+psycopg://postgres:<password>@db:5432/legal`
  - `POSTGRES_PASSWORD=<same password>`

Initial certificate issue (bootstrap with nginx on port 80 only):
```bash
make prod-cert-init LETSENCRYPT_EMAIL=you@example.com DOMAIN=ruakb.ru WWW_DOMAIN=www.ruakb.ru
```
By default `prod-cert-init` also includes `ruakb.online` and `www.ruakb.online`.
If needed, override:
```bash
make prod-cert-init \
  LETSENCRYPT_EMAIL=you@example.com \
  DOMAIN=ruakb.ru WWW_DOMAIN=www.ruakb.ru \
  SECOND_DOMAIN=ruakb.online SECOND_WWW_DOMAIN=www.ruakb.online
```

Regular production start/update:
```bash
make prod-up
```

Certificate renew:
```bash
make prod-cert-renew
```

Checks:
```bash
curl -I https://ruakb.ru
curl -fsS https://ruakb.ru/health
curl -fsS https://ruakb.ru/chat-health
ss -lntp | egrep ':(80|443|5432|6379|8002|8081|9000|9001)\\b'
```

## Migrations
```bash
docker compose exec backend alembic upgrade head
```

## Seed Quotes (Upsert)
```bash
make seed-quotes
```
Loads 50 justice-themed quotes into `quotes` with idempotent upsert by `(author, text)`.

## OTP SMS provider (SMS Aero)
OTP sending is implemented through a dedicated SMS service layer (`app/services/sms_service.py`).

Public auth mode can be selected via environment:
```bash
PUBLIC_AUTH_MODE=sms          # sms | email | sms_or_email | totp
EMAIL_PROVIDER=dummy          # dummy | smtp
EMAIL_SERVICE_URL=http://email-service:8010
INTERNAL_SERVICE_TOKEN=change_me_internal_service_token
OTP_EMAIL_FALLBACK_ENABLED=true
OTP_SMS_MIN_BALANCE=20
ADMIN_AUTH_MODE=password_totp_optional  # password | password_totp_optional | password_totp_required
TOTP_ISSUER=Правовой Трекер
```

Configure provider in `.env`:
```bash
SMS_PROVIDER=smsaero
SMSAERO_EMAIL=your_email@example.com
SMSAERO_API_KEY=your_api_key
OTP_SMS_TEMPLATE=Your verification code: {code}
OTP_DEV_MODE=false
OTP_AUTOTEST_FORCE_MOCK_SMS=true
```

For SMTP email OTP:
```bash
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=mailer@example.com
SMTP_PASSWORD=your_password
SMTP_FROM=mailer@example.com
SMTP_USE_TLS=true
SMTP_USE_SSL=false
OTP_EMAIL_SUBJECT_TEMPLATE=Код подтверждения: {code}
OTP_EMAIL_TEMPLATE=Ваш код подтверждения: {code}
```

For dedicated email microservice (recommended in production):
```bash
EMAIL_PROVIDER=service
EMAIL_SERVICE_URL=http://email-service:8010
INTERNAL_SERVICE_TOKEN=<strong-random-token>
```

Admin/Lawyer TOTP endpoints:
- `GET /api/admin/auth/totp/status`
- `POST /api/admin/auth/totp/setup`
- `POST /api/admin/auth/totp/enable`
- `POST /api/admin/auth/totp/backup/regenerate`
- `POST /api/admin/auth/totp/disable`

For local/dev mock mode:
```bash
SMS_PROVIDER=dummy
```
In this mode OTP code is printed to backend logs.

You can also force mock mode with real provider settings:
```bash
OTP_DEV_MODE=true
```
When enabled, real SMS sending is disabled and OTP code is printed to backend logs.

Additionally, to protect SMS budget during automated tests:
```bash
OTP_AUTOTEST_FORCE_MOCK_SMS=true
```
When this flag is enabled and runtime is detected as autotest (`pytest/unittest/APP_ENV=test|ci`),
`SMS_PROVIDER=smsaero` is automatically forced to mock mode for OTP sending.

Admin health-check endpoint (no SMS send):
`GET /api/admin/system/sms-provider-health`

## Secure Chat (encrypted at rest)
Chat logic is isolated in `app/services/chat_secure_service.py`.

- Message bodies are encrypted before storing in DB (`messages.body`) and transparently decrypted on read.
- Encryption key priority:
  1. `CHAT_ENCRYPTION_SECRET`
  2. `DATA_ENCRYPTION_SECRET`
  3. JWT secrets fallback (not recommended for production)

Recommended production config:
```bash
CHAT_ENCRYPTION_SECRET=<long-random-secret>
DATA_ENCRYPTION_SECRET=<long-random-secret>
```

Chat API runs in a dedicated container (`chat-service`) with separate FastAPI entrypoint:
`app/chat_main.py`

Nginx routes only chat API prefixes to the chat container:
- `/api/public/chat/*`
- `/api/admin/chat/*`

## Attachment antivirus and content checks
Attachment scanning is asynchronous (Celery queue `uploads`) and supports ClamAV + content policy checks.

Environment flags:
```bash
ATTACHMENT_SCAN_ENABLED=true
ATTACHMENT_SCAN_ENFORCE=true
ATTACHMENT_ALLOWED_MIME_TYPES=application/pdf,image/jpeg,image/png,video/mp4,text/plain
CLAMAV_ENABLED=true
CLAMAV_HOST=clamav
CLAMAV_PORT=3310
CLAMAV_TIMEOUT_SECONDS=20
```

Scan statuses on `attachments`:
- `PENDING` (file uploaded, scan in progress)
- `CLEAN` (safe to download)
- `INFECTED` (blocked)
- `ERROR` (scan failed, blocked when enforcement is on)

When `ATTACHMENT_SCAN_ENFORCE=true`, public/admin download endpoints block non-clean files.

## Container health and alerting
Docker Compose is configured with:
- `restart: unless-stopped` for core services
- `healthcheck` for `db`, `redis`, `backend`, `chat-service`, `frontend`
- startup ordering via `depends_on: condition: service_healthy`

Quick checks:
```bash
docker compose up -d
docker compose ps
curl -fsS http://localhost:8081/health
curl -fsS http://localhost:8081/chat-health
curl -fsS http://localhost:8081/email-health
```

Alert-ready smoke script (for cron/CI):
```bash
./scripts/ops/check_chat_health.sh
```
Exit code `0` means healthy, non-zero means alert condition.
