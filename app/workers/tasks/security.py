from __future__ import annotations

from datetime import datetime, timezone

from app.db.session import SessionLocal
from app.models.otp_session import OtpSession
from app.workers.celery_app import celery_app


@celery_app.task(name="app.workers.tasks.security.cleanup_expired_otps")
def cleanup_expired_otps():
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    try:
        total = db.query(OtpSession).count()
        deleted = db.query(OtpSession).filter(OtpSession.expires_at <= now).delete(synchronize_session=False)
        db.commit()
        return {"checked": int(total), "deleted": int(deleted)}
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
