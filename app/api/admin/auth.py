from datetime import timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_admin
from app.core.security import create_jwt, verify_password
from app.db.session import get_db
from app.models.admin_user import AdminUser
from app.schemas.admin import (
    AdminLogin,
    AdminToken,
    AdminTotpEnableIn,
    AdminTotpEnableOut,
    AdminTotpSetupIn,
    AdminTotpSetupOut,
    AdminTotpStatusOut,
    AdminTotpVerifyIn,
)
from app.services.admin_bootstrap import (
    ensure_bootstrap_admin_for_login,
    get_active_admin_by_email,
    normalize_admin_email,
)
from app.services.totp_service import (
    admin_auth_mode,
    admin_totp_required,
    build_otpauth_uri,
    decrypt_totp_secret,
    encrypt_totp_secret,
    generate_backup_codes,
    generate_totp_secret,
    mark_totp_used_timestamp,
    totp_issuer,
    verify_and_consume_backup_code,
    verify_totp_code,
)

router = APIRouter()


def _require_user_or_404(db: Session, user_id: str) -> AdminUser:
    uid_text = str(user_id or "").strip()
    if not uid_text:
        raise HTTPException(status_code=401, detail="Некорректный токен")
    try:
        uid_value = UUID(uid_text)
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Некорректный токен") from exc
    row = db.query(AdminUser).filter(AdminUser.id == uid_value).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return row


def _verify_totp_or_401(*, user: AdminUser, totp_code: str | None, backup_code: str | None) -> list[str]:
    if not bool(user.totp_enabled):
        raise HTTPException(status_code=403, detail="Для учетной записи не настроен TOTP")

    secret = decrypt_totp_secret(user.totp_secret_encrypted)
    if totp_code and verify_totp_code(secret, totp_code, window=1):
        return list(user.totp_backup_codes_hashes or [])

    if backup_code:
        ok, remaining = verify_and_consume_backup_code(backup_code, user.totp_backup_codes_hashes)
        if ok:
            return remaining

    raise HTTPException(status_code=401, detail="Неверный TOTP-код или резервный код")


@router.post("/login", response_model=AdminToken)
def login(payload: AdminLogin, db: Session = Depends(get_db)):
    email = normalize_admin_email(payload.email)
    user = ensure_bootstrap_admin_for_login(db, email, payload.password)
    if user is None:
        user = get_active_admin_by_email(db, email)
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")

    if admin_totp_required(user_totp_enabled=bool(user.totp_enabled)):
        if not payload.totp_code and not payload.backup_code:
            raise HTTPException(status_code=401, detail="Требуется TOTP-код или резервный код")
        remaining = _verify_totp_or_401(user=user, totp_code=payload.totp_code, backup_code=payload.backup_code)
        user.totp_backup_codes_hashes = remaining
        user.totp_last_used_at = mark_totp_used_timestamp()
        user.responsible = user.email
        db.add(user)
        db.commit()

    token = create_jwt(
        {"sub": str(user.id), "email": user.email, "role": user.role},
        settings.ADMIN_JWT_SECRET,
        timedelta(minutes=settings.ADMIN_JWT_TTL_MINUTES),
    )
    return AdminToken(access_token=token)


@router.get("/totp/status", response_model=AdminTotpStatusOut)
def totp_status(admin: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    user = _require_user_or_404(db, str(admin.get("sub") or ""))
    return AdminTotpStatusOut(
        mode=admin_auth_mode(),
        enabled=bool(user.totp_enabled),
        required=admin_totp_required(user_totp_enabled=bool(user.totp_enabled)),
        has_backup_codes=bool(user.totp_backup_codes_hashes),
    )


@router.post("/totp/setup", response_model=AdminTotpSetupOut)
def totp_setup(
    payload: AdminTotpSetupIn,
    admin: dict = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    user = _require_user_or_404(db, str(admin.get("sub") or ""))
    issuer = str(payload.issuer or "").strip() or totp_issuer("Law Portal")
    account_name = str(user.email or "").strip().lower()
    secret = generate_totp_secret()
    uri = build_otpauth_uri(secret=secret, account_name=account_name, issuer=issuer)
    return AdminTotpSetupOut(secret=secret, otpauth_uri=uri, issuer=issuer, account_name=account_name)


@router.post("/totp/enable", response_model=AdminTotpEnableOut)
def totp_enable(
    payload: AdminTotpEnableIn,
    admin: dict = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    user = _require_user_or_404(db, str(admin.get("sub") or ""))
    if not verify_totp_code(payload.secret, payload.code, window=1):
        raise HTTPException(status_code=400, detail="Неверный TOTP-код")
    backup_plain, backup_hashes = generate_backup_codes()
    user.totp_secret_encrypted = encrypt_totp_secret(payload.secret)
    user.totp_backup_codes_hashes = backup_hashes
    user.totp_enabled = True
    user.responsible = user.email
    db.add(user)
    db.commit()
    return AdminTotpEnableOut(enabled=True, backup_codes=backup_plain)


@router.post("/totp/backup/regenerate", response_model=AdminTotpEnableOut)
def totp_regenerate_backup_codes(
    payload: AdminTotpVerifyIn,
    admin: dict = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    user = _require_user_or_404(db, str(admin.get("sub") or ""))
    if not bool(user.totp_enabled):
        raise HTTPException(status_code=400, detail="TOTP не настроен")
    _ = _verify_totp_or_401(user=user, totp_code=payload.code, backup_code=payload.backup_code)
    backup_plain, backup_hashes = generate_backup_codes()
    user.totp_backup_codes_hashes = backup_hashes
    user.totp_last_used_at = mark_totp_used_timestamp()
    user.responsible = user.email
    db.add(user)
    db.commit()
    return AdminTotpEnableOut(enabled=True, backup_codes=backup_plain)


@router.post("/totp/disable")
def totp_disable(
    payload: AdminTotpVerifyIn,
    admin: dict = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    user = _require_user_or_404(db, str(admin.get("sub") or ""))
    if bool(user.totp_enabled):
        _ = _verify_totp_or_401(user=user, totp_code=payload.code, backup_code=payload.backup_code)
    user.totp_enabled = False
    user.totp_secret_encrypted = None
    user.totp_backup_codes_hashes = None
    user.totp_last_used_at = None
    user.responsible = user.email
    db.add(user)
    db.commit()
    return {"status": "disabled"}
