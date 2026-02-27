import os
import unittest
from datetime import timedelta
from uuid import UUID
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
from app.models.attachment import Attachment
from app.models.message import Message
from app.models.notification import Notification
from app.models.request import Request
from app.models.request_data_requirement import RequestDataRequirement
from app.models.status_history import StatusHistory
from app.services.chat_presence import clear_presence_for_tests, set_typing_presence


class _FakeBody:
    def __init__(self, payload: bytes):
        self.payload = payload

    def iter_chunks(self, chunk_size=65536):
        for i in range(0, len(self.payload), chunk_size):
            yield self.payload[i : i + chunk_size]


class _FakeS3Storage:
    def __init__(self):
        self.objects = {}

    def create_presigned_put_url(self, key: str, mime_type: str):
        return f"http://s3.local/{key}?mime={mime_type}"

    def head_object(self, key: str) -> dict:
        row = self.objects.get(key)
        if row is None:
            raise ClientError({"Error": {"Code": "404", "Message": "Not Found"}}, "HeadObject")
        return {"ContentLength": row["size"]}

    def get_object(self, key: str) -> dict:
        row = self.objects.get(key)
        if row is None:
            raise ClientError({"Error": {"Code": "404", "Message": "Not Found"}}, "GetObject")
        return {"Body": _FakeBody(row["content"]), "ContentType": row["mime"], "ContentLength": row["size"]}


class PublicCabinetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite+pysqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.SessionLocal = sessionmaker(bind=cls.engine, autocommit=False, autoflush=False)
        Request.__table__.create(bind=cls.engine)
        Notification.__table__.create(bind=cls.engine)
        Message.__table__.create(bind=cls.engine)
        Attachment.__table__.create(bind=cls.engine)
        RequestDataRequirement.__table__.create(bind=cls.engine)
        StatusHistory.__table__.create(bind=cls.engine)

    @classmethod
    def tearDownClass(cls):
        RequestDataRequirement.__table__.drop(bind=cls.engine)
        StatusHistory.__table__.drop(bind=cls.engine)
        Attachment.__table__.drop(bind=cls.engine)
        Message.__table__.drop(bind=cls.engine)
        Notification.__table__.drop(bind=cls.engine)
        Request.__table__.drop(bind=cls.engine)
        cls.engine.dispose()

    def setUp(self):
        clear_presence_for_tests()
        with self.SessionLocal() as db:
            db.execute(delete(Notification))
            db.execute(delete(StatusHistory))
            db.execute(delete(Attachment))
            db.execute(delete(RequestDataRequirement))
            db.execute(delete(Message))
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
        clear_presence_for_tests()

    @staticmethod
    def _public_cookies(track_number: str) -> dict[str, str]:
        token = create_jwt({"sub": track_number, "purpose": "VIEW_REQUEST"}, settings.PUBLIC_JWT_SECRET, timedelta(days=1))
        return {settings.PUBLIC_COOKIE_NAME: token}

    def test_cabinet_lists_messages_attachments_history_and_timeline(self):
        with self.SessionLocal() as db:
            req = Request(
                track_number="TRK-CAB-001",
                client_name="Тест Клиент",
                client_phone="+79991110000",
                topic_code="consulting",
                status_code="IN_PROGRESS",
                description="Проверка кабинета",
                extra_fields={},
            )
            db.add(req)
            db.commit()
            db.refresh(req)

            db.add(
                Message(
                    request_id=req.id,
                    author_type="LAWYER",
                    author_name="Юрист",
                    body="Принял в работу.",
                )
            )
            db.add(
                Attachment(
                    request_id=req.id,
                    file_name="doc.pdf",
                    mime_type="application/pdf",
                    size_bytes=1234,
                    s3_key="requests/key/doc.pdf",
                )
            )
            db.add(
                StatusHistory(
                    request_id=req.id,
                    from_status="NEW",
                    to_status="IN_PROGRESS",
                    comment="Юрист взял заявку",
                )
            )
            db.commit()

        cookies = self._public_cookies("TRK-CAB-001")
        messages = self.client.get("/api/public/requests/TRK-CAB-001/messages", cookies=cookies)
        self.assertEqual(messages.status_code, 200)
        self.assertEqual(len(messages.json()), 1)
        self.assertEqual(messages.json()[0]["author_type"], "LAWYER")

        attachments = self.client.get("/api/public/requests/TRK-CAB-001/attachments", cookies=cookies)
        self.assertEqual(attachments.status_code, 200)
        self.assertEqual(len(attachments.json()), 1)
        self.assertIn("/api/public/uploads/object/", attachments.json()[0]["download_url"])

        history = self.client.get("/api/public/requests/TRK-CAB-001/history", cookies=cookies)
        self.assertEqual(history.status_code, 200)
        self.assertEqual(len(history.json()), 1)
        self.assertEqual(history.json()[0]["to_status"], "IN_PROGRESS")

        timeline = self.client.get("/api/public/requests/TRK-CAB-001/timeline", cookies=cookies)
        self.assertEqual(timeline.status_code, 200)
        events = timeline.json()
        self.assertEqual(len(events), 3)
        self.assertEqual({event["type"] for event in events}, {"status_change", "message", "attachment"})

    def test_client_can_create_message_in_public_cabinet(self):
        with self.SessionLocal() as db:
            req = Request(
                track_number="TRK-CAB-MSG",
                client_name="Клиент Сообщение",
                client_phone="+79992220000",
                topic_code="consulting",
                status_code="NEW",
                description="Проверка отправки",
                extra_fields={},
            )
            db.add(req)
            db.commit()
            request_id = req.id

        cookies = self._public_cookies("TRK-CAB-MSG")
        created = self.client.post(
            "/api/public/requests/TRK-CAB-MSG/messages",
            cookies=cookies,
            json={"body": "Добрый день, есть вопрос по документам."},
        )
        self.assertEqual(created.status_code, 201)
        message_id = UUID(created.json()["id"])

        with self.SessionLocal() as db:
            row = db.get(Message, message_id)
            self.assertIsNotNone(row)
            self.assertEqual(row.request_id, request_id)
            self.assertEqual(row.author_type, "CLIENT")
            self.assertEqual(row.body, "Добрый день, есть вопрос по документам.")
            req = db.get(Request, request_id)
            self.assertIsNotNone(req)
            self.assertEqual(req.responsible, "Клиент")
            self.assertTrue(req.lawyer_has_unread_updates)
            self.assertEqual(req.lawyer_unread_event_type, "MESSAGE")

    def test_public_chat_service_endpoints_work_for_authorized_client(self):
        with self.SessionLocal() as db:
            req = Request(
                track_number="TRK-CHAT-001",
                client_name="Клиент Чат",
                client_phone="+79997770000",
                topic_code="consulting",
                status_code="NEW",
                description="Проверка chat service",
                extra_fields={},
            )
            db.add(req)
            db.commit()

        cookies = self._public_cookies("TRK-CHAT-001")
        created = self.client.post(
            "/api/public/chat/requests/TRK-CHAT-001/messages",
            cookies=cookies,
            json={"body": "Сообщение через выделенный сервис"},
        )
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.json()["author_type"], "CLIENT")

        listed = self.client.get("/api/public/chat/requests/TRK-CHAT-001/messages", cookies=cookies)
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(len(listed.json()), 1)
        self.assertIn("выделенный сервис", listed.json()[0]["body"])

        denied = self.client.get("/api/public/chat/requests/TRK-CHAT-001/messages", cookies=self._public_cookies("TRK-OTHER"))
        self.assertEqual(denied.status_code, 403)

    def test_public_live_endpoint_and_typing_state(self):
        with self.SessionLocal() as db:
            req = Request(
                track_number="TRK-LIVE-001",
                client_name="Клиент Live",
                client_phone="+79997771234",
                topic_code="consulting",
                status_code="NEW",
                description="Проверка live",
                extra_fields={},
            )
            db.add(req)
            db.flush()
            db.add(
                Message(
                    request_id=req.id,
                    author_type="LAWYER",
                    author_name="Юрист",
                    body="Первое сообщение",
                )
            )
            db.commit()
            request_id = str(req.id)

        cookies = self._public_cookies("TRK-LIVE-001")
        live_initial = self.client.get("/api/public/chat/requests/TRK-LIVE-001/live", cookies=cookies)
        self.assertEqual(live_initial.status_code, 200)
        live_body = live_initial.json()
        self.assertTrue(bool(live_body.get("has_updates")))
        self.assertTrue(bool(live_body.get("cursor")))

        set_typing_presence(
            request_key=request_id,
            actor_key="LAWYER:test",
            actor_label="Юрист Тест",
            actor_role="LAWYER",
            typing=True,
        )
        live_with_typing = self.client.get("/api/public/chat/requests/TRK-LIVE-001/live", cookies=cookies)
        self.assertEqual(live_with_typing.status_code, 200)
        typing_rows = live_with_typing.json().get("typing") or []
        self.assertTrue(any(str(item.get("actor_label")) == "Юрист Тест" for item in typing_rows))

        current_cursor = str(live_with_typing.json().get("cursor") or "")
        live_no_delta = self.client.get(
            "/api/public/chat/requests/TRK-LIVE-001/live",
            params={"cursor": current_cursor},
            cookies=cookies,
        )
        self.assertEqual(live_no_delta.status_code, 200)
        self.assertFalse(bool(live_no_delta.json().get("has_updates")))

        typing_on = self.client.post(
            "/api/public/chat/requests/TRK-LIVE-001/typing",
            cookies=cookies,
            json={"typing": True},
        )
        self.assertEqual(typing_on.status_code, 200)
        self.assertTrue(bool(typing_on.json().get("typing")))

    def test_public_cabinet_respects_track_access(self):
        with self.SessionLocal() as db:
            req = Request(
                track_number="TRK-REAL",
                client_name="Клиент Ограничение",
                client_phone="+79993330000",
                topic_code="consulting",
                status_code="NEW",
                description="Проверка доступа",
                extra_fields={},
            )
            db.add(req)
            db.commit()

        cookies = self._public_cookies("TRK-OTHER")
        denied = self.client.get("/api/public/requests/TRK-REAL/messages", cookies=cookies)
        self.assertEqual(denied.status_code, 403)

    def test_public_attachment_download_requires_access(self):
        fake_s3 = _FakeS3Storage()
        with self.SessionLocal() as db:
            req = Request(
                track_number="TRK-FILE-1",
                client_name="Клиент Файл",
                client_phone="+79994440000",
                topic_code="consulting",
                status_code="NEW",
                description="Файл",
                extra_fields={},
            )
            db.add(req)
            db.commit()
            db.refresh(req)

            att = Attachment(
                request_id=req.id,
                file_name="act.pdf",
                mime_type="application/pdf",
                size_bytes=4,
                s3_key="requests/a/act.pdf",
            )
            db.add(att)
            db.commit()
            attachment_id = str(att.id)

        fake_s3.objects["requests/a/act.pdf"] = {
            "content": b"test",
            "mime": "application/pdf",
            "size": 4,
        }

        with patch("app.api.public.uploads.get_s3_storage", return_value=fake_s3):
            allowed = self.client.get(
                f"/api/public/uploads/object/{attachment_id}",
                cookies=self._public_cookies("TRK-FILE-1"),
            )
            self.assertEqual(allowed.status_code, 200)
            self.assertEqual(allowed.content, b"test")

            denied = self.client.get(
                f"/api/public/uploads/object/{attachment_id}",
                cookies=self._public_cookies("TRK-OTHER"),
            )
            self.assertEqual(denied.status_code, 403)

    def test_public_upload_complete_links_attachment_to_message_when_message_id_provided(self):
        fake_s3 = _FakeS3Storage()
        with self.SessionLocal() as db:
            req = Request(
                track_number="TRK-PUBLIC-UPL-1",
                client_name="Клиент Файл Сообщение",
                client_phone="+79995550000",
                topic_code="consulting",
                status_code="NEW",
                description="Проверка привязки файла к сообщению",
                extra_fields={},
            )
            db.add(req)
            db.flush()
            msg = Message(
                request_id=req.id,
                author_type="CLIENT",
                author_name=req.client_name,
                body="Сообщение клиента",
            )
            db.add(msg)
            db.commit()
            db.refresh(req)
            db.refresh(msg)
            request_id = str(req.id)
            message_id = str(msg.id)

        key = f"requests/{request_id}/chat/file.txt"
        fake_s3.objects[key] = {
            "content": b"hello",
            "mime": "text/plain",
            "size": 5,
        }

        with patch("app.api.public.uploads.get_s3_storage", return_value=fake_s3):
            response = self.client.post(
                "/api/public/uploads/complete",
                cookies=self._public_cookies("TRK-PUBLIC-UPL-1"),
                json={
                    "key": key,
                    "file_name": "file.txt",
                    "mime_type": "text/plain",
                    "size_bytes": 5,
                    "scope": "REQUEST_ATTACHMENT",
                    "request_id": request_id,
                    "message_id": message_id,
                },
            )

        self.assertEqual(response.status_code, 200)
        attachment_id = response.json().get("attachment_id")
        self.assertIsNotNone(attachment_id)

        with self.SessionLocal() as db:
            row = db.get(Attachment, UUID(attachment_id))
            self.assertIsNotNone(row)
            self.assertEqual(str(row.message_id), message_id)

    def test_public_status_route_endpoint_is_available_for_client(self):
        with self.SessionLocal() as db:
            req = Request(
                track_number="TRK-ROUTE-001",
                client_name="Клиент Маршрут",
                client_phone="+79996660000",
                topic_code="consulting",
                status_code="IN_PROGRESS",
                description="Проверка маршрута",
                extra_fields={},
            )
            db.add(req)
            db.commit()

        response = self.client.get("/api/public/requests/TRK-ROUTE-001/status-route", cookies=self._public_cookies("TRK-ROUTE-001"))
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload.get("track_number"), "TRK-ROUTE-001")
        self.assertEqual(payload.get("current_status"), "IN_PROGRESS")
        self.assertTrue(isinstance(payload.get("nodes"), list))
