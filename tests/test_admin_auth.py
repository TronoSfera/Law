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
        }
        settings.ADMIN_BOOTSTRAP_ENABLED = True
        settings.ADMIN_BOOTSTRAP_EMAIL = "admin@example.com"
        settings.ADMIN_BOOTSTRAP_PASSWORD = "admin123"
        settings.ADMIN_BOOTSTRAP_NAME = "Администратор системы"

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
