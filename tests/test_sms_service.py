import os
import unittest

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
