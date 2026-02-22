from celery import Celery
from app.core.config import settings

celery_app = Celery("legal_case_tracker", broker=settings.REDIS_URL, backend=settings.REDIS_URL)

celery_app.conf.beat_schedule = {
    "sla_check": {"task": "app.workers.tasks.sla.sla_check", "schedule": 300.0},
    "auto_assign_unclaimed": {"task": "app.workers.tasks.assign.auto_assign_unclaimed", "schedule": 3600.0},
    "cleanup_expired_otps": {"task": "app.workers.tasks.security.cleanup_expired_otps", "schedule": 3600.0},
    "cleanup_stale_uploads": {"task": "app.workers.tasks.uploads.cleanup_stale_uploads", "schedule": 86400.0},
}
celery_app.conf.timezone = "Europe/Moscow"
