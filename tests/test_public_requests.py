import os
import unittest
from datetime import timedelta
from unittest.mock import patch
from uuid import UUID

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Ensure settings can be initialized in test environments
os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("S3_ENDPOINT", "http://localhost:9000")
os.environ.setdefault("S3_ACCESS_KEY", "test")
os.environ.setdefault("S3_SECRET_KEY", "test")
os.environ.setdefault("S3_BUCKET", "test")

from app.main import app
from app.core.config import settings
from app.core.security import create_jwt, decode_jwt
from app.db.session import get_db
from app.models.notification import Notification
from app.models.otp_session import OtpSession
from app.models.request import Request
from app.models.topic_required_field import TopicRequiredField


class PublicRequestCreateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite+pysqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.SessionLocal = sessionmaker(bind=cls.engine, autocommit=False, autoflush=False)
        Request.__table__.create(bind=cls.engine)
        Notification.__table__.create(bind=cls.engine)
        OtpSession.__table__.create(bind=cls.engine)
        TopicRequiredField.__table__.create(bind=cls.engine)

    @classmethod
    def tearDownClass(cls):
        Notification.__table__.drop(bind=cls.engine)
        OtpSession.__table__.drop(bind=cls.engine)
        TopicRequiredField.__table__.drop(bind=cls.engine)
        Request.__table__.drop(bind=cls.engine)
        cls.engine.dispose()

    def setUp(self):
        with self.SessionLocal() as db:
            db.execute(delete(Notification))
            db.execute(delete(OtpSession))
            db.execute(delete(TopicRequiredField))
            db.execute(delete(Request))
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

    def _send_and_verify_create_otp(self, phone: str) -> None:
        with patch("app.api.public.otp._generate_code", return_value="123456"):
            sent = self.client.post(
                "/api/public/otp/send",
                json={"purpose": "CREATE_REQUEST", "client_phone": phone},
            )
            self.assertEqual(sent.status_code, 200)
            body = sent.json()
            self.assertEqual(body["status"], "sent")
            self.assertEqual(body["sms_response"]["provider"], "mock_sms")

        verified = self.client.post(
            "/api/public/otp/verify",
            json={"purpose": "CREATE_REQUEST", "client_phone": phone, "code": "123456"},
        )
        self.assertEqual(verified.status_code, 200)
        self.assertEqual(verified.json()["status"], "verified")

    def test_create_request_requires_verified_otp_cookie(self):
        payload = {
            "client_name": "ООО Ромашка",
            "client_phone": "+79990000001",
            "topic_code": "consulting",
            "description": "Тестируем создание заявки",
            "extra_fields": {"referral_name": "Партнер"},
        }
        response = self.client.post("/api/public/requests", json=payload)
        self.assertEqual(response.status_code, 401)

        self._send_and_verify_create_otp(payload["client_phone"])

        response = self.client.post("/api/public/requests", json=payload)
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertTrue(body["track_number"].startswith("TRK-"))
        self.assertFalse(body["otp_required"])
        request_id = UUID(body["request_id"])

        with self.SessionLocal() as db:
            created = db.get(Request, request_id)
            self.assertIsNotNone(created)
            self.assertEqual(created.client_name, payload["client_name"])
            self.assertEqual(created.client_phone, payload["client_phone"])
            self.assertEqual(created.topic_code, payload["topic_code"])
            self.assertEqual(created.description, payload["description"])
            self.assertEqual(created.extra_fields, payload["extra_fields"])
            self.assertEqual(created.status_code, "NEW")
            self.assertEqual(created.track_number, body["track_number"])
            self.assertEqual(created.responsible, "Клиент")

        # After creation, cookie is switched to VIEW_REQUEST for this track.
        read = self.client.get(f"/api/public/requests/{body['track_number']}")
        self.assertEqual(read.status_code, 200)
        self.assertEqual(read.json()["track_number"], body["track_number"])

    def test_view_request_requires_view_otp_and_uses_track_cookie(self):
        with self.SessionLocal() as db:
            row = Request(
                track_number="TRK-VIEW-OTP",
                client_name="Клиент",
                client_phone="+79991112233",
                topic_code="consulting",
                status_code="NEW",
                description="Проверка просмотра",
                extra_fields={},
            )
            db.add(row)
            db.commit()

        no_session = self.client.get("/api/public/requests/TRK-VIEW-OTP")
        self.assertEqual(no_session.status_code, 401)

        with patch("app.api.public.otp._generate_code", return_value="654321"):
            sent = self.client.post(
                "/api/public/otp/send",
                json={"purpose": "VIEW_REQUEST", "track_number": "TRK-VIEW-OTP"},
            )
            self.assertEqual(sent.status_code, 200)
            self.assertEqual(sent.json()["status"], "sent")

        wrong_code = self.client.post(
            "/api/public/otp/verify",
            json={"purpose": "VIEW_REQUEST", "track_number": "TRK-VIEW-OTP", "code": "000000"},
        )
        self.assertEqual(wrong_code.status_code, 400)

        verified = self.client.post(
            "/api/public/otp/verify",
            json={"purpose": "VIEW_REQUEST", "track_number": "TRK-VIEW-OTP", "code": "654321"},
        )
        self.assertEqual(verified.status_code, 200)

        ok = self.client.get("/api/public/requests/TRK-VIEW-OTP")
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(ok.json()["track_number"], "TRK-VIEW-OTP")

        denied_other_track = self.client.get("/api/public/requests/TRK-OTHER")
        self.assertEqual(denied_other_track.status_code, 403)

    def test_open_request_marks_client_updates_as_read(self):
        with self.SessionLocal() as db:
            row = Request(
                track_number="TRK-READ-1",
                client_name="Клиент",
                client_phone="+79995550011",
                topic_code="consulting",
                status_code="IN_PROGRESS",
                description="Проверка чтения",
                extra_fields={},
                client_has_unread_updates=True,
                client_unread_event_type="STATUS",
            )
            db.add(row)
            db.commit()
            request_id = row.id

        public_token = create_jwt({"sub": "TRK-READ-1", "purpose": "VIEW_REQUEST"}, settings.PUBLIC_JWT_SECRET, timedelta(days=1))
        cookies = {settings.PUBLIC_COOKIE_NAME: public_token}

        opened = self.client.get("/api/public/requests/TRK-READ-1", cookies=cookies)
        self.assertEqual(opened.status_code, 200)
        body = opened.json()
        self.assertFalse(body["client_has_unread_updates"])
        self.assertIsNone(body["client_unread_event_type"])

        with self.SessionLocal() as db:
            refreshed = db.get(Request, request_id)
            self.assertIsNotNone(refreshed)
            self.assertFalse(refreshed.client_has_unread_updates)
            self.assertIsNone(refreshed.client_unread_event_type)

    def test_create_request_checks_required_topic_fields(self):
        phone = "+79990000005"
        self._send_and_verify_create_otp(phone)

        with self.SessionLocal() as db:
            db.add(
                TopicRequiredField(
                    topic_code="consulting",
                    field_key="passport_series",
                    required=True,
                    enabled=True,
                    sort_order=1,
                    responsible="root@example.com",
                )
            )
            db.commit()

        missing = self.client.post(
            "/api/public/requests",
            json={
                "client_name": "ООО Поле",
                "client_phone": phone,
                "topic_code": "consulting",
                "description": "Проверка обязательного поля",
                "extra_fields": {},
            },
        )
        self.assertEqual(missing.status_code, 400)
        self.assertIn("passport_series", missing.json().get("detail", ""))

        created = self.client.post(
            "/api/public/requests",
            json={
                "client_name": "ООО Поле",
                "client_phone": phone,
                "topic_code": "consulting",
                "description": "Проверка обязательного поля",
                "extra_fields": {"passport_series": "1234"},
            },
        )
        self.assertEqual(created.status_code, 201)
        self.assertTrue(created.json()["track_number"].startswith("TRK-"))

    def test_verify_otp_sets_public_cookie_for_configured_ttl(self):
        phone = "+79990001234"
        with patch("app.api.public.otp._generate_code", return_value="777777"):
            sent = self.client.post(
                "/api/public/otp/send",
                json={"purpose": "CREATE_REQUEST", "client_phone": phone},
            )
            self.assertEqual(sent.status_code, 200)

        verified = self.client.post(
            "/api/public/otp/verify",
            json={"purpose": "CREATE_REQUEST", "client_phone": phone, "code": "777777"},
        )
        self.assertEqual(verified.status_code, 200)

        token = verified.cookies.get(settings.PUBLIC_COOKIE_NAME)
        self.assertTrue(token)
        payload = decode_jwt(token, settings.PUBLIC_JWT_SECRET)
        self.assertEqual(payload.get("sub"), phone)
        self.assertEqual(payload.get("purpose"), "CREATE_REQUEST")
        self.assertEqual(
            int(payload.get("exp") or 0) - int(payload.get("iat") or 0),
            settings.PUBLIC_JWT_TTL_DAYS * 24 * 3600,
        )

        cookie_header = str(verified.headers.get("set-cookie") or "")
        self.assertIn(f"{settings.PUBLIC_COOKIE_NAME}=", cookie_header)
        self.assertIn(f"Max-Age={settings.PUBLIC_JWT_TTL_DAYS * 24 * 3600}", cookie_header)
        self.assertIn("httponly", cookie_header.lower())
