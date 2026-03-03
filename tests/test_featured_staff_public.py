import os
import unittest
from unittest.mock import patch

from botocore.exceptions import ClientError
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

from app.db.session import get_db
from app.main import app
from app.models.admin_user import AdminUser
from app.models.landing_featured_staff import LandingFeaturedStaff
from app.models.topic import Topic


class _FakeBody:
    def __init__(self, payload: bytes):
        self.payload = payload

    def iter_chunks(self, chunk_size=65536):
        for i in range(0, len(self.payload), chunk_size):
            yield self.payload[i : i + chunk_size]


class _FakeS3Storage:
    def __init__(self):
        self.objects = {}

    def get_object(self, key: str) -> dict:
        obj = self.objects.get(key)
        if obj is None:
            raise ClientError({"Error": {"Code": "404", "Message": "Not Found"}}, "GetObject")
        return {"Body": _FakeBody(obj["content"]), "ContentType": obj["mime"], "ContentLength": obj["size"]}


class FeaturedStaffPublicTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite+pysqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.SessionLocal = sessionmaker(bind=cls.engine, autocommit=False, autoflush=False)
        AdminUser.__table__.create(bind=cls.engine)
        Topic.__table__.create(bind=cls.engine)
        LandingFeaturedStaff.__table__.create(bind=cls.engine)

    @classmethod
    def tearDownClass(cls):
        LandingFeaturedStaff.__table__.drop(bind=cls.engine)
        Topic.__table__.drop(bind=cls.engine)
        AdminUser.__table__.drop(bind=cls.engine)
        cls.engine.dispose()

    def setUp(self):
        with self.SessionLocal() as db:
            db.execute(delete(LandingFeaturedStaff))
            db.execute(delete(Topic))
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

    def tearDown(self):
        self.client.close()
        app.dependency_overrides.clear()

    def _seed_featured_lawyer(self, enabled: bool = True):
        with self.SessionLocal() as db:
            topic = Topic(code="consulting", name="consulting", enabled=True, sort_order=1)
            user = AdminUser(
                role="LAWYER",
                name="Юрист",
                email="lawyer-featured@example.com",
                password_hash="hash",
                is_active=True,
                primary_topic_code="consulting",
            )
            db.add_all([topic, user])
            db.flush()
            avatar_key = f"avatars/{user.id}/avatar.webp"
            user.avatar_url = "s3://" + avatar_key
            slot = LandingFeaturedStaff(
                admin_user_id=user.id,
                caption="Я крут!",
                sort_order=10,
                pinned=True,
                enabled=enabled,
            )
            db.add(slot)
            db.commit()
            return str(user.id), avatar_key

    def test_list_featured_staff_returns_public_avatar_proxy_url(self):
        user_id, _ = self._seed_featured_lawyer(enabled=True)

        response = self.client.get("/api/public/featured-staff?limit=24")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload.get("total"), 1)
        self.assertEqual(len(payload.get("items") or []), 1)
        row = payload["items"][0]
        self.assertEqual(row.get("admin_user_id"), user_id)
        self.assertEqual(row.get("avatar_url"), "/api/public/featured-staff/avatar/" + user_id)

    def test_featured_staff_avatar_proxy_streams_s3_avatar(self):
        user_id, avatar_key = self._seed_featured_lawyer(enabled=True)
        fake_s3 = _FakeS3Storage()
        fake_s3.objects[avatar_key] = {
            "size": 7,
            "mime": "image/webp",
            "content": b"webpimg",
        }

        with patch("app.api.public.featured_staff.get_s3_storage", return_value=fake_s3):
            response = self.client.get("/api/public/featured-staff/avatar/" + user_id)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b"webpimg")
        self.assertIn("image/webp", response.headers.get("content-type", ""))

    def test_featured_staff_avatar_proxy_denies_non_featured_user(self):
        user_id, avatar_key = self._seed_featured_lawyer(enabled=False)
        fake_s3 = _FakeS3Storage()
        fake_s3.objects[avatar_key] = {
            "size": 7,
            "mime": "image/webp",
            "content": b"webpimg",
        }

        with patch("app.api.public.featured_staff.get_s3_storage", return_value=fake_s3):
            response = self.client.get("/api/public/featured-staff/avatar/" + user_id)

        self.assertEqual(response.status_code, 404)
