import os
import unittest
from datetime import timedelta
from uuid import UUID, uuid4
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

from app.core.config import settings
from app.core.security import create_jwt
from app.db.session import get_db
from app.main import app
from app.models.admin_user import AdminUser
from app.models.attachment import Attachment
from app.models.message import Message
from app.models.notification import Notification
from app.models.request import Request


class _FakeBody:
    def __init__(self, payload: bytes):
        self.payload = payload

    def iter_chunks(self, chunk_size=65536):
        for i in range(0, len(self.payload), chunk_size):
            yield self.payload[i : i + chunk_size]


class _FakeS3Storage:
    def __init__(self):
        self.objects = {}

    def create_presigned_put_url(self, key: str, mime_type: str, expires_sec: int = 900) -> str:
        return f"https://s3.local/{key}?expires={expires_sec}"

    def head_object(self, key: str) -> dict:
        obj = self.objects.get(key)
        if obj is None:
            raise ClientError({"Error": {"Code": "404", "Message": "Not Found"}}, "HeadObject")
        return {"ContentLength": obj["size"], "ContentType": obj["mime"]}

    def get_object(self, key: str) -> dict:
        obj = self.objects.get(key)
        if obj is None:
            raise ClientError({"Error": {"Code": "404", "Message": "Not Found"}}, "GetObject")
        return {"Body": _FakeBody(obj["content"]), "ContentType": obj["mime"], "ContentLength": obj["size"]}


class UploadsS3Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite+pysqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.SessionLocal = sessionmaker(bind=cls.engine, autocommit=False, autoflush=False)
        AdminUser.__table__.create(bind=cls.engine)
        Request.__table__.create(bind=cls.engine)
        Notification.__table__.create(bind=cls.engine)
        Message.__table__.create(bind=cls.engine)
        Attachment.__table__.create(bind=cls.engine)

    @classmethod
    def tearDownClass(cls):
        Attachment.__table__.drop(bind=cls.engine)
        Message.__table__.drop(bind=cls.engine)
        Notification.__table__.drop(bind=cls.engine)
        Request.__table__.drop(bind=cls.engine)
        AdminUser.__table__.drop(bind=cls.engine)
        cls.engine.dispose()

    def setUp(self):
        with self.SessionLocal() as db:
            db.execute(delete(Notification))
            db.execute(delete(Attachment))
            db.execute(delete(Message))
            db.execute(delete(Request))
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

    @staticmethod
    def _admin_headers(sub: str, role: str = "ADMIN", email: str = "admin@example.com") -> dict[str, str]:
        token = create_jwt(
            {"sub": sub, "email": email, "role": role},
            settings.ADMIN_JWT_SECRET,
            timedelta(minutes=30),
        )
        return {"Authorization": f"Bearer {token}"}

    def test_admin_avatar_upload_flow_updates_user_avatar_key(self):
        fake_s3 = _FakeS3Storage()
        with self.SessionLocal() as db:
            user = AdminUser(
                role="LAWYER",
                name="Юрист Аватар",
                email="avatar@example.com",
                password_hash="hash",
                is_active=True,
            )
            db.add(user)
            db.commit()
            user_id = str(user.id)

        headers = self._admin_headers(sub=user_id, role="LAWYER", email="avatar@example.com")
        with patch("app.api.admin.uploads.get_s3_storage", return_value=fake_s3):
            init_resp = self.client.post(
                "/api/admin/uploads/init",
                headers=headers,
                json={
                    "file_name": "photo.png",
                    "mime_type": "image/png",
                    "size_bytes": 2048,
                    "scope": "USER_AVATAR",
                    "user_id": user_id,
                },
            )
            self.assertEqual(init_resp.status_code, 200)
            key = init_resp.json()["key"]
            self.assertTrue(key.startswith("avatars/"))

            fake_s3.objects[key] = {"size": 2048, "mime": "image/png", "content": b"x" * 2048}
            done_resp = self.client.post(
                "/api/admin/uploads/complete",
                headers=headers,
                json={
                    "key": key,
                    "file_name": "photo.png",
                    "mime_type": "image/png",
                    "size_bytes": 2048,
                    "scope": "USER_AVATAR",
                    "user_id": user_id,
                },
            )
            self.assertEqual(done_resp.status_code, 200)
            self.assertEqual(done_resp.json()["avatar_url"], f"s3://{key}")

            token = headers["Authorization"].replace("Bearer ", "")
            view_resp = self.client.get(f"/api/admin/uploads/object/{key}?token={token}")
            self.assertEqual(view_resp.status_code, 200)
            self.assertEqual(view_resp.content, b"x" * 2048)

        with self.SessionLocal() as db:
            refreshed = db.get(AdminUser, UUID(user_id))
            self.assertIsNotNone(refreshed)
            self.assertEqual(refreshed.avatar_url, f"s3://{key}")

    def test_public_request_attachment_upload_flow_creates_attachment(self):
        fake_s3 = _FakeS3Storage()
        with self.SessionLocal() as db:
            req = Request(
                track_number="TRK-PUB-UPLOAD",
                client_name="Клиент",
                client_phone="+79991112233",
                topic_code="civil-law",
                status_code="NEW",
                extra_fields={},
                total_attachments_bytes=0,
            )
            db.add(req)
            db.commit()
            request_id = str(req.id)
            track = req.track_number

        public_token = create_jwt({"sub": track, "purpose": "VIEW_REQUEST"}, settings.PUBLIC_JWT_SECRET, timedelta(days=1))
        cookies = {settings.PUBLIC_COOKIE_NAME: public_token}

        with patch("app.api.public.uploads.get_s3_storage", return_value=fake_s3):
            init_resp = self.client.post(
                "/api/public/uploads/init",
                cookies=cookies,
                json={
                    "file_name": "contract.pdf",
                    "mime_type": "application/pdf",
                    "size_bytes": 4096,
                    "scope": "REQUEST_ATTACHMENT",
                    "request_id": request_id,
                },
            )
            self.assertEqual(init_resp.status_code, 200)
            key = init_resp.json()["key"]
            self.assertTrue(key.startswith("requests/"))

            fake_s3.objects[key] = {"size": 4096, "mime": "application/pdf", "content": b"p" * 4096}
            done_resp = self.client.post(
                "/api/public/uploads/complete",
                cookies=cookies,
                json={
                    "key": key,
                    "file_name": "contract.pdf",
                    "mime_type": "application/pdf",
                    "size_bytes": 4096,
                    "scope": "REQUEST_ATTACHMENT",
                    "request_id": request_id,
                },
            )
            self.assertEqual(done_resp.status_code, 200)
            self.assertTrue(done_resp.json().get("attachment_id"))

        with self.SessionLocal() as db:
            req = db.get(Request, UUID(request_id))
            self.assertIsNotNone(req)
            self.assertEqual(req.total_attachments_bytes, 4096)
            self.assertTrue(req.lawyer_has_unread_updates)
            self.assertEqual(req.lawyer_unread_event_type, "ATTACHMENT")
            rows = db.query(Attachment).filter(Attachment.request_id == UUID(request_id)).all()
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0].s3_key, key)

    def test_public_attachment_object_preview_returns_inline_response(self):
        fake_s3 = _FakeS3Storage()
        with self.SessionLocal() as db:
            req = Request(
                track_number="TRK-PUB-PREVIEW",
                client_name="Клиент",
                client_phone="+79994443322",
                topic_code="civil-law",
                status_code="IN_PROGRESS",
                extra_fields={},
            )
            db.add(req)
            db.flush()
            key = f"requests/{req.id}/preview.pdf"
            attachment = Attachment(
                request_id=req.id,
                file_name="preview.pdf",
                mime_type="application/pdf",
                size_bytes=1280,
                s3_key=key,
            )
            db.add(attachment)
            db.commit()
            attachment_id = str(attachment.id)
            track = req.track_number

        fake_s3.objects[key] = {"size": 1280, "mime": "application/pdf", "content": b"pdf-preview"}
        public_token = create_jwt({"sub": track, "purpose": "VIEW_REQUEST"}, settings.PUBLIC_JWT_SECRET, timedelta(days=1))
        cookies = {settings.PUBLIC_COOKIE_NAME: public_token}

        with patch("app.api.public.uploads.get_s3_storage", return_value=fake_s3):
            response = self.client.get(f"/api/public/uploads/object/{attachment_id}", cookies=cookies)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b"pdf-preview")
        self.assertIn("application/pdf", response.headers.get("content-type", ""))
        self.assertIn("inline;", response.headers.get("content-disposition", ""))

    def test_admin_request_attachment_upload_sets_client_unread_marker(self):
        fake_s3 = _FakeS3Storage()
        with self.SessionLocal() as db:
            lawyer = AdminUser(
                role="LAWYER",
                name="Юрист Загрузка",
                email="lawyer-upload@example.com",
                password_hash="hash",
                is_active=True,
            )
            db.add(lawyer)
            db.flush()
            req = Request(
                track_number="TRK-ADM-UPLOAD",
                client_name="Клиент",
                client_phone="+79995554433",
                topic_code="civil-law",
                status_code="IN_PROGRESS",
                extra_fields={},
                assigned_lawyer_id=str(lawyer.id),
                total_attachments_bytes=0,
            )
            db.add(req)
            db.commit()
            request_id = str(req.id)
            lawyer_id = str(lawyer.id)

        headers = self._admin_headers(sub=lawyer_id, role="LAWYER", email="lawyer-upload@example.com")
        with patch("app.api.admin.uploads.get_s3_storage", return_value=fake_s3):
            init_resp = self.client.post(
                "/api/admin/uploads/init",
                headers=headers,
                json={
                    "file_name": "evidence.pdf",
                    "mime_type": "application/pdf",
                    "size_bytes": 2048,
                    "scope": "REQUEST_ATTACHMENT",
                    "request_id": request_id,
                },
            )
            self.assertEqual(init_resp.status_code, 200)
            key = init_resp.json()["key"]
            fake_s3.objects[key] = {"size": 2048, "mime": "application/pdf", "content": b"x" * 2048}

            done_resp = self.client.post(
                "/api/admin/uploads/complete",
                headers=headers,
                json={
                    "key": key,
                    "file_name": "evidence.pdf",
                    "mime_type": "application/pdf",
                    "size_bytes": 2048,
                    "scope": "REQUEST_ATTACHMENT",
                    "request_id": request_id,
                },
            )
            self.assertEqual(done_resp.status_code, 200)

        with self.SessionLocal() as db:
            req = db.get(Request, UUID(request_id))
            self.assertIsNotNone(req)
            self.assertEqual(req.total_attachments_bytes, 2048)
            self.assertTrue(req.client_has_unread_updates)
            self.assertEqual(req.client_unread_event_type, "ATTACHMENT")

    def test_admin_upload_rejects_attachment_for_immutable_message(self):
        fake_s3 = _FakeS3Storage()
        with self.SessionLocal() as db:
            lawyer = AdminUser(
                role="LAWYER",
                name="Юрист Иммутабельный",
                email="lawyer-immutable@example.com",
                password_hash="hash",
                is_active=True,
            )
            db.add(lawyer)
            db.flush()
            req = Request(
                track_number="TRK-ADM-IMM-MSG",
                client_name="Клиент",
                client_phone="+79995554434",
                topic_code="civil-law",
                status_code="IN_PROGRESS",
                extra_fields={},
                assigned_lawyer_id=str(lawyer.id),
                total_attachments_bytes=0,
            )
            db.add(req)
            db.flush()
            msg = Message(
                request_id=req.id,
                author_type="CLIENT",
                author_name="Клиент",
                body="Старое сообщение",
                immutable=True,
            )
            db.add(msg)
            db.commit()
            request_id = str(req.id)
            message_id = str(msg.id)
            lawyer_id = str(lawyer.id)

        headers = self._admin_headers(sub=lawyer_id, role="LAWYER", email="lawyer-immutable@example.com")
        with patch("app.api.admin.uploads.get_s3_storage", return_value=fake_s3):
            init_resp = self.client.post(
                "/api/admin/uploads/init",
                headers=headers,
                json={
                    "file_name": "appendix.pdf",
                    "mime_type": "application/pdf",
                    "size_bytes": 1024,
                    "scope": "REQUEST_ATTACHMENT",
                    "request_id": request_id,
                },
            )
            self.assertEqual(init_resp.status_code, 200)
            key = init_resp.json()["key"]
            fake_s3.objects[key] = {"size": 1024, "mime": "application/pdf", "content": b"x" * 1024}

            blocked = self.client.post(
                "/api/admin/uploads/complete",
                headers=headers,
                json={
                    "key": key,
                    "file_name": "appendix.pdf",
                    "mime_type": "application/pdf",
                    "size_bytes": 1024,
                    "scope": "REQUEST_ATTACHMENT",
                    "request_id": request_id,
                    "message_id": message_id,
                },
            )
            self.assertEqual(blocked.status_code, 400)
            self.assertIn("зафиксированному", blocked.json().get("detail", ""))

    def test_public_upload_rejects_file_over_limit_on_init(self):
        with self.SessionLocal() as db:
            req = Request(
                track_number="TRK-PUB-LIMIT-FILE",
                client_name="Клиент",
                client_phone="+79990001111",
                topic_code="civil-law",
                status_code="NEW",
                extra_fields={},
                total_attachments_bytes=0,
            )
            db.add(req)
            db.commit()
            request_id = str(req.id)
            track = req.track_number

        public_token = create_jwt({"sub": track, "purpose": "VIEW_REQUEST"}, settings.PUBLIC_JWT_SECRET, timedelta(days=1))
        cookies = {settings.PUBLIC_COOKIE_NAME: public_token}
        with patch("app.api.public.uploads.settings.MAX_FILE_MB", 1):
            response = self.client.post(
                "/api/public/uploads/init",
                cookies=cookies,
                json={
                    "file_name": "big.mp4",
                    "mime_type": "video/mp4",
                    "size_bytes": 2 * 1024 * 1024,
                    "scope": "REQUEST_ATTACHMENT",
                    "request_id": request_id,
                },
            )
        self.assertEqual(response.status_code, 400)
        self.assertIn("лимит файла", response.json().get("detail", ""))

    def test_public_upload_rejects_case_limit_on_complete(self):
        fake_s3 = _FakeS3Storage()
        with self.SessionLocal() as db:
            req = Request(
                track_number="TRK-PUB-LIMIT-CASE",
                client_name="Клиент",
                client_phone="+79990002222",
                topic_code="civil-law",
                status_code="NEW",
                extra_fields={},
                total_attachments_bytes=(1024 * 1024) - 512,
            )
            db.add(req)
            db.commit()
            request_id = str(req.id)
            track = req.track_number

        public_token = create_jwt({"sub": track, "purpose": "VIEW_REQUEST"}, settings.PUBLIC_JWT_SECRET, timedelta(days=1))
        cookies = {settings.PUBLIC_COOKIE_NAME: public_token}
        with (
            patch("app.api.public.uploads.get_s3_storage", return_value=fake_s3),
            patch("app.api.public.uploads.settings.MAX_CASE_MB", 1),
            patch("app.api.public.uploads.settings.MAX_FILE_MB", 5),
        ):
            init_resp = self.client.post(
                "/api/public/uploads/init",
                cookies=cookies,
                json={
                    "file_name": "edge.pdf",
                    "mime_type": "application/pdf",
                    "size_bytes": 256,
                    "scope": "REQUEST_ATTACHMENT",
                    "request_id": request_id,
                },
            )
            self.assertEqual(init_resp.status_code, 200)
            key = init_resp.json()["key"]
            fake_s3.objects[key] = {"size": 1024, "mime": "application/pdf", "content": b"x" * 1024}

            done_resp = self.client.post(
                "/api/public/uploads/complete",
                cookies=cookies,
                json={
                    "key": key,
                    "file_name": "edge.pdf",
                    "mime_type": "application/pdf",
                    "size_bytes": 256,
                    "scope": "REQUEST_ATTACHMENT",
                    "request_id": request_id,
                },
            )
            self.assertEqual(done_resp.status_code, 400)
            self.assertIn("лимит вложений заявки", done_resp.json().get("detail", ""))

    def test_public_upload_rejects_foreign_object_key(self):
        fake_s3 = _FakeS3Storage()
        with self.SessionLocal() as db:
            req = Request(
                track_number="TRK-PUB-KEY",
                client_name="Клиент",
                client_phone="+79990003333",
                topic_code="civil-law",
                status_code="NEW",
                extra_fields={},
                total_attachments_bytes=0,
            )
            db.add(req)
            db.commit()
            request_id = str(req.id)
            track = req.track_number

        public_token = create_jwt({"sub": track, "purpose": "VIEW_REQUEST"}, settings.PUBLIC_JWT_SECRET, timedelta(days=1))
        cookies = {settings.PUBLIC_COOKIE_NAME: public_token}
        foreign_key = f"requests/{uuid4()}/foreign.pdf"
        fake_s3.objects[foreign_key] = {"size": 1024, "mime": "application/pdf", "content": b"x" * 1024}

        with patch("app.api.public.uploads.get_s3_storage", return_value=fake_s3):
            done_resp = self.client.post(
                "/api/public/uploads/complete",
                cookies=cookies,
                json={
                    "key": foreign_key,
                    "file_name": "foreign.pdf",
                    "mime_type": "application/pdf",
                    "size_bytes": 1024,
                    "scope": "REQUEST_ATTACHMENT",
                    "request_id": request_id,
                },
            )
        self.assertEqual(done_resp.status_code, 400)
        self.assertIn("Некорректный ключ объекта", done_resp.json().get("detail", ""))

    def test_admin_upload_rejects_file_over_limit_on_complete(self):
        fake_s3 = _FakeS3Storage()
        with self.SessionLocal() as db:
            admin = AdminUser(
                role="ADMIN",
                name="Админ Ограничений",
                email="admin-limits@example.com",
                password_hash="hash",
                is_active=True,
            )
            req = Request(
                track_number="TRK-ADM-LIMIT-FILE",
                client_name="Клиент",
                client_phone="+79990004444",
                topic_code="civil-law",
                status_code="NEW",
                extra_fields={},
                total_attachments_bytes=0,
            )
            db.add_all([admin, req])
            db.commit()
            admin_id = str(admin.id)
            request_id = str(req.id)

        headers = self._admin_headers(sub=admin_id, role="ADMIN", email="admin-limits@example.com")
        with (
            patch("app.api.admin.uploads.get_s3_storage", return_value=fake_s3),
            patch("app.api.admin.uploads.settings.MAX_FILE_MB", 1),
        ):
            init_resp = self.client.post(
                "/api/admin/uploads/init",
                headers=headers,
                json={
                    "file_name": "proof.mp4",
                    "mime_type": "video/mp4",
                    "size_bytes": 1024,
                    "scope": "REQUEST_ATTACHMENT",
                    "request_id": request_id,
                },
            )
            self.assertEqual(init_resp.status_code, 200)
            key = init_resp.json()["key"]
            fake_s3.objects[key] = {"size": 2 * 1024 * 1024, "mime": "video/mp4", "content": b"x" * 1024}

            done_resp = self.client.post(
                "/api/admin/uploads/complete",
                headers=headers,
                json={
                    "key": key,
                    "file_name": "proof.mp4",
                    "mime_type": "video/mp4",
                    "size_bytes": 1024,
                    "scope": "REQUEST_ATTACHMENT",
                    "request_id": request_id,
                },
            )
            self.assertEqual(done_resp.status_code, 400)
            self.assertIn("лимит файла", done_resp.json().get("detail", ""))

    def test_admin_upload_rejects_foreign_object_key(self):
        fake_s3 = _FakeS3Storage()
        with self.SessionLocal() as db:
            admin = AdminUser(
                role="ADMIN",
                name="Админ Ключей",
                email="admin-keys@example.com",
                password_hash="hash",
                is_active=True,
            )
            req = Request(
                track_number="TRK-ADM-KEY",
                client_name="Клиент",
                client_phone="+79990005555",
                topic_code="civil-law",
                status_code="NEW",
                extra_fields={},
                total_attachments_bytes=0,
            )
            db.add_all([admin, req])
            db.commit()
            admin_id = str(admin.id)
            request_id = str(req.id)

        headers = self._admin_headers(sub=admin_id, role="ADMIN", email="admin-keys@example.com")
        foreign_key = f"requests/{uuid4()}/another.pdf"
        fake_s3.objects[foreign_key] = {"size": 2048, "mime": "application/pdf", "content": b"x" * 2048}

        with patch("app.api.admin.uploads.get_s3_storage", return_value=fake_s3):
            done_resp = self.client.post(
                "/api/admin/uploads/complete",
                headers=headers,
                json={
                    "key": foreign_key,
                    "file_name": "another.pdf",
                    "mime_type": "application/pdf",
                    "size_bytes": 2048,
                    "scope": "REQUEST_ATTACHMENT",
                    "request_id": request_id,
                },
            )
        self.assertEqual(done_resp.status_code, 400)
        self.assertIn("Некорректный ключ объекта", done_resp.json().get("detail", ""))

    def test_admin_object_proxy_blocks_lawyer_for_foreign_assigned_request(self):
        fake_s3 = _FakeS3Storage()
        with self.SessionLocal() as db:
            lawyer_a = AdminUser(
                role="LAWYER",
                name="Юрист А",
                email="lawyer-a@example.com",
                password_hash="hash",
                is_active=True,
            )
            lawyer_b = AdminUser(
                role="LAWYER",
                name="Юрист Б",
                email="lawyer-b@example.com",
                password_hash="hash",
                is_active=True,
            )
            db.add_all([lawyer_a, lawyer_b])
            db.flush()
            req = Request(
                track_number="TRK-ADM-PROXY-LOCK",
                client_name="Клиент",
                client_phone="+79990006666",
                topic_code="civil-law",
                status_code="IN_PROGRESS",
                assigned_lawyer_id=str(lawyer_b.id),
                extra_fields={},
                total_attachments_bytes=0,
            )
            db.add(req)
            db.flush()
            key = f"requests/{req.id}/proof.pdf"
            att = Attachment(
                request_id=req.id,
                file_name="proof.pdf",
                mime_type="application/pdf",
                size_bytes=1024,
                s3_key=key,
            )
            db.add(att)
            db.commit()
            lawyer_a_id = str(lawyer_a.id)

        token = self._admin_headers(sub=lawyer_a_id, role="LAWYER", email="lawyer-a@example.com")["Authorization"].replace("Bearer ", "")
        fake_s3.objects[key] = {"size": 1024, "mime": "application/pdf", "content": b"x" * 1024}
        with patch("app.api.admin.uploads.get_s3_storage", return_value=fake_s3):
            response = self.client.get(f"/api/admin/uploads/object/{key}?token={token}")
        self.assertEqual(response.status_code, 403)
