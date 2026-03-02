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
from app.services.s3_storage import S3Storage


class S3TlsConfigTests(unittest.TestCase):
    def setUp(self):
        self._backup = {
            "S3_ENDPOINT": settings.S3_ENDPOINT,
            "S3_ACCESS_KEY": settings.S3_ACCESS_KEY,
            "S3_SECRET_KEY": settings.S3_SECRET_KEY,
            "S3_BUCKET": settings.S3_BUCKET,
            "S3_REGION": settings.S3_REGION,
            "S3_USE_SSL": settings.S3_USE_SSL,
            "S3_VERIFY_SSL": settings.S3_VERIFY_SSL,
            "S3_CA_CERT_PATH": settings.S3_CA_CERT_PATH,
        }

    def tearDown(self):
        for key, value in self._backup.items():
            setattr(settings, key, value)

    def test_s3_client_uses_ca_bundle_for_verify(self):
        settings.S3_ENDPOINT = "https://minio:9000"
        settings.S3_ACCESS_KEY = "k"
        settings.S3_SECRET_KEY = "s"
        settings.S3_BUCKET = "b"
        settings.S3_REGION = "us-east-1"
        settings.S3_USE_SSL = True
        settings.S3_VERIFY_SSL = True
        settings.S3_CA_CERT_PATH = "/etc/ssl/minio/ca.crt"

        with patch("app.services.s3_storage.boto3.client") as boto_client:
            S3Storage()

        kwargs = dict(boto_client.call_args.kwargs)
        self.assertTrue(kwargs.get("use_ssl"))
        self.assertEqual(kwargs.get("verify"), "/etc/ssl/minio/ca.crt")

    def test_s3_client_can_disable_verify_in_non_prod(self):
        settings.S3_ENDPOINT = "https://minio:9000"
        settings.S3_ACCESS_KEY = "k"
        settings.S3_SECRET_KEY = "s"
        settings.S3_BUCKET = "b"
        settings.S3_REGION = "us-east-1"
        settings.S3_USE_SSL = True
        settings.S3_VERIFY_SSL = False
        settings.S3_CA_CERT_PATH = ""

        with patch("app.services.s3_storage.boto3.client") as boto_client:
            S3Storage()

        kwargs = dict(boto_client.call_args.kwargs)
        self.assertTrue(kwargs.get("use_ssl"))
        self.assertFalse(kwargs.get("verify"))
