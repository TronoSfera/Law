import os
import unittest
from uuid import UUID

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Ensure settings can be initialized in test environments
os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("S3_ENDPOINT", "http://localhost:9000")
os.environ.setdefault("S3_ACCESS_KEY", "test")
os.environ.setdefault("S3_SECRET_KEY", "test")
os.environ.setdefault("S3_BUCKET", "test")

from app.main import app
from app.db.session import get_db
from app.models.request import Request


class PublicRequestCreateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite+pysqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.SessionLocal = sessionmaker(bind=cls.engine, autocommit=False, autoflush=False)
        Request.__table__.create(bind=cls.engine)

    @classmethod
    def tearDownClass(cls):
        Request.__table__.drop(bind=cls.engine)
        cls.engine.dispose()

    def setUp(self):
        with self.SessionLocal() as db:
            db.execute(delete(Request))
            db.commit()

        def override_get_db():
            db = self.SessionLocal()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        app.dependency_overrides.clear()

    def test_create_request_persists_in_database(self):
        payload = {
            "client_name": "ООО Ромашка",
            "client_phone": "+79990000001",
            "topic_code": "consulting",
            "description": "Тестируем создание заявки",
            "extra_fields": {"referral_name": "Партнер"},
        }

        response = self.client.post("/api/public/requests", json=payload)

        self.assertEqual(response.status_code, 201)
        body = response.json()

        self.assertTrue(body["track_number"].startswith("TRK-"))
        self.assertTrue(body["otp_required"])
        self.assertIsNotNone(body["request_id"])

        request_id = UUID(body["request_id"])

        with self.SessionLocal() as db:
            created = db.get(Request, request_id)
            self.assertIsNotNone(created)
            self.assertEqual(created.client_name, payload["client_name"])
            self.assertEqual(created.client_phone, payload["client_phone"])
            self.assertEqual(created.topic_code, payload["topic_code"])
            self.assertEqual(created.description, payload["description"])
            self.assertEqual(created.extra_fields, payload["extra_fields"])
            self.assertEqual(created.status_code, "NEW")
            self.assertEqual(created.track_number, body["track_number"])
