# System Overview Context (Global)

## Project
Legal Case Tracker (Russia)
One-page landing + public case tracking (OTP + JWT cookie) + admin panel (ADMIN/LAWYER) + files (S3 self-hosted) + SLA/auto-assign (Celery) + quotes carousel.

## Core Principles
- All infrastructure self-hosted (including S3: MinIO/Ceph)
- Backend: Python 3.12 + FastAPI
- DB: PostgreSQL
- Queue: Redis + Celery
- Immutable data after status change
- Full audit log for admin changes
- UniversalTable + UniversalRecordModal (meta-driven admin UI)

## Roles
- PUBLIC (via OTP + cookie)
- LAWYER
- ADMIN