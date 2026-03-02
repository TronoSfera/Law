import base64
import hashlib
import hmac
import os
import unittest
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import create_engine, delete, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("S3_ENDPOINT", "http://localhost:9000")
os.environ.setdefault("S3_ACCESS_KEY", "test")
os.environ.setdefault("S3_SECRET_KEY", "test")
os.environ.setdefault("S3_BUCKET", "test")

from app.core.config import settings
from app.models.admin_user import AdminUser
from app.models.invoice import Invoice
from app.models.message import Message
from app.models.request import Request
from app.scripts import reencrypt_with_active_kid as reencrypt_script
from app.services.chat_crypto import extract_message_kid
from app.services.invoice_crypto import extract_requisites_kid


def _xor_bytes(a: bytes, b: bytes) -> bytes:
    return bytes(x ^ y for x, y in zip(a, b))


def _legacy_invoice_token(secret: str) -> str:
    raw = b'{"secret":"LEGACY"}'
    key = hashlib.sha256(secret.encode("utf-8")).digest()
    nonce = bytes.fromhex("00112233445566778899aabbccddeeff")
    stream = hashlib.pbkdf2_hmac("sha256", key, nonce, 120_000, dklen=len(raw))
    cipher = _xor_bytes(raw, stream)
    tag = hmac.new(key, b"v1" + nonce + cipher, hashlib.sha256).digest()
    token = b"v1" + nonce + tag + cipher
    return base64.urlsafe_b64encode(token).decode("ascii")


def _legacy_chat_token(plaintext: str, secret: str) -> str:
    raw = plaintext.encode("utf-8")
    key = hashlib.sha256(secret.encode("utf-8")).digest()
    nonce = bytes.fromhex("ffeeddccbbaa99887766554433221100")
    stream = hashlib.pbkdf2_hmac("sha256", key, nonce, 120_000, dklen=len(raw))
    cipher = _xor_bytes(raw, stream)
    tag = hmac.new(key, b"v1" + nonce + cipher, hashlib.sha256).digest()
    token = b"v1" + nonce + tag + cipher
    return "chatenc:v1:" + base64.urlsafe_b64encode(token).decode("ascii")


class ReencryptWithKidTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite+pysqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.SessionLocal = sessionmaker(bind=cls.engine, autocommit=False, autoflush=False)
        AdminUser.__table__.create(bind=cls.engine)
        Request.__table__.create(bind=cls.engine)
        Message.__table__.create(bind=cls.engine)
        Invoice.__table__.create(bind=cls.engine)

        cls._old_session_local = reencrypt_script.SessionLocal
        reencrypt_script.SessionLocal = cls.SessionLocal

    @classmethod
    def tearDownClass(cls):
        reencrypt_script.SessionLocal = cls._old_session_local
        Invoice.__table__.drop(bind=cls.engine)
        Message.__table__.drop(bind=cls.engine)
        Request.__table__.drop(bind=cls.engine)
        AdminUser.__table__.drop(bind=cls.engine)
        cls.engine.dispose()

    def setUp(self):
        self._backup = {
            "DATA_ENCRYPTION_SECRET": settings.DATA_ENCRYPTION_SECRET,
            "DATA_ENCRYPTION_ACTIVE_KID": settings.DATA_ENCRYPTION_ACTIVE_KID,
            "DATA_ENCRYPTION_KEYS": settings.DATA_ENCRYPTION_KEYS,
            "CHAT_ENCRYPTION_SECRET": settings.CHAT_ENCRYPTION_SECRET,
            "CHAT_ENCRYPTION_ACTIVE_KID": settings.CHAT_ENCRYPTION_ACTIVE_KID,
            "CHAT_ENCRYPTION_KEYS": settings.CHAT_ENCRYPTION_KEYS,
        }
        with self.SessionLocal() as db:
            db.execute(delete(Invoice))
            db.execute(delete(Message))
            db.execute(delete(Request))
            db.execute(delete(AdminUser))
            db.commit()

    def tearDown(self):
        for key, value in self._backup.items():
            setattr(settings, key, value)

    def test_reencrypt_script_moves_legacy_rows_to_active_kid(self):
        old_secret = "legacy-secret-aaaaaaaaaaaaaaaa"
        settings.DATA_ENCRYPTION_SECRET = ""
        settings.DATA_ENCRYPTION_ACTIVE_KID = "k2"
        settings.DATA_ENCRYPTION_KEYS = f"k1={old_secret},k2=new-data-secret-bbbbbbbbbbbbbbbb"
        settings.CHAT_ENCRYPTION_SECRET = ""
        settings.CHAT_ENCRYPTION_ACTIVE_KID = "k2"
        settings.CHAT_ENCRYPTION_KEYS = f"k1={old_secret},k2=new-chat-secret-cccccccccccccccc"

        with self.SessionLocal() as db:
            req = Request(
                track_number=f"TRK-RER-{uuid4().hex[:8].upper()}",
                client_name="Клиент",
                client_phone="+79990001122",
                topic_code="consulting",
                status_code="NEW",
                extra_fields={},
            )
            db.add(req)
            db.flush()

            db.add(
                Message(
                    request_id=req.id,
                    author_type="CLIENT",
                    author_name="Клиент",
                    body="placeholder",
                )
            )
            db.flush()
            db.execute(
                text("UPDATE messages SET body = :body WHERE id = (SELECT id FROM messages ORDER BY created_at DESC LIMIT 1)"),
                {"body": _legacy_chat_token("legacy body", old_secret)},
            )

            admin = AdminUser(
                role="ADMIN",
                name="Admin",
                email=f"admin-{uuid4().hex[:6]}@example.com",
                password_hash="hash",
                totp_enabled=True,
                totp_secret_encrypted=_legacy_invoice_token(old_secret),
                is_active=True,
            )
            db.add(admin)

            invoice = Invoice(
                request_id=req.id,
                client_id=None,
                invoice_number=f"INV-{uuid4().hex[:8].upper()}",
                status="WAITING_PAYMENT",
                amount=1000,
                currency="RUB",
                payer_display_name="Клиент",
                payer_details_encrypted=_legacy_invoice_token(old_secret),
                issued_by_admin_user_id=None,
                issued_by_role="ADMIN",
                issued_at=datetime.now(timezone.utc),
                responsible="seed",
            )
            db.add(invoice)
            db.commit()

        dry = reencrypt_script.reencrypt_with_active_kid(dry_run=True)
        self.assertGreaterEqual(int(dry.get("messages_reencrypted", 0)), 1)
        self.assertGreaterEqual(int(dry.get("invoices_reencrypted", 0)), 1)
        self.assertGreaterEqual(int(dry.get("admin_totp_reencrypted", 0)), 1)

        applied = reencrypt_script.reencrypt_with_active_kid(dry_run=False)
        self.assertGreaterEqual(int(applied.get("messages_reencrypted", 0)), 1)
        self.assertGreaterEqual(int(applied.get("invoices_reencrypted", 0)), 1)
        self.assertGreaterEqual(int(applied.get("admin_totp_reencrypted", 0)), 1)
        self.assertEqual(int(applied.get("errors", 0)), 0)

        with self.SessionLocal() as db:
            invoice_token = db.execute(text("SELECT payer_details_encrypted FROM invoices LIMIT 1")).scalar_one()
            admin_token = db.execute(text("SELECT totp_secret_encrypted FROM admin_users LIMIT 1")).scalar_one()
            message_token = db.execute(text("SELECT body FROM messages LIMIT 1")).scalar_one()

        self.assertEqual(extract_requisites_kid(str(invoice_token)), "k2")
        self.assertEqual(extract_requisites_kid(str(admin_token)), "k2")
        self.assertEqual(extract_message_kid(str(message_token)), "k2")


if __name__ == "__main__":
    unittest.main()
