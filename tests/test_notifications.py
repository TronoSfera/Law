import os
import unittest
from datetime import datetime, timedelta, timezone
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
from app.models.status import Status
from app.models.status_history import StatusHistory
from app.models.topic_status_transition import TopicStatusTransition
from app.workers.tasks import sla as sla_task


class _FakeS3Storage:
    def __init__(self):
        self.objects = {}

    def create_presigned_put_url(self, key: str, mime_type: str, expires_sec: int = 900) -> str:
        return f"https://s3.local/{key}?expires={expires_sec}"

    def head_object(self, key: str) -> dict:
        obj = self.objects.get(key)
        if obj is None:
            raise ClientError({"Error": {"Code": "404", "Message": "Not Found"}}, "HeadObject")
        return {"ContentLength": obj["size"], "ContentType": obj["mime"]}


class NotificationFlowTests(unittest.TestCase):
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
        Attachment.__table__.create(bind=cls.engine)
        StatusHistory.__table__.create(bind=cls.engine)
        TopicStatusTransition.__table__.create(bind=cls.engine)
        Notification.__table__.create(bind=cls.engine)

    @classmethod
    def tearDownClass(cls):
        Notification.__table__.drop(bind=cls.engine)
        TopicStatusTransition.__table__.drop(bind=cls.engine)
        StatusHistory.__table__.drop(bind=cls.engine)
        Attachment.__table__.drop(bind=cls.engine)
        Message.__table__.drop(bind=cls.engine)
        Request.__table__.drop(bind=cls.engine)
        AdminUser.__table__.drop(bind=cls.engine)
        cls.engine.dispose()

    def setUp(self):
        with self.SessionLocal() as db:
            db.execute(delete(Notification))
            db.execute(delete(StatusHistory))
            db.execute(delete(TopicStatusTransition))
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
    def _admin_headers(sub: str, role: str, email: str) -> dict[str, str]:
        token = create_jwt(
            {"sub": sub, "email": email, "role": role},
            settings.ADMIN_JWT_SECRET,
            timedelta(minutes=30),
        )
        return {"Authorization": f"Bearer {token}"}

    @staticmethod
    def _public_cookies(track_number: str) -> dict[str, str]:
        token = create_jwt({"sub": track_number, "purpose": "VIEW_REQUEST"}, settings.PUBLIC_JWT_SECRET, timedelta(days=1))
        return {settings.PUBLIC_COOKIE_NAME: token}

    def test_public_message_creates_internal_notification_for_lawyer(self):
        with self.SessionLocal() as db:
            lawyer = AdminUser(
                role="LAWYER",
                name="Юрист",
                email="lawyer@example.com",
                password_hash="hash",
                is_active=True,
            )
            db.add(lawyer)
            db.flush()
            req = Request(
                track_number="TRK-NOTIF-MSG",
                client_name="Клиент",
                client_phone="+79990000001",
                topic_code="civil",
                status_code="NEW",
                description="notification",
                extra_fields={},
                assigned_lawyer_id=str(lawyer.id),
            )
            db.add(req)
            db.commit()
            lawyer_id = str(lawyer.id)

        created = self.client.post(
            "/api/public/requests/TRK-NOTIF-MSG/messages",
            cookies=self._public_cookies("TRK-NOTIF-MSG"),
            json={"body": "Есть новое сообщение"},
        )
        self.assertEqual(created.status_code, 201)

        with self.SessionLocal() as db:
            rows = db.query(Notification).all()
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0].event_type, "MESSAGE")
            self.assertEqual(str(rows[0].recipient_admin_user_id), lawyer_id)
            self.assertFalse(rows[0].is_read)
            notif_id = str(rows[0].id)

        headers = self._admin_headers(lawyer_id, "LAWYER", "lawyer@example.com")
        listed = self.client.get("/api/admin/notifications", headers=headers)
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.json()["total"], 1)
        self.assertEqual(listed.json()["unread_total"], 1)

        marked = self.client.post(f"/api/admin/notifications/{notif_id}/read", headers=headers)
        self.assertEqual(marked.status_code, 200)
        self.assertEqual(marked.json()["changed"], 1)

        unread = self.client.get("/api/admin/notifications?unread_only=true", headers=headers)
        self.assertEqual(unread.status_code, 200)
        self.assertEqual(unread.json()["total"], 0)

    def test_admin_status_change_creates_client_notification_and_open_marks_read(self):
        with self.SessionLocal() as db:
            req = Request(
                track_number="TRK-NOTIF-STATUS",
                client_name="Клиент",
                client_phone="+79990000002",
                topic_code="civil",
                status_code="NEW",
                description="notification status",
                extra_fields={},
            )
            db.add(req)
            db.commit()
            request_id = str(req.id)

        headers = self._admin_headers(sub=str(UUID(int=1)), role="ADMIN", email="admin@example.com")
        updated = self.client.patch(
            f"/api/admin/requests/{request_id}",
            headers=headers,
            json={"status_code": "IN_PROGRESS"},
        )
        self.assertEqual(updated.status_code, 200)

        listed = self.client.get(
            "/api/public/requests/TRK-NOTIF-STATUS/notifications",
            cookies=self._public_cookies("TRK-NOTIF-STATUS"),
        )
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.json()["total"], 1)
        self.assertEqual(listed.json()["rows"][0]["event_type"], "STATUS")
        self.assertEqual(listed.json()["unread_total"], 1)

        opened = self.client.get(
            "/api/public/requests/TRK-NOTIF-STATUS",
            cookies=self._public_cookies("TRK-NOTIF-STATUS"),
        )
        self.assertEqual(opened.status_code, 200)

        unread = self.client.get(
            "/api/public/requests/TRK-NOTIF-STATUS/notifications?unread_only=true",
            cookies=self._public_cookies("TRK-NOTIF-STATUS"),
        )
        self.assertEqual(unread.status_code, 200)
        self.assertEqual(unread.json()["total"], 0)

    def test_public_attachment_creates_lawyer_notification(self):
        fake_s3 = _FakeS3Storage()
        with self.SessionLocal() as db:
            lawyer = AdminUser(
                role="LAWYER",
                name="Юрист",
                email="lawyer-file@example.com",
                password_hash="hash",
                is_active=True,
            )
            db.add(lawyer)
            db.flush()
            req = Request(
                track_number="TRK-NOTIF-FILE",
                client_name="Клиент",
                client_phone="+79990000003",
                topic_code="civil",
                status_code="NEW",
                description="notification file",
                extra_fields={},
                assigned_lawyer_id=str(lawyer.id),
            )
            db.add(req)
            db.commit()
            request_id = str(req.id)
            lawyer_id = str(lawyer.id)

        with patch("app.api.public.uploads.get_s3_storage", return_value=fake_s3):
            init_resp = self.client.post(
                "/api/public/uploads/init",
                cookies=self._public_cookies("TRK-NOTIF-FILE"),
                json={
                    "file_name": "doc.pdf",
                    "mime_type": "application/pdf",
                    "size_bytes": 1024,
                    "scope": "REQUEST_ATTACHMENT",
                    "request_id": request_id,
                },
            )
            self.assertEqual(init_resp.status_code, 200)
            key = init_resp.json()["key"]
            fake_s3.objects[key] = {"size": 1024, "mime": "application/pdf"}

            complete = self.client.post(
                "/api/public/uploads/complete",
                cookies=self._public_cookies("TRK-NOTIF-FILE"),
                json={
                    "key": key,
                    "file_name": "doc.pdf",
                    "mime_type": "application/pdf",
                    "size_bytes": 1024,
                    "scope": "REQUEST_ATTACHMENT",
                    "request_id": request_id,
                },
            )
            self.assertEqual(complete.status_code, 200)

        with self.SessionLocal() as db:
            rows = db.query(Notification).filter(Notification.event_type == "ATTACHMENT").all()
            self.assertEqual(len(rows), 1)
            self.assertEqual(str(rows[0].recipient_admin_user_id), lawyer_id)


class NotificationSlaTests(unittest.TestCase):
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
        Status.__table__.create(bind=cls.engine)
        Message.__table__.create(bind=cls.engine)
        TopicStatusTransition.__table__.create(bind=cls.engine)
        StatusHistory.__table__.create(bind=cls.engine)
        Notification.__table__.create(bind=cls.engine)

        cls._old_sla_session_local = sla_task.SessionLocal
        sla_task.SessionLocal = cls.SessionLocal

    @classmethod
    def tearDownClass(cls):
        sla_task.SessionLocal = cls._old_sla_session_local
        Notification.__table__.drop(bind=cls.engine)
        StatusHistory.__table__.drop(bind=cls.engine)
        TopicStatusTransition.__table__.drop(bind=cls.engine)
        Message.__table__.drop(bind=cls.engine)
        Status.__table__.drop(bind=cls.engine)
        Request.__table__.drop(bind=cls.engine)
        AdminUser.__table__.drop(bind=cls.engine)
        cls.engine.dispose()

    def setUp(self):
        with self.SessionLocal() as db:
            db.execute(delete(Notification))
            db.execute(delete(StatusHistory))
            db.execute(delete(TopicStatusTransition))
            db.execute(delete(Message))
            db.execute(delete(Status))
            db.execute(delete(Request))
            db.execute(delete(AdminUser))
            db.commit()

    def test_sla_overdue_notifications_are_deduplicated(self):
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as db:
            admin = AdminUser(
                role="ADMIN",
                name="Админ",
                email="root@example.com",
                password_hash="hash",
                is_active=True,
            )
            lawyer = AdminUser(
                role="LAWYER",
                name="Юрист",
                email="lawyer-sla@example.com",
                password_hash="hash",
                is_active=True,
            )
            db.add_all([admin, lawyer])
            db.flush()
            db.add(Status(code="NEW", name="Новая", enabled=True, sort_order=0, is_terminal=False))
            db.add(Status(code="IN_PROGRESS", name="В работе", enabled=True, sort_order=1, is_terminal=False))
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
                track_number="TRK-NOTIF-SLA",
                client_name="Клиент",
                client_phone="+79990000009",
                topic_code="civil",
                status_code="NEW",
                description="sla",
                extra_fields={},
                assigned_lawyer_id=str(lawyer.id),
                created_at=now - timedelta(hours=2),
                updated_at=now - timedelta(hours=2),
            )
            db.add(req)
            db.commit()

        first = sla_task.sla_check()
        second = sla_task.sla_check()

        self.assertGreaterEqual(first.get("notifications_created", 0), 2)
        self.assertEqual(second.get("notifications_created", 0), 0)

        with self.SessionLocal() as db:
            rows = db.query(Notification).filter(Notification.event_type == "SLA_OVERDUE").all()
            self.assertGreaterEqual(len(rows), 2)
