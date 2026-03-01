import os
import unittest

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

from app.core.config import settings
from app.core.security import decode_jwt, hash_password
from app.db.session import get_db
from app.main import app
from app.models.admin_user import AdminUser
from app.services.totp_service import (
    current_totp_code,
    encrypt_totp_secret,
    generate_backup_codes,
    generate_totp_secret,
)


class AdminAuthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite+pysqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.SessionLocal = sessionmaker(bind=cls.engine, autocommit=False, autoflush=False)
        AdminUser.__table__.create(bind=cls.engine)

    @classmethod
    def tearDownClass(cls):
        AdminUser.__table__.drop(bind=cls.engine)
        cls.engine.dispose()

    def setUp(self):
        with self.SessionLocal() as db:
            db.execute(delete(AdminUser))
            db.commit()

        def override_get_db():
            db = self.SessionLocal()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(app)

        self._settings_backup = {
            "ADMIN_BOOTSTRAP_ENABLED": settings.ADMIN_BOOTSTRAP_ENABLED,
            "ADMIN_BOOTSTRAP_EMAIL": settings.ADMIN_BOOTSTRAP_EMAIL,
            "ADMIN_BOOTSTRAP_PASSWORD": settings.ADMIN_BOOTSTRAP_PASSWORD,
            "ADMIN_BOOTSTRAP_NAME": settings.ADMIN_BOOTSTRAP_NAME,
            "ADMIN_AUTH_MODE": settings.ADMIN_AUTH_MODE,
        }
        settings.ADMIN_BOOTSTRAP_ENABLED = True
        settings.ADMIN_BOOTSTRAP_EMAIL = "admin@example.com"
        settings.ADMIN_BOOTSTRAP_PASSWORD = "admin123"
        settings.ADMIN_BOOTSTRAP_NAME = "Администратор системы"
        settings.ADMIN_AUTH_MODE = "password_totp_optional"

    def tearDown(self):
        self.client.close()
        app.dependency_overrides.clear()
        for key, value in self._settings_backup.items():
            setattr(settings, key, value)

    def test_login_bootstraps_admin_when_absent(self):
        response = self.client.post(
            "/api/admin/auth/login",
            json={"email": "admin@example.com", "password": "admin123"},
        )
        self.assertEqual(response.status_code, 200)
        token = response.json().get("access_token")
        self.assertTrue(token)

        claims = decode_jwt(token, settings.ADMIN_JWT_SECRET)
        self.assertEqual(claims.get("email"), "admin@example.com")
        self.assertEqual(claims.get("role"), "ADMIN")

        with self.SessionLocal() as db:
            row = db.query(AdminUser).filter(AdminUser.email == "admin@example.com").first()
            self.assertIsNotNone(row)
            self.assertEqual(row.role, "ADMIN")
            self.assertTrue(bool(row.is_active))

    def test_login_rejects_wrong_bootstrap_password(self):
        response = self.client.post(
            "/api/admin/auth/login",
            json={"email": "admin@example.com", "password": "wrong-password"},
        )
        self.assertEqual(response.status_code, 401)

        with self.SessionLocal() as db:
            count = db.query(AdminUser).count()
            self.assertEqual(count, 0)

    def test_existing_admin_is_normalized_to_bootstrap_credentials(self):
        with self.SessionLocal() as db:
            db.add(
                AdminUser(
                    role="ADMIN",
                    name="Администратор",
                    email="admin@example.com",
                    password_hash=hash_password("custom-pass-1"),
                    is_active=True,
                )
            )
            db.commit()

        ok = self.client.post(
            "/api/admin/auth/login",
            json={"email": "admin@example.com", "password": "admin123"},
        )
        self.assertEqual(ok.status_code, 200)
        self.assertTrue(ok.json().get("access_token"))

        wrong = self.client.post(
            "/api/admin/auth/login",
            json={"email": "admin@example.com", "password": "custom-pass-1"},
        )
        self.assertEqual(wrong.status_code, 401)

    def test_totp_required_mode_rejects_login_without_totp_code(self):
        settings.ADMIN_AUTH_MODE = "password_totp_required"
        secret = generate_totp_secret()
        with self.SessionLocal() as db:
            db.add(
                AdminUser(
                    role="ADMIN",
                    name="TOTP Admin",
                    email="totp@example.com",
                    password_hash=hash_password("pass123"),
                    is_active=True,
                    totp_enabled=True,
                    totp_secret_encrypted=encrypt_totp_secret(secret),
                    totp_backup_codes_hashes=[],
                )
            )
            db.commit()

        response = self.client.post(
            "/api/admin/auth/login",
            json={"email": "totp@example.com", "password": "pass123"},
        )
        self.assertEqual(response.status_code, 401)
        self.assertIn("TOTP", str(response.json().get("detail", "")))

    def test_totp_required_mode_allows_login_with_valid_totp(self):
        settings.ADMIN_AUTH_MODE = "password_totp_required"
        secret = generate_totp_secret()
        code = current_totp_code(secret)
        with self.SessionLocal() as db:
            db.add(
                AdminUser(
                    role="ADMIN",
                    name="TOTP Admin",
                    email="totp2@example.com",
                    password_hash=hash_password("pass123"),
                    is_active=True,
                    totp_enabled=True,
                    totp_secret_encrypted=encrypt_totp_secret(secret),
                    totp_backup_codes_hashes=[],
                )
            )
            db.commit()

        response = self.client.post(
            "/api/admin/auth/login",
            json={"email": "totp2@example.com", "password": "pass123", "totp_code": code},
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(bool(response.json().get("access_token")))

    def test_totp_backup_code_is_single_use(self):
        settings.ADMIN_AUTH_MODE = "password_totp_required"
        secret = generate_totp_secret()
        backup_plain, backup_hashes = generate_backup_codes()
        backup_code = backup_plain[0]
        with self.SessionLocal() as db:
            db.add(
                AdminUser(
                    role="ADMIN",
                    name="Backup Admin",
                    email="totp3@example.com",
                    password_hash=hash_password("pass123"),
                    is_active=True,
                    totp_enabled=True,
                    totp_secret_encrypted=encrypt_totp_secret(secret),
                    totp_backup_codes_hashes=backup_hashes,
                )
            )
            db.commit()

        first = self.client.post(
            "/api/admin/auth/login",
            json={"email": "totp3@example.com", "password": "pass123", "backup_code": backup_code},
        )
        self.assertEqual(first.status_code, 200)

        second = self.client.post(
            "/api/admin/auth/login",
            json={"email": "totp3@example.com", "password": "pass123", "backup_code": backup_code},
        )
        self.assertEqual(second.status_code, 401)

    def test_totp_setup_enable_and_status_flow(self):
        login = self.client.post(
            "/api/admin/auth/login",
            json={"email": "admin@example.com", "password": "admin123"},
        )
        self.assertEqual(login.status_code, 200)
        token = login.json().get("access_token")
        self.assertTrue(token)
        headers = {"Authorization": "Bearer " + token}

        setup = self.client.post("/api/admin/auth/totp/setup", json={}, headers=headers)
        self.assertEqual(setup.status_code, 200)
        setup_body = setup.json()
        secret = str(setup_body.get("secret") or "")
        self.assertTrue(secret)
        self.assertIn("otpauth://totp/", str(setup_body.get("otpauth_uri") or ""))

        code = current_totp_code(secret)
        enable = self.client.post(
            "/api/admin/auth/totp/enable",
            json={"secret": secret, "code": code},
            headers=headers,
        )
        self.assertEqual(enable.status_code, 200)
        backup_codes = enable.json().get("backup_codes") or []
        self.assertTrue(isinstance(backup_codes, list) and len(backup_codes) > 0)

        status = self.client.get("/api/admin/auth/totp/status", headers=headers)
        self.assertEqual(status.status_code, 200)
        self.assertTrue(bool(status.json().get("enabled")))
