from fastapi import APIRouter, HTTPException, Depends
from datetime import timedelta
from sqlalchemy.orm import Session
from app.schemas.admin import AdminLogin, AdminToken
from app.core.security import create_jwt, verify_password
from app.core.config import settings
from app.db.session import get_db
from app.models.admin_user import AdminUser

router = APIRouter()

@router.post("/login", response_model=AdminToken)
def login(payload: AdminLogin, db: Session = Depends(get_db)):
    user = db.query(AdminUser).filter(AdminUser.email == payload.email, AdminUser.is_active == True).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")
    token = create_jwt({"sub": str(user.id), "email": user.email, "role": user.role},
                       settings.ADMIN_JWT_SECRET, timedelta(minutes=settings.ADMIN_JWT_TTL_MINUTES))
    return AdminToken(access_token=token)
