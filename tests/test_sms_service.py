import os
import unittest
from unittest.mock import patch

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("S3_ENDPOINT", "http://localhost:9000")
os.environ.setdefault("S3_ACCESS_KEY", "test")
os.environ.setdefault("S3_SECRET_KEY", "test")
os.environ.setdefault("S3_BUCKET", "test")

from app.core.config import settings
from app.services.sms_service import SmsDeliveryError, send_otp_message


class SmsServiceTests(unittest.TestCase):
    def setUp(self):
        self._settings_backup = {
            "SMS_PROVIDER": settings.SMS_PROVIDER,
            "SMSAERO_EMAIL": settings.SMSAERO_EMAIL,
            "SMSAERO_API_KEY": settings.SMSAERO_API_KEY,
            "OTP_DEV_MODE": settings.OTP_DEV_MODE,
            "OTP_AUTOTEST_FORCE_MOCK_SMS": settings.OTP_AUTOTEST_FORCE_MOCK_SMS,
        }

    def tearDown(self):
        for key, value in self._settings_backup.items():
            setattr(settings, key, value)

    def test_dev_mode_forces_mock_send(self):
        settings.SMS_PROVIDER = "smsaero"
        settings.SMSAERO_EMAIL = ""
        settings.SMSAERO_API_KEY = ""
        settings.OTP_DEV_MODE = True
        payload = send_otp_message(phone="+79990000000", code="111111", purpose="CREATE_REQUEST")
        self.assertEqual(payload.get("provider"), "mock_sms")
        self.assertTrue(bool(payload.get("dev_mode")))
        self.assertEqual(payload.get("debug_code"), "111111")

    def test_unknown_provider_raises(self):
        settings.SMS_PROVIDER = "unknown"
        settings.OTP_DEV_MODE = False
        with self.assertRaises(SmsDeliveryError):
            send_otp_message(phone="+79990000000", code="111111", purpose="CREATE_REQUEST")

    def test_autotest_context_forces_mock_for_real_provider(self):
        settings.SMS_PROVIDER = "smsaero"
        settings.SMSAERO_EMAIL = "prod@example.com"
        settings.SMSAERO_API_KEY = "real-key"
        settings.OTP_DEV_MODE = False
        settings.OTP_AUTOTEST_FORCE_MOCK_SMS = True
        with (
            patch("app.services.sms_service._is_automated_test_context", return_value=True),
            patch("app.services.sms_service._send_sms_aero") as send_real,
        ):
            payload = send_otp_message(phone="+79990000000", code="222222", purpose="CREATE_REQUEST")
        send_real.assert_not_called()
        self.assertEqual(payload.get("provider"), "mock_sms")
        self.assertTrue(bool(payload.get("autotest_forced_mock")))
        self.assertEqual(payload.get("debug_code"), "222222")
