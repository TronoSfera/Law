import os
import unittest
from datetime import timedelta
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("S3_ENDPOINT", "http://localhost:9000")
os.environ.setdefault("S3_ACCESS_KEY", "test")
os.environ.setdefault("S3_SECRET_KEY", "test")
os.environ.setdefault("S3_BUCKET", "test")

from app.main import app
from app.core.config import settings
from app.core.security import create_jwt


class SmsProviderHealthTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self._settings_backup = {
            "SMS_PROVIDER": settings.SMS_PROVIDER,
            "SMSAERO_EMAIL": settings.SMSAERO_EMAIL,
            "SMSAERO_API_KEY": settings.SMSAERO_API_KEY,
            "OTP_DEV_MODE": settings.OTP_DEV_MODE,
        }

    def tearDown(self):
        self.client.close()
        for key, value in self._settings_backup.items():
            setattr(settings, key, value)

    @staticmethod
    def _headers(role: str) -> dict[str, str]:
        token = create_jwt(
            {"sub": str(uuid4()), "email": f"{role.lower()}@example.com", "role": role},
            settings.ADMIN_JWT_SECRET,
            timedelta(minutes=30),
        )
        return {"Authorization": f"Bearer {token}"}

    def test_sms_provider_health_requires_admin(self):
        response = self.client.get("/api/admin/system/sms-provider-health", headers=self._headers("LAWYER"))
        self.assertEqual(response.status_code, 403)

    def test_sms_provider_health_dummy_mode(self):
        settings.SMS_PROVIDER = "dummy"
        response = self.client.get("/api/admin/system/sms-provider-health", headers=self._headers("ADMIN"))
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body.get("provider"), "dummy")
        self.assertEqual(body.get("status"), "ok")
        self.assertEqual(body.get("mode"), "mock")
        self.assertTrue(bool(body.get("can_send")))

    def test_sms_provider_health_smsaero_degraded_when_missing_credentials(self):
        settings.SMS_PROVIDER = "smsaero"
        settings.SMSAERO_EMAIL = ""
        settings.SMSAERO_API_KEY = ""
        with patch("app.services.sms_service._module_available", return_value=True):
            response = self.client.get("/api/admin/system/sms-provider-health", headers=self._headers("ADMIN"))
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body.get("provider"), "smsaero")
        self.assertEqual(body.get("status"), "degraded")
        self.assertFalse(bool(body.get("can_send")))
        checks = body.get("checks") or {}
        self.assertTrue(bool(checks.get("smsaero_installed")))
        self.assertFalse(bool(checks.get("email_configured")))
        self.assertFalse(bool(checks.get("api_key_configured")))

    def test_sms_provider_health_smsaero_ok_when_configured(self):
        settings.SMS_PROVIDER = "smsaero"
        settings.SMSAERO_EMAIL = "test@example.com"
        settings.SMSAERO_API_KEY = "key"
        with (
            patch("app.services.sms_service._module_available", return_value=True),
            patch("app.services.sms_service._get_sms_aero_balance", return_value=(43.51, {"balance": 43.51}, None)),
        ):
            response = self.client.get("/api/admin/system/sms-provider-health", headers=self._headers("ADMIN"))
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body.get("provider"), "smsaero")
        self.assertEqual(body.get("status"), "ok")
        self.assertTrue(bool(body.get("can_send")))
        self.assertTrue(bool(body.get("balance_available")))
        self.assertEqual(float(body.get("balance_amount") or 0), 43.51)

    def test_sms_provider_health_smsaero_degraded_when_balance_unavailable(self):
        settings.SMS_PROVIDER = "smsaero"
        settings.SMSAERO_EMAIL = "test@example.com"
        settings.SMSAERO_API_KEY = "key"
        with (
            patch("app.services.sms_service._module_available", return_value=True),
            patch("app.services.sms_service._get_sms_aero_balance", return_value=(None, None, "network error")),
        ):
            response = self.client.get("/api/admin/system/sms-provider-health", headers=self._headers("ADMIN"))
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body.get("provider"), "smsaero")
        self.assertEqual(body.get("status"), "degraded")
        self.assertTrue(bool(body.get("can_send")))
        self.assertFalse(bool(body.get("balance_available")))
        issues = body.get("issues") or []
        self.assertTrue(any("network error" in str(item) for item in issues))

    def test_sms_provider_health_unknown_provider(self):
        settings.SMS_PROVIDER = "unknown-provider"
        response = self.client.get("/api/admin/system/sms-provider-health", headers=self._headers("ADMIN"))
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body.get("status"), "error")
        self.assertFalse(bool(body.get("can_send")))

    def test_sms_provider_health_dev_mode_forces_mock(self):
        settings.SMS_PROVIDER = "smsaero"
        settings.SMSAERO_EMAIL = ""
        settings.SMSAERO_API_KEY = ""
        settings.OTP_DEV_MODE = True
        response = self.client.get("/api/admin/system/sms-provider-health", headers=self._headers("ADMIN"))
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body.get("status"), "ok")
        self.assertEqual(body.get("mode"), "mock")
        self.assertTrue(bool(body.get("dev_mode")))
        self.assertEqual(body.get("effective_provider"), "mock_sms")
