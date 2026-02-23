# Admin Panel Service Context

## Roles
- ADMIN: full CRUD + all dictionaries + SLA + users + quotes
- LAWYER:
  - see assigned requests
  - see unassigned queue
  - can manually claim unassigned request ("Take in work")

## Core Features
- Universal table with filters (`= != > < >= <= ~`)
- Universal record modal (meta-driven)
- Manual editing of available entities
- AuditLog for any CREATE/UPDATE/DELETE and system assignment events
- Atomic claim action to prevent race conditions between lawyers
- User profile avatar (`avatar_url`) with fallback initials in UI
- Lawyer profile includes default lawyer rate (editable by ADMIN)
- Lawyer profile includes salary percent (editable by ADMIN)

## Assignment Logic
- Request can be claimed manually by lawyer
- Manual claim is allowed only when `assigned_lawyer_id` is null
- Lawyer takeover is forbidden
- Manual reassignment of assigned request is ADMIN-only action
- If not claimed within 24h and still unassigned, auto-assign is applied
- Lawyer profile includes:
  - one primary topic
  - additional topics
- Additional topics are stored via separate link table (`admin_user_topics`)
- Assignment priority: primary topic matches first, then additional topics, then lowest active load
- Active load = count of assigned requests with non-terminal status (`is_terminal=false`)

## Status Logic
- Status flow is configured per topic
- Base model is linear, but with allowed flow variations (Jira-like)
- On any status change:
  - all previous messages immutable
  - all previous attachments immutable
  - add `status_history` record

### Implemented Flow Configuration (`P14`)
- New dictionary table: `topic_status_transitions`
- Transition rule fields:
  - `topic_code`
  - `from_status`
  - `to_status`
  - `sla_hours` (SLA для перехода, в часах)
  - `enabled`
  - `sort_order`
- ADMIN manages flow rules in "Справочники -> Переходы статусов"
- Server-side validation:
  - if topic has configured enabled rules, transition is allowed only when rule exists
  - if topic has no rules yet, backward-compatible free transition is kept

### Planned Billing Status Extension
- Add status type: `INVOICE` / "Выставление счета"
- For this status type:
- invoice is generated from admin-managed template
- invoice is attached/sent to client through platform notification channel
- billing status can be included in topic-specific flow as regular transition node

### Implemented SLA Transition Config (`P18`)
- SLA configuration is stored in `topic_status_transitions.sla_hours`
- `sla_hours` is optional but if set must be integer > 0
- CRUD validation prevents:
- unknown `topic_code` / status codes
- `from_status == to_status`
- non-positive `sla_hours`
- Admin UI for "Переходы статусов" includes `SLA (часы)` in table, filters, and edit/create modal

### Implemented Status Immutability (`P15`)
- On request status change:
  - all existing `messages` for request are marked `immutable=true`
  - all existing `attachments` for request are marked `immutable=true`
  - new row is written into `status_history` (`from_status`, `to_status`, `changed_by_admin_id`)
- Immutable records protection:
  - `PATCH /api/admin/crud/messages/{id}` and `DELETE /api/admin/crud/messages/{id}` are blocked for immutable rows
  - `PATCH /api/admin/crud/attachments/{id}` and `DELETE /api/admin/crud/attachments/{id}` are blocked for immutable rows
  - upload complete rejects binding file to immutable message (`message_id`)

## Templates
- ADMIN configures required client fields for request creation (by topic)
- For in-progress work, lawyer can use topic template for requested docs/data
- Lawyer can extend that template for a specific request only
- No template versioning requirement

### Implemented Template Split (`P16`)
- New dictionaries:
- `topic_required_fields`: required request creation fields per topic (`topic_code`, `field_key`, `required`, `enabled`, `sort_order`)
- `topic_data_templates`: topic-level data/doc request template (`topic_code`, `key`, `label`, `description`, `required`, `enabled`, `sort_order`)
- Request-level table:
- `request_data_requirements`: per-request expanded template items, including lawyer-added custom items
- Validation:
- create request (`/api/public/requests`, `/api/admin/requests`, `/api/admin/crud/requests`) validates `extra_fields` against active required keys from `topic_required_fields`
- Request template API:
- `GET /api/admin/requests/{request_id}/data-template`
- `POST /api/admin/requests/{request_id}/data-template/sync`
- `POST /api/admin/requests/{request_id}/data-template/items`
- `PATCH /api/admin/requests/{request_id}/data-template/items/{item_id}`
- `DELETE /api/admin/requests/{request_id}/data-template/items/{item_id}`
- RBAC:
- ADMIN has full access
- LAWYER can work with template items only for assigned request

## Rates & Billing Rules (planned)
- ADMIN sets default lawyer rate in user profile
- ADMIN sets lawyer salary percent in user profile
- ADMIN can override rate for a specific request
- Effective request rate is stored in request and frozen for financial traceability
- Request rate is not returned in public client endpoints and not shown in public UI
- Effective request amount is stored in request and frozen for financial traceability
- Fact of payment is recorded when ADMIN changes request status to "Оплачено" (business paid event)
- Payment event stores who changed status and when (for salary/month reports)
- A request may contain more than one payment event (multiple invoice-payment cycles)

### Implemented Baseline For Dashboard (`P21`)
- Financial profile fields are persisted:
- `admin_users.default_rate`
- `admin_users.salary_percent`
- Request financial fields are persisted:
- `requests.effective_rate`
- `requests.invoice_amount`
- `requests.paid_at`
- `requests.paid_by_admin_id`
- Admin UI record forms/tables include these fields.
- Public API still does not expose internal financial fields.

## Read / Unread UX
- Unread state is tracked per request for both LAWYER and PUBLIC user
- New message/file/status change marks request as updated
- Opening request marks updates as read
- UI can show one-time green indicator for what changed (message/file/status)

## Implemented Marker Model (`P13`)
- `requests.client_has_unread_updates` / `requests.client_unread_event_type`
- `requests.lawyer_has_unread_updates` / `requests.lawyer_unread_event_type`
- Event types: `MESSAGE`, `ATTACHMENT`, `STATUS`
- LAWYER opening request (`GET /api/admin/crud/requests/{id}` or `GET /api/admin/requests/{id}`) clears lawyer marker
- Client opening request (`GET /api/public/requests/{track_number}`) clears client marker

## Admin Dashboard Financial Metrics (planned)
- For each lawyer show:
- active requests count (current load)
- sum of active requests amounts (if amount exists)
- monthly gross of paid requests
- monthly gross of paid events
- monthly salary amount
- Salary calculation base:
- paid event = ADMIN changes request status to "Оплачено"
- salary = paid request amount * lawyer salary percent
