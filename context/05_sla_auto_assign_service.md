# SLA & Auto Assign Service Context

## Celery Queues
- maintenance
- notifications
- uploads

## Periodic Tasks
- sla_check (every 5 min)
- auto_assign_unclaimed (every 60 min)
- cleanup_expired_otps (every 60 min)
- cleanup_stale_uploads (daily)

## Auto Assign Logic
- Apply to any request that is still unassigned for 24h
- Candidate selection order:
  1. lawyers with matching primary topic
  2. lawyers with matching additional topics
  3. among candidates -> lowest active load
- Additional topics source: link table `admin_user_topics`
- Active load definition: assigned requests in non-terminal statuses (`is_terminal=false`)
- Manual lawyer claim has priority if request already claimed before scheduler run
- Auto-assign never overrides already assigned request

## SLA Metrics
- First response time
- Time in status
- Overdue detection
- SLA is configured per topic and per status transition
- Telegram notification to group chat (if connected)
- In-site notifications for new updates/events

## Implemented SLA Config (`P18`)
- SLA config storage: `topic_status_transitions.sla_hours`
- Config is editable by ADMIN via universal CRUD / admin panel dictionary "Переходы статусов"
- Validation rules:
- `topic_code`, `from_status`, `to_status` must reference existing dictionaries
- `from_status` and `to_status` must differ
- `sla_hours` if provided must be integer > 0
- Applying transition-level SLA thresholds in `sla_check` remains in `P19`
- SLA should also apply to billing transitions (including "выставление счета" step) once billing status type is enabled

## Implemented SLA Check (`P19`)
- `sla_check` uses transition SLA config for active requests:
- source: `topic_status_transitions.sla_hours`
- matching: by `topic_code` + current `from_status` (outgoing transitions)
- when several outgoing transitions exist, minimal configured `sla_hours` is used as active threshold
- fallback: status defaults (`NEW`, `IN_PROGRESS`, etc.) when transition SLA is absent
- outputs:
- `overdue_total`
- `overdue_by_status`
- `overdue_by_transition` (format: `topic:status->*`)
- `frt_avg_minutes`
- `avg_time_in_status_hours`

## Implemented Notifications (`P20`)
- Internal notifications table: `notifications`
- Notification recipients:
- `CLIENT` by `track_number`
- `ADMIN_USER` by `admin_user_id` (admin/lawyer)
- Event sources integrated:
- public/client message (`MESSAGE`)
- public/client file upload (`ATTACHMENT`)
- admin/lawyer file upload (`ATTACHMENT`)
- admin/lawyer status change (`STATUS`)
- SLA overdue worker event (`SLA_OVERDUE`)
- Telegram delivery:
- if bot/chat configured -> send via Telegram Bot API
- if not configured -> safe mock output in console (`[TELEGRAM MOCK]`)
- SLA-overdue notifications are deduplicated per `(request, status, recipient)`.
