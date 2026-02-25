from fastapi import APIRouter, HTTPException, Depends
from datetime import timedelta
from sqlalchemy.orm import Session
from app.schemas.admin import AdminLogin, AdminToken
from app.core.security import create_jwt, verify_password
from app.core.config import settings
from app.db.session import get_db
from app.services.admin_bootstrap import ensure_bootstrap_admin_for_login, get_active_admin_by_email, normalize_admin_email

router = APIRouter()

@router.post("/login", response_model=AdminToken)
def login(payload: AdminLogin, db: Session = Depends(get_db)):
    email = normalize_admin_email(payload.email)
    user = ensure_bootstrap_admin_for_login(db, email, payload.password)
    if user is None:
        user = get_active_admin_by_email(db, email)
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")
    token = create_jwt({"sub": str(user.id), "email": user.email, "role": user.role},
                       settings.ADMIN_JWT_SECRET, timedelta(minutes=settings.ADMIN_JWT_TTL_MINUTES))
    return AdminToken(access_token=token)
