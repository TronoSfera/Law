# Legal Case Tracker (FastAPI)
Backend skeleton: public requests + OTP + public JWT cookie + admin (admin/lawyer) + files (self-hosted S3) + SLA/auto-assign (Celery) + quotes.

## Run (Docker)
```bash
cp .env.example .env
docker compose up --build
```
Landing (frontend): http://localhost:8081
Admin UI: http://localhost:8081/admin
API (backend): http://localhost:8002
Swagger: http://localhost:8002/docs

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
```

For local/dev mock mode:
```bash
SMS_PROVIDER=dummy
```
In this mode OTP code is printed to backend logs.

Admin health-check endpoint (no SMS send):
`GET /api/admin/system/sms-provider-health`
