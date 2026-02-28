# Legal Case Tracker (FastAPI)
Backend skeleton: public requests + OTP + public JWT cookie + admin (admin/lawyer) + files (self-hosted S3) + SLA/auto-assign (Celery) + quotes + dedicated chat microservice.

## Run (Docker)
```bash
cp .env.example .env
docker compose up --build
```
Landing (frontend): http://localhost:8081
Admin UI: http://localhost:8081/admin
API (backend): http://localhost:8002
Swagger: http://localhost:8002/docs
Chat service health (via nginx): http://localhost:8081/chat-health

## Production (ruakb.ru, 80/443, TLS via Nginx + Certbot)
Production stack uses dedicated edge nginx (`docker-compose.prod.nginx.yml`).

Prerequisites:
- DNS `A` record: `ruakb.ru -> 45.150.36.116`
- Optional DNS `A` record: `www.ruakb.ru -> 45.150.36.116`
- Open server ports: `80/tcp`, `443/tcp`

Initial certificate issue (bootstrap with nginx on port 80 only):
```bash
make prod-cert-init LETSENCRYPT_EMAIL=you@example.com DOMAIN=ruakb.ru WWW_DOMAIN=www.ruakb.ru
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

Configure provider in `.env`:
```bash
SMS_PROVIDER=smsaero
SMSAERO_EMAIL=your_email@example.com
SMSAERO_API_KEY=your_api_key
OTP_SMS_TEMPLATE=Your verification code: {code}
OTP_DEV_MODE=false
```

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
```

Alert-ready smoke script (for cron/CI):
```bash
./scripts/ops/check_chat_health.sh
```
Exit code `0` means healthy, non-zero means alert condition.
