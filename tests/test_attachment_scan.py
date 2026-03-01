import os
import unittest
from uuid import UUID
from unittest.mock import patch

from botocore.exceptions import ClientError
from sqlalchemy import create_engine, delete
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("S3_ENDPOINT", "http://localhost:9000")
os.environ.setdefault("S3_ACCESS_KEY", "test")
os.environ.setdefault("S3_SECRET_KEY", "test")
os.environ.setdefault("S3_BUCKET", "test")

from app.models.attachment import Attachment
from app.models.request import Request
from app.models.security_audit_log import SecurityAuditLog
from app.services.attachment_scan import SCAN_STATUS_CLEAN, SCAN_STATUS_INFECTED, scan_attachment_file_impl
import app.services.attachment_scan as attachment_scan_module
from app.db import session as db_session


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


class AttachmentScanTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite+pysqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.SessionLocal = sessionmaker(bind=cls.engine, autocommit=False, autoflush=False)
        Request.__table__.create(bind=cls.engine)
        Attachment.__table__.create(bind=cls.engine)
        SecurityAuditLog.__table__.create(bind=cls.engine)
        cls._orig_session_local = db_session.SessionLocal
        cls._orig_scan_session_local = attachment_scan_module.SessionLocal
        db_session.SessionLocal = cls.SessionLocal
        attachment_scan_module.SessionLocal = cls.SessionLocal

    @classmethod
    def tearDownClass(cls):
        db_session.SessionLocal = cls._orig_session_local
        attachment_scan_module.SessionLocal = cls._orig_scan_session_local
        SecurityAuditLog.__table__.drop(bind=cls.engine)
        Attachment.__table__.drop(bind=cls.engine)
        Request.__table__.drop(bind=cls.engine)
        cls.engine.dispose()

    def setUp(self):
        with self.SessionLocal() as db:
            db.execute(delete(SecurityAuditLog))
            db.execute(delete(Attachment))
            db.execute(delete(Request))
            db.commit()

    def test_scan_marks_clean_for_valid_pdf_when_clamav_disabled(self):
        fake_s3 = _FakeS3Storage()
        with self.SessionLocal() as db:
            req = Request(
                track_number="TRK-SCAN-001",
                client_name="Клиент",
                client_phone="+79990000001",
                topic_code="consulting",
                status_code="NEW",
                extra_fields={},
            )
            db.add(req)
            db.flush()
            key = f"requests/{req.id}/contract.pdf"
            att = Attachment(
                request_id=req.id,
                file_name="contract.pdf",
                mime_type="application/pdf",
                size_bytes=64,
                s3_key=key,
            )
            db.add(att)
            db.commit()
            attachment_id = str(att.id)

        fake_s3.objects[key] = {"size": 64, "mime": "application/pdf", "content": b"%PDF-1.4\nhello"}
        with (
            patch("app.services.attachment_scan.get_s3_storage", return_value=fake_s3),
            patch("app.services.attachment_scan.settings.CLAMAV_ENABLED", False),
        ):
            result = scan_attachment_file_impl(attachment_id)

        self.assertEqual(result.get("status"), SCAN_STATUS_CLEAN)
        with self.SessionLocal() as db:
            row = db.get(Attachment, UUID(attachment_id))
            self.assertEqual(row.scan_status, SCAN_STATUS_CLEAN)
            self.assertTrue(bool(row.content_sha256))
            self.assertEqual(row.detected_mime, "application/pdf")

    def test_scan_marks_infected_for_content_policy_mismatch(self):
        fake_s3 = _FakeS3Storage()
        with self.SessionLocal() as db:
            req = Request(
                track_number="TRK-SCAN-002",
                client_name="Клиент",
                client_phone="+79990000002",
                topic_code="consulting",
                status_code="NEW",
                extra_fields={},
            )
            db.add(req)
            db.flush()
            key = f"requests/{req.id}/wrong.pdf"
            att = Attachment(
                request_id=req.id,
                file_name="wrong.pdf",
                mime_type="application/pdf",
                size_bytes=64,
                s3_key=key,
            )
            db.add(att)
            db.commit()
            attachment_id = str(att.id)

        fake_s3.objects[key] = {"size": 64, "mime": "application/pdf", "content": b"\x89PNG\r\n\x1a\nbad"}
        with (
            patch("app.services.attachment_scan.get_s3_storage", return_value=fake_s3),
            patch("app.services.attachment_scan.settings.CLAMAV_ENABLED", False),
        ):
            result = scan_attachment_file_impl(attachment_id)

        self.assertEqual(result.get("status"), SCAN_STATUS_INFECTED)
        with self.SessionLocal() as db:
            row = db.get(Attachment, UUID(attachment_id))
            self.assertEqual(row.scan_status, SCAN_STATUS_INFECTED)
            self.assertEqual(row.scan_signature, "CONTENT_POLICY")
