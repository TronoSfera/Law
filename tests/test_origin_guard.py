import os
import unittest

from fastapi import HTTPException
from starlette.requests import Request

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("S3_ENDPOINT", "http://localhost:9000")
os.environ.setdefault("S3_ACCESS_KEY", "test")
os.environ.setdefault("S3_SECRET_KEY", "test")
os.environ.setdefault("S3_BUCKET", "test")

from app.core.config import settings
from app.services.origin_guard import enforce_public_origin_or_403


def _request_with_headers(headers: dict[str, str]) -> Request:
    raw_headers = [(str(k).lower().encode("latin-1"), str(v).encode("latin-1")) for k, v in headers.items()]
    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": "POST",
        "scheme": "https",
        "path": "/api/public/otp/send",
        "query_string": b"",
        "headers": raw_headers,
        "client": ("127.0.0.1", 52000),
        "server": ("testserver", 443),
    }
    return Request(scope)


class OriginGuardTests(unittest.TestCase):
    def setUp(self):
        self._backup = {
            "APP_ENV": settings.APP_ENV,
            "PUBLIC_STRICT_ORIGIN_CHECK": settings.PUBLIC_STRICT_ORIGIN_CHECK,
            "PUBLIC_ALLOWED_WEB_ORIGINS": settings.PUBLIC_ALLOWED_WEB_ORIGINS,
        }
        settings.APP_ENV = "production"
        settings.PUBLIC_STRICT_ORIGIN_CHECK = True
        settings.PUBLIC_ALLOWED_WEB_ORIGINS = "https://ruakb.ru,https://www.ruakb.ru"

    def tearDown(self):
        for key, value in self._backup.items():
            setattr(settings, key, value)

    def test_allows_whitelisted_origin(self):
        request = _request_with_headers({"origin": "https://ruakb.ru"})
        enforce_public_origin_or_403(request, endpoint="/api/public/otp/send")

    def test_rejects_missing_origin_and_referer(self):
        request = _request_with_headers({})
        with self.assertRaises(HTTPException) as exc:
            enforce_public_origin_or_403(request, endpoint="/api/public/otp/send")
        self.assertEqual(exc.exception.status_code, 403)

    def test_rejects_cross_site_fetch_metadata(self):
        request = _request_with_headers(
            {
                "origin": "https://ruakb.ru",
                "sec-fetch-site": "cross-site",
            }
        )
        with self.assertRaises(HTTPException) as exc:
            enforce_public_origin_or_403(request, endpoint="/api/public/otp/send")
        self.assertEqual(exc.exception.status_code, 403)

    def test_allows_referer_when_origin_missing(self):
        request = _request_with_headers({"referer": "https://www.ruakb.ru/landing"})
        enforce_public_origin_or_403(request, endpoint="/api/public/otp/send")

    def test_can_disable_check(self):
        settings.PUBLIC_STRICT_ORIGIN_CHECK = False
        request = _request_with_headers({})
        enforce_public_origin_or_403(request, endpoint="/api/public/otp/send")


if __name__ == "__main__":
    unittest.main()
