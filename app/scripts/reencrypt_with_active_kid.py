from __future__ import annotations

import argparse
from datetime import datetime, timezone

from sqlalchemy import text

from app.db.session import SessionLocal
from app.models.admin_user import AdminUser
from app.models.invoice import Invoice
from app.services.chat_crypto import active_chat_kid, decrypt_message_body, encrypt_message_body, extract_message_kid, is_encrypted_message
from app.services.invoice_crypto import active_requisites_kid, decrypt_requisites, encrypt_requisites, extract_requisites_kid


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def reencrypt_with_active_kid(*, dry_run: bool = True) -> dict[str, int]:
    db = SessionLocal()
    counts = {
        "invoices_total": 0,
        "invoices_reencrypted": 0,
        "admin_totp_total": 0,
        "admin_totp_reencrypted": 0,
        "messages_total": 0,
        "messages_reencrypted": 0,
        "errors": 0,
    }
    current_data_kid = active_requisites_kid()
    current_chat_kid = active_chat_kid()

    try:
        invoice_rows = db.query(Invoice).all()
        counts["invoices_total"] = len(invoice_rows)
        for row in invoice_rows:
            token = str(row.payer_details_encrypted or "").strip()
            if not token:
                continue
            if extract_requisites_kid(token) == current_data_kid:
                continue
            try:
                payload = decrypt_requisites(token)
                row.payer_details_encrypted = encrypt_requisites(payload)
                row.responsible = row.responsible or "Администратор системы"
                counts["invoices_reencrypted"] += 1
            except Exception:
                counts["errors"] += 1

        admin_rows = db.query(AdminUser).all()
        counts["admin_totp_total"] = len(admin_rows)
        for row in admin_rows:
            token = str(row.totp_secret_encrypted or "").strip()
            if not token:
                continue
            if extract_requisites_kid(token) == current_data_kid:
                continue
            try:
                payload = decrypt_requisites(token)
                row.totp_secret_encrypted = encrypt_requisites(payload)
                row.responsible = row.responsible or "Администратор системы"
                counts["admin_totp_reencrypted"] += 1
            except Exception:
                counts["errors"] += 1

        message_rows = db.execute(text("SELECT id, body FROM messages")).all()
        counts["messages_total"] = len(message_rows)
        for message_id, body in message_rows:
            raw_body = str(body or "")
            if not raw_body:
                continue
            if extract_message_kid(raw_body) == current_chat_kid:
                continue
            try:
                plaintext = decrypt_message_body(raw_body)
                updated = encrypt_message_body(plaintext)
                if updated == raw_body:
                    continue
                db.execute(
                    text("UPDATE messages SET body = :body, updated_at = :updated_at WHERE id = :id"),
                    {"id": message_id, "body": updated, "updated_at": _now_utc()},
                )
                counts["messages_reencrypted"] += 1
            except Exception:
                counts["errors"] += 1

        if dry_run:
            db.rollback()
        else:
            db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description="Re-encrypt sensitive fields using active KID keys")
    parser.add_argument("--apply", action="store_true", help="Apply changes (default is dry-run)")
    args = parser.parse_args()

    result = reencrypt_with_active_kid(dry_run=not args.apply)
    mode = "APPLY" if args.apply else "DRY_RUN"
    print(f"mode={mode}")
    for key in sorted(result.keys()):
        print(f"{key}={result[key]}")


if __name__ == "__main__":
    main()
