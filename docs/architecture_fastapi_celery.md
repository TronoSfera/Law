# Architecture (FastAPI + Celery/Beat)
- FastAPI API (public/admin)
- PostgreSQL
- Redis (rate-limit + Celery broker/backend)
- MinIO (self-hosted S3)
- Celery worker + beat (SLA, auto-assign, cleanup)
- Integrations: SMS (OTP), Telegram (notifications)

## FastAPI module layout
app/
  core/ (config, security, deps)
  db/ (engine/session)
  models/ (SQLAlchemy entities)
  schemas/ (Pydantic schemas)
  services/ (business logic: otp, uploads, immutable, universal query)
  api/public/ (landing endpoints)
  api/admin/ (admin endpoints)
  workers/ (celery app + tasks)
