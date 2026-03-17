from __future__ import annotations

import argparse
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import text

from app.db.session import SessionLocal
from app.models.admin_user import AdminUser
from app.models.invoice import Invoice
from app.models.request import Request
from app.services.chat_crypto import decrypt_message_body, encrypt_message_body
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

        message_rows = db.execute(text("SELECT id, request_id, body FROM messages")).all()
        counts["messages_total"] = len(message_rows)
        for message_id, request_id, body in message_rows:
            raw_body = str(body or "")
            if not raw_body:
                continue
            if raw_body.startswith("chatenc:v3:"):
                continue
            try:
                request_key = None
                if request_id:
                    try:
                        request_key = UUID(str(request_id))
                    except (TypeError, ValueError):
                        request_key = None
                request_row = db.get(Request, request_key) if request_key else None
                if request_row is None:
                    plaintext = decrypt_message_body(raw_body)
                    updated = encrypt_message_body(plaintext)
                else:
                    from app.services.chat_crypto import decrypt_message_body_for_request, encrypt_message_body_for_request

                    plaintext = (
                        decrypt_message_body_for_request(raw_body, request_extra_fields=request_row.extra_fields)
                        if raw_body.startswith("chatenc:v3:")
                        else decrypt_message_body(raw_body)
                    )
                    updated, next_extra_fields, changed = encrypt_message_body_for_request(
                        plaintext,
                        request_extra_fields=request_row.extra_fields,
                    )
                    if changed:
                        request_row.extra_fields = next_extra_fields
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
