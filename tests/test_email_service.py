import os
import unittest
from unittest.mock import Mock, patch

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("S3_ENDPOINT", "http://localhost:9000")
os.environ.setdefault("S3_ACCESS_KEY", "test")
os.environ.setdefault("S3_SECRET_KEY", "test")
os.environ.setdefault("S3_BUCKET", "test")

from app.core.config import settings
from app.services.email_service import EmailDeliveryError, send_otp_email_message


class EmailServiceTests(unittest.TestCase):
    def setUp(self):
        self._backup = {
            "EMAIL_PROVIDER": settings.EMAIL_PROVIDER,
            "EMAIL_SERVICE_URL": settings.EMAIL_SERVICE_URL,
            "INTERNAL_SERVICE_TOKEN": settings.INTERNAL_SERVICE_TOKEN,
            "OTP_DEV_MODE": settings.OTP_DEV_MODE,
        }

    def tearDown(self):
        for key, value in self._backup.items():
            setattr(settings, key, value)

    def test_dev_mode_forces_mock_send(self):
        settings.EMAIL_PROVIDER = "smtp"
        settings.OTP_DEV_MODE = True
        payload = send_otp_email_message(email="user@example.com", code="123456", purpose="CREATE_REQUEST")
        self.assertEqual(payload.get("provider"), "mock_email")
        self.assertTrue(bool(payload.get("dev_mode")))
        self.assertEqual(payload.get("debug_code"), "123456")

    def test_service_provider_calls_internal_email_service(self):
        settings.OTP_DEV_MODE = False
        settings.EMAIL_PROVIDER = "service"
        settings.EMAIL_SERVICE_URL = "http://email-service:8010"
        settings.INTERNAL_SERVICE_TOKEN = "token"

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.content = b'{"status":"sent"}'
        mock_response.json.return_value = {"status": "sent"}

        mock_client = Mock()
        mock_client.__enter__ = Mock(return_value=mock_client)
        mock_client.__exit__ = Mock(return_value=False)
        mock_client.post.return_value = mock_response

        with patch("app.services.email_service.httpx.Client", return_value=mock_client):
            payload = send_otp_email_message(email="user@example.com", code="654321", purpose="VIEW_REQUEST")
        self.assertEqual(payload.get("provider"), "email-service")
        self.assertTrue(bool(payload.get("sent")))

    def test_unknown_provider_raises(self):
        settings.OTP_DEV_MODE = False
        settings.EMAIL_PROVIDER = "unknown"
        with self.assertRaises(EmailDeliveryError):
            send_otp_email_message(email="user@example.com", code="111111", purpose="CREATE_REQUEST")
