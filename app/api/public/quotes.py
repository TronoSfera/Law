from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.db.session import get_db
from app.models.quote import Quote

router = APIRouter()

@router.get("")
def get_quotes(limit: int = Query(20, ge=1, le=200), order: str = Query("random"), db: Session = Depends(get_db)):
    q = db.query(Quote).filter(Quote.is_active == True)
    if order == "sort_order":
        q = q.order_by(Quote.sort_order.asc(), Quote.created_at.desc())
    else:
        q = q.order_by(func.random())
    rows = q.limit(limit).all()
    return [{"id": str(r.id), "text": r.text, "author": r.author, "source": r.source} for r in rows]
