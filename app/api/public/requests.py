from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from uuid import uuid4
from app.db.session import get_db
from app.schemas.public import PublicRequestCreate, PublicRequestCreated
from app.models.request import Request

router = APIRouter()

@router.post("", response_model=PublicRequestCreated, status_code=201)
def create_request(payload: PublicRequestCreate, db: Session = Depends(get_db)):
    track = f"TRK-{uuid4().hex[:10].upper()}"
    r = Request(track_number=track, client_name=payload.client_name, client_phone=payload.client_phone,
                topic_code=payload.topic_code, description=payload.description, extra_fields=payload.extra_fields)
    db.add(r); db.commit(); db.refresh(r)
    return PublicRequestCreated(request_id=r.id, track_number=r.track_number, otp_required=True)
