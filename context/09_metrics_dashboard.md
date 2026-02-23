# Metrics & Dashboard Context

## Admin Dashboard
- Highlight new requests
- Count by status
- SLA overdue
- Avg first response time
- Avg time in status
- SLA by topic + status transition
- Overdue by transition (`topic:status->*`)
- Per-lawyer workload (active and total assigned requests)
- Per-lawyer financial block:
- active requests amount (sum of fixed request amounts for active requests)
- monthly paid gross (sum of paid requests in current month)
- monthly salary (sum of paid request amount * lawyer percent)

## Lawyer Dashboard
- Assigned requests
- Unassigned requests queue
- Active requests by statuses
- New/unseen messages
- New/unseen files
- Unseen status changes
- Unseen state is request-level (single marker per request)
- Opening request resets unseen marker
- One-time green dot can be shown for changed entity type (message/file/status)

## Data Sources
- requests
- status_history
- messages
- attachments
- sla config (`topic_status_transitions`, field `sla_hours`)
- notification/read markers
- lawyer financial profile (`default_rate`, `salary_percent`)
- fixed financial fields in request (`effective_rate`, `invoice_amount`, `paid_at`, `paid_by_admin_id`)

## Payment Event Rule
- Fact of payment is recognized only on ADMIN status change to "Оплачено"
- This event timestamp is used as payment date for monthly gross/salary
- A request may produce multiple paid events; monthly aggregates sum all paid events in month
- Salary formula: `invoice_amount * salary_percent`

## Implemented Marker Fields (`P13`)
- request-level booleans: `client_has_unread_updates`, `lawyer_has_unread_updates`
- request-level event types: `client_unread_event_type`, `lawyer_unread_event_type`
- `overview` now exposes aggregate counters:
  - `unread_for_clients`
  - `unread_for_lawyers`

## Implemented SLA Snapshot (`P19`)
- `overview` includes:
- `sla_overdue` (total)
- `overdue_by_status`
- `overdue_by_transition`
- `frt_avg_minutes`
- `avg_time_in_status_hours`

## Implemented Notifications (`P20`)
- Notification storage: table `notifications`
- Channels:
- in-site notifications for `CLIENT` and `ADMIN_USER`
- Telegram (if bot configured; otherwise mock logging)
- Events:
- `MESSAGE`, `ATTACHMENT`, `STATUS`, `SLA_OVERDUE`
- Read behavior:
- opening request marks related notifications as read for viewer side

## Implemented Dashboard Role Split (`P21`)
- `/api/admin/metrics/overview` is role-aware:
- `ADMIN` sees global metrics and full per-lawyer block
- `LAWYER` sees scoped metrics for own assigned requests + unassigned queue
- Added counters:
- `assigned_total`
- `active_assigned_total`
- `unassigned_total`
- `my_unread_updates`
- `my_unread_by_event`
- Per-lawyer financial metrics:
- `active_amount` (sum `requests.invoice_amount` for active assigned requests)
- `monthly_paid_events` (count of `status_history.to_status == PAID/ОПЛАЧЕНО` in current month)
- `monthly_paid_gross` (sum invoice amount per paid event in current month)
- `monthly_salary` (`monthly_paid_gross * salary_percent / 100`)
- Financial source fields added:
- `admin_users.default_rate`
- `admin_users.salary_percent`
- `requests.effective_rate`
- `requests.invoice_amount`
- `requests.paid_at`
- `requests.paid_by_admin_id`
