from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.core.deps import require_role
from app.schemas.universal import UniversalQuery
from app.schemas.admin import QuoteUpsert
from app.models.quote import Quote
from app.services.universal_query import apply_universal_query

router = APIRouter()

@router.post("/query")
def query_quotes(uq: UniversalQuery, db: Session = Depends(get_db), admin=Depends(require_role("ADMIN"))):
    q = apply_universal_query(db.query(Quote), Quote, uq)
    total = q.count()
    rows = q.offset(uq.page.offset).limit(uq.page.limit).all()
    return {
        "rows": [
            {
                "id": str(r.id),
                "author": r.author,
                "text": r.text,
                "source": r.source,
                "is_active": r.is_active,
                "sort_order": r.sort_order,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
        "total": total,
    }

@router.post("", status_code=201)
def create_quote(payload: QuoteUpsert, db: Session = Depends(get_db), admin=Depends(require_role("ADMIN"))):
    responsible = str(admin.get("email") or "").strip() or "Администратор системы"
    q = Quote(**payload.model_dump(), responsible=responsible)
    db.add(q); db.commit(); db.refresh(q)
    return {"id": str(q.id)}

@router.patch("/{id}")
def update_quote(id: str, payload: QuoteUpsert, db: Session = Depends(get_db), admin=Depends(require_role("ADMIN"))):
    q = db.query(Quote).filter(Quote.id == id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Цитата не найдена")
    for k, v in payload.model_dump().items():
        setattr(q, k, v)
    db.add(q); db.commit()
    return {"status": "обновлено"}

@router.delete("/{id}")
def delete_quote(id: str, db: Session = Depends(get_db), admin=Depends(require_role("ADMIN"))):
    q = db.query(Quote).filter(Quote.id == id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Цитата не найдена")
    db.delete(q); db.commit()
    return {"status": "удалено"}
