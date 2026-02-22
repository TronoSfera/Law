from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.core.deps import require_role
from app.db.session import get_db
from app.models.request import Request

router = APIRouter()

@router.get("/overview")
def overview(db: Session = Depends(get_db), admin=Depends(require_role("ADMIN","LAWYER"))):
    by_status_rows = db.query(Request.status_code, func.count(Request.id)).group_by(Request.status_code).all()
    by_status = {status: count for status, count in by_status_rows}
    return {
        "new": by_status.get("NEW", 0),
        "by_status": by_status,
        "frt_avg_minutes": None,
        "sla_overdue": 0,
        "avg_time_in_status_hours": {},
    }
