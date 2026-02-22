from fastapi import Depends, Cookie, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.config import settings
from app.core.security import decode_jwt

bearer = HTTPBearer(auto_error=False)

def get_current_admin(creds: HTTPAuthorizationCredentials = Depends(bearer)) -> dict:
    if not creds:
        raise HTTPException(status_code=401, detail="Отсутствует токен авторизации")
    try:
        return decode_jwt(creds.credentials, settings.ADMIN_JWT_SECRET)
    except Exception:
        raise HTTPException(status_code=401, detail="Некорректный токен")

def require_role(*roles: str):
    def _inner(admin: dict = Depends(get_current_admin)) -> dict:
        if admin.get("role") not in roles:
            raise HTTPException(status_code=403, detail="Недостаточно прав")
        return admin
    return _inner

def get_public_session(public_jwt: str | None = Cookie(default=None, alias=settings.PUBLIC_COOKIE_NAME)) -> dict:
    if not public_jwt:
        raise HTTPException(status_code=401, detail="Отсутствует публичная сессия")
    try:
        return decode_jwt(public_jwt, settings.PUBLIC_JWT_SECRET)
    except Exception:
        raise HTTPException(status_code=401, detail="Некорректная публичная сессия")
