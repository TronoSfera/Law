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
