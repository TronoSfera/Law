import os
import unittest

from fastapi.testclient import TestClient

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("S3_ENDPOINT", "http://localhost:9000")
os.environ.setdefault("S3_ACCESS_KEY", "test")
os.environ.setdefault("S3_SECRET_KEY", "test")
os.environ.setdefault("S3_BUCKET", "test")

from app.main import app


class HttpHardeningTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()

    def test_health_has_security_headers_and_request_id(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)

        self.assertEqual(response.headers.get("x-content-type-options"), "nosniff")
        self.assertEqual(response.headers.get("x-frame-options"), "DENY")
        self.assertEqual(response.headers.get("referrer-policy"), "no-referrer")
        self.assertEqual(response.headers.get("x-permitted-cross-domain-policies"), "none")
        self.assertEqual(response.headers.get("cross-origin-opener-policy"), "same-origin")

        request_id = response.headers.get("x-request-id")
        self.assertIsNotNone(request_id)
        self.assertRegex(str(request_id), r"^[A-Za-z0-9._-]{1,128}$")

    def test_valid_request_id_is_preserved(self):
        external_request_id = "release-check-2026_02_23"
        response = self.client.get("/health", headers={"X-Request-ID": external_request_id})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("x-request-id"), external_request_id)

    def test_invalid_request_id_is_replaced(self):
        bad_request_id = "bad id with spaces"
        response = self.client.get("/health", headers={"X-Request-ID": bad_request_id})
        self.assertEqual(response.status_code, 200)

        response_request_id = response.headers.get("x-request-id")
        self.assertIsNotNone(response_request_id)
        self.assertNotEqual(response_request_id, bad_request_id)
        self.assertRegex(str(response_request_id), r"^[A-Za-z0-9._-]{1,128}$")

    def test_error_response_keeps_security_headers_and_request_id(self):
        # No public cookie => 401 from dependency, middleware headers must still be present.
        response = self.client.get("/api/public/requests/TRK-UNKNOWN")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.headers.get("x-content-type-options"), "nosniff")
        self.assertEqual(response.headers.get("x-frame-options"), "DENY")
        self.assertTrue(bool(response.headers.get("x-request-id")))
