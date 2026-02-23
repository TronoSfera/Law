from __future__ import annotations

from sqlalchemy import func

from app.db.session import SessionLocal
from app.models.attachment import Attachment
from app.models.request import Request
from app.workers.celery_app import celery_app


@celery_app.task(name="app.workers.tasks.uploads.cleanup_stale_uploads")
def cleanup_stale_uploads():
    db = SessionLocal()
    try:
        requests = db.query(Request).all()
        existing_request_ids = {str(req.id) for req in requests}

        deleted_orphan = 0
        deleted_invalid = 0
        attachment_rows = db.query(Attachment.id, Attachment.request_id, Attachment.size_bytes, Attachment.s3_key).all()
        for att_id, request_id, size_bytes, s3_key in attachment_rows:
            request_id_str = str(request_id)
            if request_id_str not in existing_request_ids:
                db.query(Attachment).filter(Attachment.id == att_id).delete(synchronize_session=False)
                deleted_orphan += 1
                continue
            if int(size_bytes or 0) <= 0 or not str(s3_key or "").strip():
                db.query(Attachment).filter(Attachment.id == att_id).delete(synchronize_session=False)
                deleted_invalid += 1

        if deleted_orphan or deleted_invalid:
            db.flush()

        totals_rows = db.query(Attachment.request_id, func.coalesce(func.sum(Attachment.size_bytes), 0)).group_by(Attachment.request_id).all()
        totals_map = {str(request_id): int(total or 0) for request_id, total in totals_rows}

        fixed_requests = 0
        for req in requests:
            request_total = totals_map.get(str(req.id), 0)
            if int(req.total_attachments_bytes or 0) != request_total:
                req.total_attachments_bytes = request_total
                req.responsible = "Администратор системы"
                db.add(req)
                fixed_requests += 1

        db.commit()
        return {
            "deleted_orphan_attachments": int(deleted_orphan),
            "deleted_invalid_attachments": int(deleted_invalid),
            "fixed_requests": int(fixed_requests),
        }
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
