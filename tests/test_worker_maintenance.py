import os
import unittest
from datetime import datetime, timedelta, timezone
from uuid import uuid4

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
from app.models.message import Message
from app.models.notification import Notification
from app.models.otp_session import OtpSession
from app.models.request import Request
from app.models.status import Status
from app.models.status_history import StatusHistory
from app.models.topic_status_transition import TopicStatusTransition
from app.workers.tasks import security as security_task
from app.workers.tasks import sla as sla_task
from app.workers.tasks import uploads as uploads_task


class WorkerMaintenanceTaskTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite+pysqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.SessionLocal = sessionmaker(bind=cls.engine, autocommit=False, autoflush=False)
        OtpSession.__table__.create(bind=cls.engine)
        Request.__table__.create(bind=cls.engine)
        Attachment.__table__.create(bind=cls.engine)
        Status.__table__.create(bind=cls.engine)
        Message.__table__.create(bind=cls.engine)
        StatusHistory.__table__.create(bind=cls.engine)
        TopicStatusTransition.__table__.create(bind=cls.engine)
        Notification.__table__.create(bind=cls.engine)

        cls._old_security_session_local = security_task.SessionLocal
        cls._old_uploads_session_local = uploads_task.SessionLocal
        cls._old_sla_session_local = sla_task.SessionLocal
        security_task.SessionLocal = cls.SessionLocal
        uploads_task.SessionLocal = cls.SessionLocal
        sla_task.SessionLocal = cls.SessionLocal

    @classmethod
    def tearDownClass(cls):
        security_task.SessionLocal = cls._old_security_session_local
        uploads_task.SessionLocal = cls._old_uploads_session_local
        sla_task.SessionLocal = cls._old_sla_session_local
        StatusHistory.__table__.drop(bind=cls.engine)
        Notification.__table__.drop(bind=cls.engine)
        TopicStatusTransition.__table__.drop(bind=cls.engine)
        Message.__table__.drop(bind=cls.engine)
        Status.__table__.drop(bind=cls.engine)
        Attachment.__table__.drop(bind=cls.engine)
        Request.__table__.drop(bind=cls.engine)
        OtpSession.__table__.drop(bind=cls.engine)
        cls.engine.dispose()

    def setUp(self):
        with self.SessionLocal() as db:
            db.execute(delete(StatusHistory))
            db.execute(delete(Message))
            db.execute(delete(Status))
            db.execute(delete(TopicStatusTransition))
            db.execute(delete(Notification))
            db.execute(delete(Attachment))
            db.execute(delete(Request))
            db.execute(delete(OtpSession))
            db.commit()

    def test_cleanup_expired_otps_deletes_only_expired_rows(self):
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as db:
            db.add_all(
                [
                    OtpSession(
                        purpose="VIEW_REQUEST",
                        track_number="TRK-EXP",
                        phone="+79990000001",
                        code_hash="hash-exp",
                        attempts=0,
                        expires_at=now - timedelta(minutes=1),
                    ),
                    OtpSession(
                        purpose="VIEW_REQUEST",
                        track_number="TRK-ACT",
                        phone="+79990000002",
                        code_hash="hash-act",
                        attempts=0,
                        expires_at=now + timedelta(minutes=10),
                    ),
                ]
            )
            db.commit()

        result = security_task.cleanup_expired_otps()
        self.assertEqual(result["checked"], 2)
        self.assertEqual(result["deleted"], 1)

        with self.SessionLocal() as db:
            remaining = db.query(OtpSession).all()
            self.assertEqual(len(remaining), 1)
            self.assertEqual(remaining[0].track_number, "TRK-ACT")

    def test_cleanup_stale_uploads_removes_invalid_and_fixes_totals(self):
        with self.SessionLocal() as db:
            req1 = Request(
                track_number="TRK-UP-1",
                client_name="Клиент 1",
                client_phone="+79990001001",
                topic_code="civil",
                status_code="NEW",
                extra_fields={},
                total_attachments_bytes=999,
            )
            req2 = Request(
                track_number="TRK-UP-2",
                client_name="Клиент 2",
                client_phone="+79990001002",
                topic_code="civil",
                status_code="NEW",
                extra_fields={},
                total_attachments_bytes=0,
            )
            db.add_all([req1, req2])
            db.flush()

            db.add_all(
                [
                    Attachment(request_id=req1.id, message_id=None, file_name="a.pdf", mime_type="application/pdf", size_bytes=100, s3_key="k1"),
                    Attachment(request_id=req1.id, message_id=None, file_name="b.pdf", mime_type="application/pdf", size_bytes=200, s3_key="k2"),
                    Attachment(request_id=req1.id, message_id=None, file_name="bad-size.pdf", mime_type="application/pdf", size_bytes=0, s3_key="k3"),
                    Attachment(request_id=req1.id, message_id=None, file_name="bad-key.pdf", mime_type="application/pdf", size_bytes=20, s3_key=""),
                    Attachment(request_id=uuid4(), message_id=None, file_name="orphan.pdf", mime_type="application/pdf", size_bytes=50, s3_key="orphan"),
                    Attachment(request_id=req2.id, message_id=None, file_name="c.pdf", mime_type="application/pdf", size_bytes=70, s3_key="k4"),
                ]
            )
            db.commit()
            req1_id = req1.id
            req2_id = req2.id

        result = uploads_task.cleanup_stale_uploads()
        self.assertEqual(result["deleted_orphan_attachments"], 1)
        self.assertEqual(result["deleted_invalid_attachments"], 2)
        self.assertEqual(result["fixed_requests"], 2)

        with self.SessionLocal() as db:
            req1 = db.get(Request, req1_id)
            req2 = db.get(Request, req2_id)
            self.assertIsNotNone(req1)
            self.assertIsNotNone(req2)
            self.assertEqual(req1.total_attachments_bytes, 300)
            self.assertEqual(req2.total_attachments_bytes, 70)
            all_attachments = db.query(Attachment).all()
            self.assertEqual(len(all_attachments), 3)

    def test_sla_check_computes_overdue_and_frt(self):
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as db:
            db.add_all(
                [
                    Status(code="NEW", name="Новая", enabled=True, sort_order=0, is_terminal=False),
                    Status(code="IN_PROGRESS", name="В работе", enabled=True, sort_order=1, is_terminal=False),
                    Status(code="CLOSED", name="Закрыта", enabled=True, sort_order=2, is_terminal=True),
                ]
            )

            req_overdue = Request(
                track_number="TRK-SLA-1",
                client_name="Клиент SLA 1",
                client_phone="+79990002001",
                topic_code="civil",
                status_code="NEW",
                extra_fields={},
                created_at=now - timedelta(hours=30),
                updated_at=now - timedelta(hours=30),
            )
            req_ok = Request(
                track_number="TRK-SLA-2",
                client_name="Клиент SLA 2",
                client_phone="+79990002002",
                topic_code="civil",
                status_code="NEW",
                extra_fields={},
                created_at=now - timedelta(hours=2),
                updated_at=now - timedelta(hours=2),
            )
            req_closed = Request(
                track_number="TRK-SLA-3",
                client_name="Клиент SLA 3",
                client_phone="+79990002003",
                topic_code="civil",
                status_code="CLOSED",
                extra_fields={},
                created_at=now - timedelta(hours=50),
                updated_at=now - timedelta(hours=50),
            )
            db.add_all([req_overdue, req_ok, req_closed])
            db.flush()

            db.add(
                Message(
                    request_id=req_overdue.id,
                    author_type="LAWYER",
                    author_name="Юрист",
                    body="Первый ответ",
                    created_at=req_overdue.created_at + timedelta(minutes=30),
                    updated_at=req_overdue.created_at + timedelta(minutes=30),
                )
            )
            db.add_all(
                [
                    StatusHistory(
                        request_id=req_overdue.id,
                        from_status=None,
                        to_status="NEW",
                        changed_by_admin_id=None,
                        created_at=now - timedelta(hours=30),
                        updated_at=now - timedelta(hours=30),
                    ),
                    StatusHistory(
                        request_id=req_overdue.id,
                        from_status="NEW",
                        to_status="IN_PROGRESS",
                        changed_by_admin_id=None,
                        created_at=now - timedelta(hours=10),
                        updated_at=now - timedelta(hours=10),
                    ),
                ]
            )
            db.commit()

        result = sla_task.sla_check()
        self.assertEqual(result["checked_active_requests"], 2)
        self.assertGreaterEqual(result["overdue_total"], 1)
        self.assertGreaterEqual(result["overdue_by_status"].get("NEW", 0), 1)
        self.assertIsNotNone(result["frt_avg_minutes"])
        self.assertAlmostEqual(result["frt_avg_minutes"], 30.0, places=1)
        self.assertIn("NEW", result["avg_time_in_status_hours"])

    def test_sla_check_uses_topic_transition_sla_for_active_status(self):
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as db:
            db.add_all(
                [
                    Status(code="NEW", name="Новая", enabled=True, sort_order=0, is_terminal=False),
                    Status(code="IN_PROGRESS", name="В работе", enabled=True, sort_order=1, is_terminal=False),
                ]
            )
            db.add(
                TopicStatusTransition(
                    topic_code="civil",
                    from_status="NEW",
                    to_status="IN_PROGRESS",
                    enabled=True,
                    sla_hours=1,
                    sort_order=1,
                )
            )

            req = Request(
                track_number="TRK-SLA-T-1",
                client_name="Клиент SLA T",
                client_phone="+79990002101",
                topic_code="civil",
                status_code="NEW",
                extra_fields={},
                created_at=now - timedelta(hours=2),
                updated_at=now - timedelta(hours=2),
            )
            db.add(req)
            db.commit()

        result = sla_task.sla_check()
        self.assertEqual(result["checked_active_requests"], 1)
        self.assertEqual(result["overdue_total"], 1)
        self.assertGreaterEqual(result["overdue_by_status"].get("NEW", 0), 1)
        self.assertGreaterEqual(result["overdue_by_transition"].get("civil:NEW->*", 0), 1)
