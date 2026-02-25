from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password, verify_password
from app.models.admin_user import AdminUser


def normalize_admin_email(raw: str | None) -> str:
    return str(raw or "").strip().lower()


def get_active_admin_by_email(db: Session, email: str) -> AdminUser | None:
    normalized = normalize_admin_email(email)
    if not normalized:
        return None
    return (
        db.query(AdminUser)
        .filter(func.lower(AdminUser.email) == normalized, AdminUser.is_active.is_(True))
        .first()
    )


def get_admin_by_email_any_state(db: Session, email: str) -> AdminUser | None:
    normalized = normalize_admin_email(email)
    if not normalized:
        return None
    return db.query(AdminUser).filter(func.lower(AdminUser.email) == normalized).first()


def ensure_bootstrap_admin_for_login(db: Session, email: str, password: str) -> AdminUser | None:
    if not settings.ADMIN_BOOTSTRAP_ENABLED:
        return None

    normalized_email = normalize_admin_email(email)
    bootstrap_email = normalize_admin_email(settings.ADMIN_BOOTSTRAP_EMAIL)
    if normalized_email != bootstrap_email:
        return None
    if str(password or "") != str(settings.ADMIN_BOOTSTRAP_PASSWORD or ""):
        return None

    user = get_admin_by_email_any_state(db, bootstrap_email)
    if user is None:
        user = AdminUser(
            role="ADMIN",
            name=str(settings.ADMIN_BOOTSTRAP_NAME or "Администратор системы"),
            email=bootstrap_email,
            password_hash=hash_password(str(settings.ADMIN_BOOTSTRAP_PASSWORD or "")),
            is_active=True,
        )
        db.add(user)
    else:
        user.role = "ADMIN"
        user.email = bootstrap_email
        user.is_active = True
        if not str(user.name or "").strip():
            user.name = str(settings.ADMIN_BOOTSTRAP_NAME or "Администратор системы")
        if not verify_password(str(settings.ADMIN_BOOTSTRAP_PASSWORD or ""), str(user.password_hash or "")):
            user.password_hash = hash_password(str(settings.ADMIN_BOOTSTRAP_PASSWORD or ""))
        db.add(user)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return get_active_admin_by_email(db, bootstrap_email)
    db.refresh(user)
    return user
