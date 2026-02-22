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
- If request unclaimed for 24h
- Match by topic
- Assign to lawyer with lowest active load

## SLA Metrics
- First response time
- Time in status
- Overdue detection
- Telegram notification to group chat