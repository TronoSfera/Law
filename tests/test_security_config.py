import os
import unittest

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("S3_ENDPOINT", "http://localhost:9000")
os.environ.setdefault("S3_ACCESS_KEY", "test")
os.environ.setdefault("S3_SECRET_KEY", "test")
os.environ.setdefault("S3_BUCKET", "test")

from app.core.config import settings, validate_production_security_or_raise


class SecurityConfigTests(unittest.TestCase):
    def setUp(self):
        self._backup = {
            "APP_ENV": settings.APP_ENV,
            "PRODUCTION_ENFORCE_SECURE_SETTINGS": settings.PRODUCTION_ENFORCE_SECURE_SETTINGS,
            "OTP_DEV_MODE": settings.OTP_DEV_MODE,
            "ADMIN_BOOTSTRAP_ENABLED": settings.ADMIN_BOOTSTRAP_ENABLED,
            "PUBLIC_COOKIE_SECURE": settings.PUBLIC_COOKIE_SECURE,
            "PUBLIC_COOKIE_SAMESITE": settings.PUBLIC_COOKIE_SAMESITE,
            "ADMIN_JWT_SECRET": settings.ADMIN_JWT_SECRET,
            "PUBLIC_JWT_SECRET": settings.PUBLIC_JWT_SECRET,
            "DATA_ENCRYPTION_SECRET": settings.DATA_ENCRYPTION_SECRET,
            "DATA_ENCRYPTION_ACTIVE_KID": settings.DATA_ENCRYPTION_ACTIVE_KID,
            "DATA_ENCRYPTION_KEYS": settings.DATA_ENCRYPTION_KEYS,
            "CHAT_ENCRYPTION_SECRET": settings.CHAT_ENCRYPTION_SECRET,
            "CHAT_ENCRYPTION_ACTIVE_KID": settings.CHAT_ENCRYPTION_ACTIVE_KID,
            "CHAT_ENCRYPTION_KEYS": settings.CHAT_ENCRYPTION_KEYS,
            "INTERNAL_SERVICE_TOKEN": settings.INTERNAL_SERVICE_TOKEN,
            "MINIO_ROOT_USER": settings.MINIO_ROOT_USER,
            "MINIO_ROOT_PASSWORD": settings.MINIO_ROOT_PASSWORD,
            "MINIO_TLS_ENABLED": settings.MINIO_TLS_ENABLED,
            "S3_USE_SSL": settings.S3_USE_SSL,
            "S3_VERIFY_SSL": settings.S3_VERIFY_SSL,
            "S3_ENDPOINT": settings.S3_ENDPOINT,
            "S3_CA_CERT_PATH": settings.S3_CA_CERT_PATH,
            "PUBLIC_STRICT_ORIGIN_CHECK": settings.PUBLIC_STRICT_ORIGIN_CHECK,
            "PUBLIC_ALLOWED_WEB_ORIGINS": settings.PUBLIC_ALLOWED_WEB_ORIGINS,
            "CORS_ORIGINS": settings.CORS_ORIGINS,
            "CORS_ALLOW_METHODS": settings.CORS_ALLOW_METHODS,
            "CORS_ALLOW_HEADERS": settings.CORS_ALLOW_HEADERS,
        }

    def tearDown(self):
        for key, value in self._backup.items():
            setattr(settings, key, value)

    def test_validate_production_security_detects_insecure_values(self):
        settings.APP_ENV = "prod"
        settings.PRODUCTION_ENFORCE_SECURE_SETTINGS = True
        settings.OTP_DEV_MODE = True
        settings.ADMIN_BOOTSTRAP_ENABLED = True
        settings.PUBLIC_COOKIE_SECURE = False
        settings.ADMIN_JWT_SECRET = "change_me_admin"
        settings.PUBLIC_JWT_SECRET = "change_me_public"
        settings.DATA_ENCRYPTION_SECRET = "change_me_data_encryption"
        settings.DATA_ENCRYPTION_ACTIVE_KID = ""
        settings.DATA_ENCRYPTION_KEYS = ""
        settings.CHAT_ENCRYPTION_SECRET = ""
        settings.CHAT_ENCRYPTION_ACTIVE_KID = ""
        settings.CHAT_ENCRYPTION_KEYS = ""
        settings.INTERNAL_SERVICE_TOKEN = "change_me_internal_service_token"
        settings.MINIO_ROOT_USER = "minioadmin"
        settings.MINIO_ROOT_PASSWORD = "minioadmin"
        settings.MINIO_TLS_ENABLED = False
        settings.S3_USE_SSL = False
        settings.S3_VERIFY_SSL = False
        settings.S3_ENDPOINT = "http://minio:9000"
        settings.S3_CA_CERT_PATH = ""
        settings.PUBLIC_STRICT_ORIGIN_CHECK = True
        settings.PUBLIC_ALLOWED_WEB_ORIGINS = "http://localhost:8080,https://ruakb.ru"
        settings.CORS_ORIGINS = "*,http://localhost:8081"
        settings.CORS_ALLOW_METHODS = "GET,POST,*"
        settings.CORS_ALLOW_HEADERS = "Authorization,*"

        with self.assertRaises(RuntimeError) as exc:
            validate_production_security_or_raise("test")
        detail = str(exc.exception)
        self.assertIn("OTP_DEV_MODE", detail)
        self.assertIn("ADMIN_BOOTSTRAP_ENABLED", detail)
        self.assertIn("MINIO_ROOT_USER", detail)
        self.assertIn("MINIO_TLS_ENABLED", detail)
        self.assertIn("S3_USE_SSL", detail)
        self.assertIn("S3_VERIFY_SSL", detail)
        self.assertIn("S3_ENDPOINT", detail)
        self.assertIn("S3_CA_CERT_PATH", detail)
        self.assertIn("DATA_ENCRYPTION_ACTIVE_KID", detail)
        self.assertIn("PUBLIC_ALLOWED_WEB_ORIGINS", detail)
        self.assertIn("CORS_ORIGINS", detail)
        self.assertIn("CORS_ALLOW_METHODS", detail)
        self.assertIn("CORS_ALLOW_HEADERS", detail)

    def test_validate_production_security_passes_for_hardened_values(self):
        settings.APP_ENV = "production"
        settings.PRODUCTION_ENFORCE_SECURE_SETTINGS = True
        settings.OTP_DEV_MODE = False
        settings.ADMIN_BOOTSTRAP_ENABLED = False
        settings.PUBLIC_COOKIE_SECURE = True
        settings.PUBLIC_COOKIE_SAMESITE = "lax"
        settings.ADMIN_JWT_SECRET = "AdminJwtSecret_2026_Strong_Long"
        settings.PUBLIC_JWT_SECRET = "PublicJwtSecret_2026_Strong_Long"
        settings.DATA_ENCRYPTION_SECRET = "DataEncryptionSecret_2026_Strong_Long"
        settings.DATA_ENCRYPTION_ACTIVE_KID = "k202603"
        settings.DATA_ENCRYPTION_KEYS = "k202603=DataEncryptionSecret_2026_Strong_Long"
        settings.CHAT_ENCRYPTION_SECRET = "ChatEncryptionSecret_2026_Strong_Long"
        settings.CHAT_ENCRYPTION_ACTIVE_KID = "k202603"
        settings.CHAT_ENCRYPTION_KEYS = "k202603=ChatEncryptionSecret_2026_Strong_Long"
        settings.INTERNAL_SERVICE_TOKEN = "InternalServiceToken_2026_Strong_Long"
        settings.MINIO_ROOT_USER = "law_prod_minio_user"
        settings.MINIO_ROOT_PASSWORD = "LawProdMinioSecretKey_2026_Strong"
        settings.MINIO_TLS_ENABLED = True
        settings.S3_USE_SSL = True
        settings.S3_VERIFY_SSL = True
        settings.S3_ENDPOINT = "https://minio:9000"
        settings.S3_CA_CERT_PATH = "/etc/ssl/minio/ca.crt"
        settings.PUBLIC_STRICT_ORIGIN_CHECK = True
        settings.PUBLIC_ALLOWED_WEB_ORIGINS = "https://ruakb.ru,https://www.ruakb.ru,https://ruakb.online"
        settings.CORS_ORIGINS = "https://ruakb.ru,https://www.ruakb.ru,https://ruakb.online,https://www.ruakb.online"
        settings.CORS_ALLOW_METHODS = "GET,POST,PUT,PATCH,DELETE,OPTIONS"
        settings.CORS_ALLOW_HEADERS = "Authorization,Content-Type,X-Requested-With,X-Request-ID"

        validate_production_security_or_raise("test")
