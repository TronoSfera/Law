import os
import unittest
from datetime import timedelta
from unittest.mock import patch
from uuid import UUID, uuid4

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
from app.models.client import Client
from app.models.audit_log import AuditLog
from app.models.notification import Notification
from app.models.otp_session import OtpSession
from app.models.request import Request
from app.models.request_service_request import RequestServiceRequest
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
        Client.__table__.create(bind=cls.engine)
        AuditLog.__table__.create(bind=cls.engine)
        Request.__table__.create(bind=cls.engine)
        RequestServiceRequest.__table__.create(bind=cls.engine)
        Notification.__table__.create(bind=cls.engine)
        OtpSession.__table__.create(bind=cls.engine)
        TopicRequiredField.__table__.create(bind=cls.engine)

    @classmethod
    def tearDownClass(cls):
        RequestServiceRequest.__table__.drop(bind=cls.engine)
        Notification.__table__.drop(bind=cls.engine)
        OtpSession.__table__.drop(bind=cls.engine)
        TopicRequiredField.__table__.drop(bind=cls.engine)
        Request.__table__.drop(bind=cls.engine)
        AuditLog.__table__.drop(bind=cls.engine)
        Client.__table__.drop(bind=cls.engine)
        cls.engine.dispose()

    def setUp(self):
        with self.SessionLocal() as db:
            db.execute(delete(RequestServiceRequest))
            db.execute(delete(Notification))
            db.execute(delete(OtpSession))
            db.execute(delete(TopicRequiredField))
            db.execute(delete(Request))
            db.execute(delete(AuditLog))
            db.execute(delete(Client))
            db.commit()

        def override_get_db():
            db = self.SessionLocal()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(app)
        self._otp_limits_backup = (
            settings.OTP_SEND_RATE_LIMIT,
            settings.OTP_VERIFY_RATE_LIMIT,
            settings.OTP_RATE_LIMIT_WINDOW_SECONDS,
        )
        settings.OTP_SEND_RATE_LIMIT = 10_000
        settings.OTP_VERIFY_RATE_LIMIT = 10_000
        settings.OTP_RATE_LIMIT_WINDOW_SECONDS = 1

    def tearDown(self):
        self.client.close()
        app.dependency_overrides.clear()
        settings.OTP_SEND_RATE_LIMIT, settings.OTP_VERIFY_RATE_LIMIT, settings.OTP_RATE_LIMIT_WINDOW_SECONDS = self._otp_limits_backup

    @staticmethod
    def _unique_phone() -> str:
        suffix = f"{uuid4().int % 10_000_000_000:010d}"
        return f"+79{suffix}"

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
            self.assertIsNotNone(created.client_id)
            self.assertEqual(created.topic_code, payload["topic_code"])
            self.assertEqual(created.description, payload["description"])
            self.assertEqual(created.extra_fields, payload["extra_fields"])
            self.assertEqual(created.status_code, "NEW")
            self.assertEqual(created.track_number, body["track_number"])
            self.assertEqual(created.responsible, "Клиент")
            client = db.get(Client, created.client_id)
            self.assertIsNotNone(client)
            self.assertEqual(client.phone, payload["client_phone"])

        # After creation, cookie is switched to VIEW_REQUEST for this track.
        read = self.client.get(f"/api/public/requests/{body['track_number']}")
        self.assertEqual(read.status_code, 200)
        self.assertEqual(read.json()["track_number"], body["track_number"])

    def test_view_request_requires_view_otp_and_uses_track_cookie(self):
        track_number = f"TRK-VIEW-{uuid4().hex[:8].upper()}"
        with self.SessionLocal() as db:
            row = Request(
                track_number=track_number,
                client_name="Клиент",
                client_phone=self._unique_phone(),
                topic_code="consulting",
                status_code="NEW",
                description="Проверка просмотра",
                extra_fields={},
            )
            db.add(row)
            db.commit()

        no_session = self.client.get(f"/api/public/requests/{track_number}")
        self.assertEqual(no_session.status_code, 401)

        with patch("app.api.public.otp._generate_code", return_value="654321"):
            sent = self.client.post(
                "/api/public/otp/send",
                json={"purpose": "VIEW_REQUEST", "track_number": track_number},
            )
            self.assertEqual(sent.status_code, 200)
            self.assertEqual(sent.json()["status"], "sent")

        wrong_code = self.client.post(
            "/api/public/otp/verify",
            json={"purpose": "VIEW_REQUEST", "track_number": track_number, "code": "000000"},
        )
        self.assertEqual(wrong_code.status_code, 400)

        verified = self.client.post(
            "/api/public/otp/verify",
            json={"purpose": "VIEW_REQUEST", "track_number": track_number, "code": "654321"},
        )
        self.assertEqual(verified.status_code, 200)

        ok = self.client.get(f"/api/public/requests/{track_number}")
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(ok.json()["track_number"], track_number)

        denied_other_track = self.client.get("/api/public/requests/TRK-OTHER")
        self.assertEqual(denied_other_track.status_code, 403)

    def test_view_request_can_use_phone_otp_and_switch_between_client_requests(self):
        phone = "+79996660077"
        with self.SessionLocal() as db:
            client = Client(full_name="Клиент Мульти", phone=phone, responsible="seed")
            db.add(client)
            db.flush()
            db.add_all(
                [
                    Request(
                        track_number="TRK-MULTI-1",
                        client_id=client.id,
                        client_name=client.full_name,
                        client_phone=client.phone,
                        topic_code="consulting",
                        status_code="NEW",
                        description="Первая",
                        extra_fields={},
                    ),
                    Request(
                        track_number="TRK-MULTI-2",
                        client_id=client.id,
                        client_name=client.full_name,
                        client_phone=client.phone,
                        topic_code="consulting",
                        status_code="IN_PROGRESS",
                        description="Вторая",
                        extra_fields={},
                    ),
                    Request(
                        track_number="TRK-FOREIGN-1",
                        client_name="Другой клиент",
                        client_phone="+79990009999",
                        topic_code="consulting",
                        status_code="NEW",
                        description="Чужая",
                        extra_fields={},
                    ),
                ]
            )
            db.commit()

        with patch("app.api.public.otp._generate_code", return_value="111111"):
            sent = self.client.post(
                "/api/public/otp/send",
                json={"purpose": "VIEW_REQUEST", "client_phone": phone},
            )
            self.assertEqual(sent.status_code, 200)

        verified = self.client.post(
            "/api/public/otp/verify",
            json={"purpose": "VIEW_REQUEST", "client_phone": phone, "code": "111111"},
        )
        self.assertEqual(verified.status_code, 200)

        list_resp = self.client.get("/api/public/requests/my")
        self.assertEqual(list_resp.status_code, 200)
        rows = list_resp.json().get("rows") or []
        tracks = {row["track_number"] for row in rows}
        self.assertEqual(tracks, {"TRK-MULTI-1", "TRK-MULTI-2"})

        opened = self.client.get("/api/public/requests/TRK-MULTI-2")
        self.assertEqual(opened.status_code, 200)
        self.assertEqual(opened.json()["track_number"], "TRK-MULTI-2")

        denied = self.client.get("/api/public/requests/TRK-FOREIGN-1")
        self.assertEqual(denied.status_code, 403)

    def test_email_auth_mode_allows_create_flow_via_email_otp(self):
        phone = self._unique_phone()
        email = "client.email.mode@example.com"
        with (
            patch("app.api.public.otp.settings.PUBLIC_AUTH_MODE", "email"),
            patch("app.api.public.otp.settings.EMAIL_PROVIDER", "dummy"),
            patch("app.api.public.otp._generate_code", return_value="112233"),
        ):
            sent = self.client.post(
                "/api/public/otp/send",
                json={"purpose": "CREATE_REQUEST", "client_email": email},
            )
            self.assertEqual(sent.status_code, 200)
            self.assertEqual(sent.json()["channel"], "EMAIL")

            verified = self.client.post(
                "/api/public/otp/verify",
                json={"purpose": "CREATE_REQUEST", "client_email": email, "code": "112233"},
            )
            self.assertEqual(verified.status_code, 200)
            self.assertEqual(verified.json()["channel"], "EMAIL")

        create = self.client.post(
            "/api/public/requests",
            json={
                "client_name": "Email Client",
                "client_phone": phone,
                "client_email": email,
                "topic_code": "consulting",
                "description": "Email auth mode create",
                "extra_fields": {},
            },
        )
        self.assertEqual(create.status_code, 201)
        body = create.json()
        with self.SessionLocal() as db:
            req = db.query(Request).filter(Request.track_number == body["track_number"]).first()
            self.assertIsNotNone(req)
            self.assertEqual(req.client_email, email)

    def test_view_otp_email_channel_by_track(self):
        track_number = f"TRK-EMAIL-{uuid4().hex[:8].upper()}"
        email = "view.track.email@example.com"
        with self.SessionLocal() as db:
            row = Request(
                track_number=track_number,
                client_name="Клиент Email",
                client_phone=self._unique_phone(),
                client_email=email,
                topic_code="consulting",
                status_code="NEW",
                description="Проверка просмотра по email",
                extra_fields={},
            )
            db.add(row)
            db.commit()

        with (
            patch("app.api.public.otp.settings.PUBLIC_AUTH_MODE", "sms_or_email"),
            patch("app.api.public.otp.settings.EMAIL_PROVIDER", "dummy"),
            patch("app.api.public.otp._generate_code", return_value="445566"),
        ):
            sent = self.client.post(
                "/api/public/otp/send",
                json={"purpose": "VIEW_REQUEST", "track_number": track_number, "channel": "email"},
            )
            self.assertEqual(sent.status_code, 200)
            self.assertEqual(sent.json()["channel"], "EMAIL")

            verified = self.client.post(
                "/api/public/otp/verify",
                json={"purpose": "VIEW_REQUEST", "track_number": track_number, "channel": "email", "code": "445566"},
            )
            self.assertEqual(verified.status_code, 200)
            self.assertEqual(verified.json()["channel"], "EMAIL")

        ok = self.client.get(f"/api/public/requests/{track_number}")
        self.assertEqual(ok.status_code, 200)

    def test_send_otp_falls_back_to_email_when_sms_balance_low(self):
        with (
            patch("app.api.public.otp.settings.PUBLIC_AUTH_MODE", "sms_or_email"),
            patch("app.api.public.otp.settings.OTP_EMAIL_FALLBACK_ENABLED", True),
            patch("app.api.public.otp.settings.OTP_SMS_MIN_BALANCE", 100.0),
            patch("app.api.public.otp.sms_provider_health", return_value={"mode": "real", "balance_amount": 0.0}),
            patch("app.api.public.otp.send_otp_email_message", return_value={"provider": "mock_email", "debug_code": "778899"}),
            patch("app.api.public.otp._generate_code", return_value="778899"),
        ):
            sent = self.client.post(
                "/api/public/otp/send",
                json={
                    "purpose": "CREATE_REQUEST",
                    "client_phone": "+79991112233",
                    "client_email": "fallback@example.com",
                    "channel": "sms",
                },
            )
            self.assertEqual(sent.status_code, 200)
            body = sent.json()
            self.assertEqual(body.get("channel"), "EMAIL")
            self.assertEqual(body.get("fallback_reason"), "low_sms_balance")

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
        phone = self._unique_phone()
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

    def test_verify_view_otp_by_phone_sets_view_session_subject_as_phone(self):
        phone = "+79998887766"
        with self.SessionLocal() as db:
            db.add(
                Request(
                    track_number="TRK-VIEW-PHONE-1",
                    client_name="Телефонный клиент",
                    client_phone=phone,
                    topic_code="consulting",
                    status_code="NEW",
                    description="Проверка",
                    extra_fields={},
                )
            )
            db.commit()

        with patch("app.api.public.otp._generate_code", return_value="222222"):
            sent = self.client.post(
                "/api/public/otp/send",
                json={"purpose": "VIEW_REQUEST", "client_phone": phone},
            )
            self.assertEqual(sent.status_code, 200)

        verified = self.client.post(
            "/api/public/otp/verify",
            json={"purpose": "VIEW_REQUEST", "client_phone": phone, "code": "222222"},
        )
        self.assertEqual(verified.status_code, 200)

        token = verified.cookies.get(settings.PUBLIC_COOKIE_NAME)
        self.assertTrue(token)
        payload = decode_jwt(token, settings.PUBLIC_JWT_SECRET)
        self.assertEqual(payload.get("sub"), phone)
        self.assertEqual(payload.get("purpose"), "VIEW_REQUEST")

    def test_client_can_create_both_service_request_types_and_audit_is_written(self):
        phone = "+79997776655"
        lawyer_id = UUID("11111111-1111-1111-1111-111111111111")
        with self.SessionLocal() as db:
            client = Client(full_name="Запросный клиент", phone=phone, responsible="seed")
            db.add(client)
            db.flush()
            req = Request(
                track_number="TRK-SVC-1",
                client_id=client.id,
                client_name=client.full_name,
                client_phone=client.phone,
                topic_code="consulting",
                status_code="IN_PROGRESS",
                description="Проверка сервисных запросов",
                extra_fields={},
                assigned_lawyer_id=str(lawyer_id),
            )
            db.add(req)
            db.commit()

        view_token = create_jwt({"sub": phone, "purpose": "VIEW_REQUEST"}, settings.PUBLIC_JWT_SECRET, timedelta(days=1))
        cookies = {settings.PUBLIC_COOKIE_NAME: view_token}

        curator = self.client.post(
            "/api/public/requests/TRK-SVC-1/service-requests",
            cookies=cookies,
            json={"type": "CURATOR_CONTACT", "body": "Прошу консультацию администратора"},
        )
        self.assertEqual(curator.status_code, 201)
        self.assertEqual(curator.json()["type"], "CURATOR_CONTACT")

        change = self.client.post(
            "/api/public/requests/TRK-SVC-1/service-requests",
            cookies=cookies,
            json={"type": "LAWYER_CHANGE_REQUEST", "body": "Прошу сменить юриста"},
        )
        self.assertEqual(change.status_code, 201)
        self.assertEqual(change.json()["type"], "LAWYER_CHANGE_REQUEST")

        listed = self.client.get("/api/public/requests/TRK-SVC-1/service-requests", cookies=cookies)
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(len(listed.json()), 2)

        with self.SessionLocal() as db:
            rows = db.query(RequestServiceRequest).order_by(RequestServiceRequest.created_at.asc()).all()
            self.assertEqual(len(rows), 2)
            self.assertTrue(rows[0].admin_unread)
            self.assertTrue(rows[0].lawyer_unread)  # curator-contact visible to assigned lawyer
            self.assertTrue(rows[1].admin_unread)
            self.assertFalse(rows[1].lawyer_unread)  # lawyer-change hidden from assigned lawyer

            audits = (
                db.query(AuditLog)
                .filter(AuditLog.entity == "request_service_requests", AuditLog.action == "CREATE_CLIENT_REQUEST")
                .all()
            )
            self.assertEqual(len(audits), 2)
