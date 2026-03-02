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

Use production template before first deploy:
```bash
cp .env.production .env
```

Prerequisites:
- DNS `A` record: `ruakb.ru -> 45.150.36.116`
- Optional DNS `A` record: `www.ruakb.ru -> 45.150.36.116`
- DNS `A` record: `ruakb.online -> 45.150.36.116`
- Optional DNS `A` record: `www.ruakb.online -> 45.150.36.116`
- Open server ports: `80/tcp`, `443/tcp`
- DB credentials in `.env` must be consistent:
  - `DATABASE_URL=postgresql+psycopg://postgres:<password>@db:5432/legal`
  - `POSTGRES_PASSWORD=<same password>`

Production security baseline in `.env`:
```bash
APP_ENV=prod
PRODUCTION_ENFORCE_SECURE_SETTINGS=true
OTP_DEV_MODE=false
ADMIN_BOOTSTRAP_ENABLED=false
PUBLIC_COOKIE_SECURE=true
PUBLIC_COOKIE_SAMESITE=lax
PUBLIC_ALLOWED_WEB_ORIGINS=https://ruakb.ru,https://www.ruakb.ru,https://ruakb.online,https://www.ruakb.online
CORS_ORIGINS=https://ruakb.ru,https://www.ruakb.ru,https://ruakb.online,https://www.ruakb.online
CORS_ALLOW_METHODS=GET,POST,PUT,PATCH,DELETE,OPTIONS
CORS_ALLOW_HEADERS=Authorization,Content-Type,X-Requested-With,X-Request-ID
S3_USE_SSL=true
S3_VERIFY_SSL=true
S3_CA_CERT_PATH=/etc/ssl/minio/ca.crt
MINIO_TLS_ENABLED=true
CHAT_ENCRYPTION_SECRET=<strong-random-secret>
DATA_ENCRYPTION_SECRET=<strong-random-secret>
DATA_ENCRYPTION_ACTIVE_KID=<kid>
DATA_ENCRYPTION_KEYS=<kid>=<strong-random-secret>
CHAT_ENCRYPTION_ACTIVE_KID=<kid>
CHAT_ENCRYPTION_KEYS=<kid>=<strong-random-secret>
ADMIN_JWT_SECRET=<strong-random-secret>
PUBLIC_JWT_SECRET=<strong-random-secret>
INTERNAL_SERVICE_TOKEN=<strong-random-secret>
MINIO_ROOT_USER=<non-default-user>
MINIO_ROOT_PASSWORD=<strong-random-password>
```

Initialize internal TLS for MinIO before first production start:
```bash
make prod-minio-tls-init
```
This generates:
- `deploy/tls/minio/public.crt`
- `deploy/tls/minio/private.key`
- `deploy/tls/minio/ca.crt`

Production frontend/backend/worker trust `deploy/tls/minio/ca.crt` and use HTTPS to MinIO inside docker network.

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

`make prod-up` includes strict preflight checks (`scripts/ops/deploy_prod.sh`) and fails on insecure production env values
(weak/default secrets, localhost origins, disabled strict origin checks, non-TOTP-required admin auth, etc.).

Certificate renew:
```bash
make prod-cert-renew
```

Internal secret rotation (excluding external providers such as SMS/Telegram):
```bash
make prod-secrets-generate
```
This creates `.env.prod` with new generated internal secrets.

Apply generated secrets to running production stack:
```bash
make prod-secrets-apply
```
This will backup current `.env`, replace it with `.env.prod`, rotate Postgres password in DB,
recreate containers, run migrations, and execute health checks.

Encryption KID rotation (without data loss):
```bash
make rotate-encryption-kid
# restart backend/chat/worker
make reencrypt-active-kid
```
`rotate-encryption-kid` appends a new `kid=secret` into `DATA_ENCRYPTION_KEYS` and `CHAT_ENCRYPTION_KEYS`
and switches `*_ACTIVE_KID` to the new value.
`reencrypt-active-kid` re-encrypts historical invoice requisites, admin TOTP secrets, and chat message bodies.

Safety guard for apply mode:
- script requires confirmation token `ROTATE-PROD-SECRETS`;
- default `make prod-secrets-apply` passes it via `CONFIRM_TOKEN`;
- you can override explicitly:
```bash
make prod-secrets-apply CONFIRM_TOKEN=ROTATE-PROD-SECRETS
```

Checks:
```bash
curl -I https://ruakb.ru
curl -fsS https://ruakb.ru/health
curl -fsS https://ruakb.ru/chat-health
docker compose -f docker-compose.yml -f docker-compose.prod.nginx.yml exec -T backend sh -lc 'python - <<PY\nfrom app.services.s3_storage import get_s3_storage\nprint(get_s3_storage().client._endpoint.host)\nPY'
ss -lntp | egrep ':(80|443|5432|6379|8002|8081|9000|9001)\\b'
```

## Incident response (PDn)
Create a standard incident checklist report:
```bash
make incident-checklist
```
or with details:
```bash
./scripts/ops/incident_checklist.sh \
  --severity HIGH \
  --category UNAUTHORIZED_ACCESS \
  --summary "Suspicious read access to request cards" \
  --track-number TRK-XXXX
```
Generated markdown report is saved to `reports/incidents/incident-<timestamp>.md`.

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

Compose profiles by environment:
- local (`docker-compose.local.yml`): `clamav` uses `mkodockx/docker-clamav:alpine` (multi-arch, including arm64).
- prod (`docker-compose.prod*.yml`): `clamav` stays on official `clamav/clamav` with `platform: linux/amd64`.

Scan statuses on `attachments`:
- `PENDING` (file uploaded, scan in progress)
- `CLEAN` (safe to download)
- `INFECTED` (blocked)
- `ERROR` (scan failed, blocked when enforcement is on)

When `ATTACHMENT_SCAN_ENFORCE=true`, public/admin download endpoints block non-clean files.

## Security CI pipeline (SEC-14)
GitHub Actions workflow: `/Users/tronosfera/Develop/Law/.github/workflows/security-ci.yml`

Checks:
- SAST: `bandit` for `app/` and `scripts/`.
- Dependency scan: `pip-audit` for `requirements.txt`.
- Container scan: `trivy` on backend Docker image.

Fail thresholds (configurable in workflow `env`):
- `BANDIT_MAX_HIGH` (default `0`)
- `DEP_MAX_VULNS` (default `0`)
- `TRIVY_MAX_HIGH` (default `0`)
- `TRIVY_MAX_CRITICAL` (default `0`)

Artifacts uploaded for each run:
- `reports/security/bandit.json`
- `reports/security/pip-audit.json`
- `reports/security/sast-deps-summary.txt`
- `reports/security/trivy-image.json`
- `reports/security/trivy-image.sarif`
- `reports/security/trivy-summary.txt`

## Security smoke (SEC-15)
Local/manual run:
```bash
make security-smoke
```
or with explicit target URL:
```bash
./scripts/ops/security_smoke.sh https://ruakb.online
```

What is checked:
- public health endpoints (`/health`, `/chat-health`, `/email-health`);
- required security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Content-Security-Policy`);
- TLS certificate availability/expiry (for `https://` URLs);
- production cookie/origin env flags (`PUBLIC_COOKIE_SECURE`, `PUBLIC_COOKIE_SAMESITE`, `PUBLIC_STRICT_ORIGIN_CHECK`);
- attachment scan service availability (`clamav`, when scan is enabled);
- DB access to `security_audit_log` (table exists + query works).

Report is saved to:
- `reports/security/security-smoke-<timestamp>.md`

Example cron (every 15 minutes):
```bash
*/15 * * * * cd /opt/Law && ./scripts/ops/security_smoke.sh https://ruakb.online >> /var/log/law-security-smoke.log 2>&1
```

## Full production security audit and auto-repair
Single command to verify full security block and auto-generate missing technical artifacts:
```bash
make prod-security-audit DOMAIN=ruakb.ru WWW_DOMAIN=www.ruakb.ru SECOND_DOMAIN=ruakb.online SECOND_WWW_DOMAIN=www.ruakb.online LETSENCRYPT_EMAIL=you@example.com
```

What this workflow does (`scripts/ops/prod_security_audit.sh`):
- checks required compose/nginx files;
- restores/generates `.env` if missing (`.env.prod` or `.env.production` + `rotate_prod_secrets.sh`);
- generates MinIO internal TLS bundle if missing (`prod-minio-tls-init` equivalent);
- starts/reconciles production stack (nginx profile);
- applies DB migrations;
- validates production security config (`validate_production_security_or_raise`);
- runs local and external security smoke checks;
- generates incident checklist snapshot report.

Optional: auto-bootstrap Let's Encrypt certs if HTTPS health is failing:
```bash
make prod-security-audit AUTO_CERT_INIT=1 DOMAIN=ruakb.ru WWW_DOMAIN=www.ruakb.ru SECOND_DOMAIN=ruakb.online SECOND_WWW_DOMAIN=www.ruakb.online LETSENCRYPT_EMAIL=you@example.com
```

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
