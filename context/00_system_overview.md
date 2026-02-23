# System Overview Context (Global)

## Project
Legal Case Tracker (Russia)
One-page landing + public case tracking (OTP + JWT cookie) + admin panel (ADMIN/LAWYER) + files (S3 self-hosted) + SLA/auto-assign (Celery) + quotes carousel.

## Core Principles
- All infrastructure self-hosted (including S3: MinIO/Ceph)
- Backend: Python 3.12 + FastAPI
- DB: PostgreSQL
- Queue: Redis + Celery
- OTP is required for request creation and for public request access
- Public JWT cookie is stored for 7 days on one device to reduce repeated OTP sends
- Request assignment: manual lawyer claim or automatic assignment after 24h if still unassigned
- Automatic assignment priority: primary lawyer topic, then additional topics, then lowest active load
- Additional lawyer topics are stored in a separate link table (many-to-many), not in `admin_users` array/json
- Active load means requests in non-terminal statuses (`is_terminal = false`)
- Topic-specific status flow + SLA per status transition
- Topic template split: required create fields (`topic_required_fields`) + per-topic request template (`topic_data_templates`) + per-request expansion (`request_data_requirements`)
- Topic-specific status flow rules are stored in `topic_status_transitions` and validated server-side on status update
- Each lawyer has default rate; each request stores fixed effective rate (can be overridden by ADMIN)
- Request fixed rate is immutable for billing history and does not follow future lawyer rate edits
- Lawyer rates are internal data and must not be exposed in public client API/UI
- Each lawyer has salary percent used for payroll calculation
- Payment fact is recorded on ADMIN status change to "Оплачено"; this timestamp is used in monthly gross/payroll
- A request can have multiple invoice-payment cycles and multiple payment events
- Status flow supports billing step type ("выставление счета") with invoice generation from template and delivery to client
- On status change, previous messages and attachments become immutable
- Manual claim is allowed only for unassigned requests; no lawyer-to-lawyer takeover
- Reassignment of already assigned request is allowed for ADMIN only
- Read state is tracked per request (not per message/file); opening request marks updates as seen
- UI shows one-time green dot indicators for changed entities (messages/files/status) until request is opened
- Full audit log for admin actions
- UniversalTable + UniversalRecordModal (meta-driven admin UI)
- Security controls for S3/PII: access audit trail, encryption, retention policy, and incident visibility

## Roles
- PUBLIC (via OTP + cookie)
- LAWYER (assigned + unassigned queue visibility)
- ADMIN (access to all platform data and configuration)
