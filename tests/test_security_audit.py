import os
import unittest
from datetime import timedelta
from uuid import UUID
from unittest.mock import patch

from botocore.exceptions import ClientError
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("S3_ENDPOINT", "http://localhost:9000")
os.environ.setdefault("S3_ACCESS_KEY", "test")
os.environ.setdefault("S3_SECRET_KEY", "test")
os.environ.setdefault("S3_BUCKET", "test")

from app.core.config import settings
from app.core.security import create_jwt
from app.db.session import get_db
from app.main import app
from app.models.admin_user import AdminUser
from app.models.attachment import Attachment
from app.models.message import Message
from app.models.notification import Notification
from app.models.request import Request
from app.models.security_audit_log import SecurityAuditLog


class _FakeBody:
    def __init__(self, payload: bytes):
        self.payload = payload

    def iter_chunks(self, chunk_size=65536):
        for i in range(0, len(self.payload), chunk_size):
            yield self.payload[i : i + chunk_size]


class _FakeS3Storage:
    def __init__(self):
        self.objects = {}

    def get_object(self, key: str) -> dict:
        obj = self.objects.get(key)
        if obj is None:
            raise ClientError({"Error": {"Code": "404", "Message": "Not Found"}}, "GetObject")
        return {"Body": _FakeBody(obj["content"]), "ContentType": obj["mime"], "ContentLength": obj["size"]}


class SecurityAuditTests(unittest.TestCase):
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
        Notification.__table__.create(bind=cls.engine)
        Message.__table__.create(bind=cls.engine)
        Attachment.__table__.create(bind=cls.engine)
        SecurityAuditLog.__table__.create(bind=cls.engine)

    @classmethod
    def tearDownClass(cls):
        SecurityAuditLog.__table__.drop(bind=cls.engine)
        Attachment.__table__.drop(bind=cls.engine)
        Message.__table__.drop(bind=cls.engine)
        Notification.__table__.drop(bind=cls.engine)
        Request.__table__.drop(bind=cls.engine)
        AdminUser.__table__.drop(bind=cls.engine)
        cls.engine.dispose()

    def setUp(self):
        with self.SessionLocal() as db:
            db.execute(delete(SecurityAuditLog))
            db.execute(delete(Notification))
            db.execute(delete(Attachment))
            db.execute(delete(Message))
            db.execute(delete(Request))
            db.execute(delete(AdminUser))
            db.commit()

        def override_get_db():
            db = self.SessionLocal()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        app.dependency_overrides.clear()

    @staticmethod
    def _admin_headers(sub: str, role: str = "ADMIN", email: str = "admin@example.com") -> dict[str, str]:
        token = create_jwt(
            {"sub": sub, "email": email, "role": role},
            settings.ADMIN_JWT_SECRET,
            timedelta(minutes=30),
        )
        return {"Authorization": f"Bearer {token}"}

    def test_public_attachment_download_writes_security_allow_event(self):
        fake_s3 = _FakeS3Storage()
        with self.SessionLocal() as db:
            req = Request(
                track_number="TRK-SEC-PUB-1",
                client_name="Клиент",
                client_phone="+79990001010",
                topic_code="civil-law",
                status_code="NEW",
                extra_fields={},
                total_attachments_bytes=0,
            )
            db.add(req)
            db.flush()
            key = f"requests/{req.id}/doc.pdf"
            att = Attachment(
                request_id=req.id,
                message_id=None,
                file_name="doc.pdf",
                mime_type="application/pdf",
                size_bytes=1024,
                s3_key=key,
                responsible="Клиент",
            )
            db.add(att)
            db.commit()
            attachment_id = str(att.id)
            track_number = req.track_number

        fake_s3.objects[key] = {"size": 1024, "mime": "application/pdf", "content": b"x" * 1024}
        public_token = create_jwt({"sub": track_number, "purpose": "VIEW_REQUEST"}, settings.PUBLIC_JWT_SECRET, timedelta(days=1))
        cookies = {settings.PUBLIC_COOKIE_NAME: public_token}

        with patch("app.api.public.uploads.get_s3_storage", return_value=fake_s3):
            response = self.client.get(f"/api/public/uploads/object/{attachment_id}", cookies=cookies)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b"x" * 1024)

        with self.SessionLocal() as db:
            rows = (
                db.query(SecurityAuditLog)
                .filter(SecurityAuditLog.action == "DOWNLOAD_OBJECT", SecurityAuditLog.actor_role == "CLIENT")
                .all()
            )
            self.assertEqual(len(rows), 1)
            row = rows[0]
            self.assertTrue(row.allowed)
            self.assertEqual(row.object_key, key)
            self.assertEqual(str(row.attachment_id), attachment_id)
            self.assertEqual(row.scope, "REQUEST_ATTACHMENT")

    def test_admin_object_proxy_denied_writes_security_deny_event(self):
        fake_s3 = _FakeS3Storage()
        with self.SessionLocal() as db:
            lawyer_a = AdminUser(
                role="LAWYER",
                name="Юрист А",
                email="sec-lawyer-a@example.com",
                password_hash="hash",
                is_active=True,
            )
            lawyer_b = AdminUser(
                role="LAWYER",
                name="Юрист Б",
                email="sec-lawyer-b@example.com",
                password_hash="hash",
                is_active=True,
            )
            db.add_all([lawyer_a, lawyer_b])
            db.flush()
            req = Request(
                track_number="TRK-SEC-ADM-1",
                client_name="Клиент",
                client_phone="+79990002020",
                topic_code="civil-law",
                status_code="IN_PROGRESS",
                assigned_lawyer_id=str(lawyer_b.id),
                extra_fields={},
                total_attachments_bytes=0,
            )
            db.add(req)
            db.flush()
            key = f"requests/{req.id}/proof.pdf"
            db.add(
                Attachment(
                    request_id=req.id,
                    file_name="proof.pdf",
                    mime_type="application/pdf",
                    size_bytes=1024,
                    s3_key=key,
                )
            )
            db.commit()
            lawyer_a_id = str(lawyer_a.id)

        token = self._admin_headers(sub=lawyer_a_id, role="LAWYER", email="sec-lawyer-a@example.com")["Authorization"].replace(
            "Bearer ", ""
        )
        fake_s3.objects[key] = {"size": 1024, "mime": "application/pdf", "content": b"x" * 1024}
        with patch("app.api.admin.uploads.get_s3_storage", return_value=fake_s3):
            response = self.client.get(f"/api/admin/uploads/object/{key}?token={token}")
        self.assertEqual(response.status_code, 403)

        with self.SessionLocal() as db:
            rows = (
                db.query(SecurityAuditLog)
                .filter(SecurityAuditLog.action == "DOWNLOAD_OBJECT", SecurityAuditLog.actor_role == "LAWYER")
                .all()
            )
            self.assertEqual(len(rows), 1)
            row = rows[0]
            self.assertFalse(row.allowed)
            self.assertEqual(row.object_key, key)
            self.assertIn("Недостаточно прав", str(row.reason or ""))
            self.assertEqual(str(row.request_id), key.split("/")[1])
            UUID(str(row.id))
