import os
import unittest
from unittest.mock import patch

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

from app.db.session import get_db
from app.main import app
from app.models.otp_session import OtpSession
from app.models.request import Request
from app.services.rate_limit import InMemoryRateLimiter


class OtpRateLimitTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite+pysqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.SessionLocal = sessionmaker(bind=cls.engine, autocommit=False, autoflush=False)
        Request.__table__.create(bind=cls.engine)
        OtpSession.__table__.create(bind=cls.engine)

    @classmethod
    def tearDownClass(cls):
        OtpSession.__table__.drop(bind=cls.engine)
        Request.__table__.drop(bind=cls.engine)
        cls.engine.dispose()

    def setUp(self):
        with self.SessionLocal() as db:
            db.execute(delete(OtpSession))
            db.execute(delete(Request))
            db.commit()

            db.add(
                Request(
                    track_number="TRK-OTP-RATE",
                    client_name="Тест",
                    client_phone="+79995550000",
                    topic_code="consulting",
                    status_code="NEW",
                    description="otp rate",
                    extra_fields={},
                )
            )
            db.commit()

        def override_get_db():
            db = self.SessionLocal()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(app)
        self.limiter = InMemoryRateLimiter()

    def tearDown(self):
        self.client.close()
        app.dependency_overrides.clear()

    def test_send_is_limited_by_phone(self):
        with (
            patch("app.api.public.otp.get_rate_limiter", return_value=self.limiter),
            patch("app.api.public.otp.settings.OTP_RATE_LIMIT_WINDOW_SECONDS", 60),
            patch("app.api.public.otp.settings.OTP_SEND_RATE_LIMIT", 1),
            patch("app.api.public.otp._generate_code", return_value="111111"),
        ):
            first = self.client.post(
                "/api/public/otp/send",
                json={"purpose": "CREATE_REQUEST", "client_phone": "+79991110000"},
            )
            self.assertEqual(first.status_code, 200)

            second = self.client.post(
                "/api/public/otp/send",
                json={"purpose": "CREATE_REQUEST", "client_phone": "+79991110000"},
            )
            self.assertEqual(second.status_code, 429)
            self.assertIn("Слишком много OTP-запросов", second.json().get("detail", ""))

    def test_send_is_limited_by_ip(self):
        with (
            patch("app.api.public.otp.get_rate_limiter", return_value=self.limiter),
            patch("app.api.public.otp.settings.OTP_RATE_LIMIT_WINDOW_SECONDS", 60),
            patch("app.api.public.otp.settings.OTP_SEND_RATE_LIMIT", 1),
            patch("app.api.public.otp._generate_code", return_value="111111"),
        ):
            first = self.client.post(
                "/api/public/otp/send",
                json={"purpose": "CREATE_REQUEST", "client_phone": "+79991110001"},
            )
            self.assertEqual(first.status_code, 200)

            # Same IP (testclient), other phone => blocked by IP bucket.
            second = self.client.post(
                "/api/public/otp/send",
                json={"purpose": "CREATE_REQUEST", "client_phone": "+79991110002"},
            )
            self.assertEqual(second.status_code, 429)

    def test_verify_is_limited(self):
        with (
            patch("app.api.public.otp.get_rate_limiter", return_value=self.limiter),
            patch("app.api.public.otp.settings.OTP_RATE_LIMIT_WINDOW_SECONDS", 60),
            patch("app.api.public.otp.settings.OTP_SEND_RATE_LIMIT", 10),
            patch("app.api.public.otp.settings.OTP_VERIFY_RATE_LIMIT", 1),
            patch("app.api.public.otp._generate_code", return_value="222222"),
        ):
            sent = self.client.post(
                "/api/public/otp/send",
                json={"purpose": "CREATE_REQUEST", "client_phone": "+79992220000"},
            )
            self.assertEqual(sent.status_code, 200)

            wrong_first = self.client.post(
                "/api/public/otp/verify",
                json={"purpose": "CREATE_REQUEST", "client_phone": "+79992220000", "code": "000000"},
            )
            self.assertEqual(wrong_first.status_code, 400)

            wrong_second = self.client.post(
                "/api/public/otp/verify",
                json={"purpose": "CREATE_REQUEST", "client_phone": "+79992220000", "code": "111111"},
            )
            self.assertEqual(wrong_second.status_code, 429)
            self.assertIn("Слишком много OTP-запросов", wrong_second.json().get("detail", ""))
