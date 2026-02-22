from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.db.session import get_db
from app.core.deps import require_role
from app.schemas.universal import UniversalQuery
from app.schemas.admin import RequestAdminCreate, RequestAdminPatch
from app.models.request import Request
from app.services.universal_query import apply_universal_query

router = APIRouter()

@router.post("/query")
def query_requests(uq: UniversalQuery, db: Session = Depends(get_db), admin=Depends(require_role("ADMIN","LAWYER"))):
    q = apply_universal_query(db.query(Request), Request, uq)
    total = q.count()
    rows = q.offset(uq.page.offset).limit(uq.page.limit).all()
    return {
        "rows": [
            {
                "id": str(r.id),
                "track_number": r.track_number,
                "status_code": r.status_code,
                "client_name": r.client_name,
                "client_phone": r.client_phone,
                "topic_code": r.topic_code,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            }
            for r in rows
        ],
        "total": total,
    }


@router.post("", status_code=201)
def create_request(payload: RequestAdminCreate, db: Session = Depends(get_db), admin=Depends(require_role("ADMIN", "LAWYER"))):
    track = payload.track_number or f"TRK-{uuid4().hex[:10].upper()}"
    row = Request(
        track_number=track,
        client_name=payload.client_name,
        client_phone=payload.client_phone,
        topic_code=payload.topic_code,
        status_code=payload.status_code,
        description=payload.description,
        extra_fields=payload.extra_fields,
        assigned_lawyer_id=payload.assigned_lawyer_id,
        total_attachments_bytes=payload.total_attachments_bytes,
    )
    try:
        db.add(row)
        db.commit()
        db.refresh(row)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Заявка с таким номером уже существует")
    return {"id": str(row.id), "track_number": row.track_number}


@router.patch("/{request_id}")
def update_request(
    request_id: str,
    payload: RequestAdminPatch,
    db: Session = Depends(get_db),
    admin=Depends(require_role("ADMIN", "LAWYER")),
):
    row = db.query(Request).filter(Request.id == request_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    try:
        db.add(row)
        db.commit()
        db.refresh(row)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Заявка с таким номером уже существует")
    return {"status": "обновлено", "id": str(row.id), "track_number": row.track_number}


@router.delete("/{request_id}")
def delete_request(request_id: str, db: Session = Depends(get_db), admin=Depends(require_role("ADMIN", "LAWYER"))):
    row = db.query(Request).filter(Request.id == request_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    db.delete(row)
    db.commit()
    return {"status": "удалено"}

@router.get("/{request_id}")
def get_request(request_id: str, db: Session = Depends(get_db), admin=Depends(require_role("ADMIN","LAWYER"))):
    req = db.query(Request).filter(Request.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    return {
        "id": str(req.id),
        "track_number": req.track_number,
        "client_name": req.client_name,
        "client_phone": req.client_phone,
        "topic_code": req.topic_code,
        "status_code": req.status_code,
        "description": req.description,
        "extra_fields": req.extra_fields,
        "assigned_lawyer_id": req.assigned_lawyer_id,
        "total_attachments_bytes": req.total_attachments_bytes,
        "created_at": req.created_at.isoformat() if req.created_at else None,
        "updated_at": req.updated_at.isoformat() if req.updated_at else None,
    }
