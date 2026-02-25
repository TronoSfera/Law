import os
import re
import unittest
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

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

from app.core.config import settings
from app.core.security import create_jwt, verify_password
from app.db.session import get_db
from app.main import app
from app.models.admin_user import AdminUser
from app.models.admin_user_topic import AdminUserTopic
from app.models.attachment import Attachment
from app.models.audit_log import AuditLog
from app.models.client import Client
from app.models.form_field import FormField
from app.models.message import Message
from app.models.notification import Notification
from app.models.table_availability import TableAvailability
from app.models.quote import Quote
from app.models.request import Request
from app.models.status import Status
from app.models.status_history import StatusHistory
from app.models.topic_data_template import TopicDataTemplate
from app.models.topic import Topic
from app.models.topic_required_field import TopicRequiredField
from app.models.request_data_requirement import RequestDataRequirement
from app.models.topic_status_transition import TopicStatusTransition


class AdminUniversalCrudTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite+pysqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.SessionLocal = sessionmaker(bind=cls.engine, autocommit=False, autoflush=False)
        AdminUser.__table__.create(bind=cls.engine)
        Client.__table__.create(bind=cls.engine)
        Quote.__table__.create(bind=cls.engine)
        FormField.__table__.create(bind=cls.engine)
        Request.__table__.create(bind=cls.engine)
        Status.__table__.create(bind=cls.engine)
        Message.__table__.create(bind=cls.engine)
        Attachment.__table__.create(bind=cls.engine)
        StatusHistory.__table__.create(bind=cls.engine)
        Topic.__table__.create(bind=cls.engine)
        TopicRequiredField.__table__.create(bind=cls.engine)
        TopicDataTemplate.__table__.create(bind=cls.engine)
        RequestDataRequirement.__table__.create(bind=cls.engine)
        TopicStatusTransition.__table__.create(bind=cls.engine)
        AdminUserTopic.__table__.create(bind=cls.engine)
        Notification.__table__.create(bind=cls.engine)
        TableAvailability.__table__.create(bind=cls.engine)
        AuditLog.__table__.create(bind=cls.engine)

    @classmethod
    def tearDownClass(cls):
        AuditLog.__table__.drop(bind=cls.engine)
        Notification.__table__.drop(bind=cls.engine)
        TableAvailability.__table__.drop(bind=cls.engine)
        AdminUserTopic.__table__.drop(bind=cls.engine)
        RequestDataRequirement.__table__.drop(bind=cls.engine)
        TopicDataTemplate.__table__.drop(bind=cls.engine)
        TopicRequiredField.__table__.drop(bind=cls.engine)
        TopicStatusTransition.__table__.drop(bind=cls.engine)
        Topic.__table__.drop(bind=cls.engine)
        StatusHistory.__table__.drop(bind=cls.engine)
        Attachment.__table__.drop(bind=cls.engine)
        Message.__table__.drop(bind=cls.engine)
        Status.__table__.drop(bind=cls.engine)
        Request.__table__.drop(bind=cls.engine)
        FormField.__table__.drop(bind=cls.engine)
        Quote.__table__.drop(bind=cls.engine)
        Client.__table__.drop(bind=cls.engine)
        AdminUser.__table__.drop(bind=cls.engine)
        cls.engine.dispose()

    def setUp(self):
        with self.SessionLocal() as db:
            db.execute(delete(AuditLog))
            db.execute(delete(StatusHistory))
            db.execute(delete(Attachment))
            db.execute(delete(Message))
            db.execute(delete(Request))
            db.execute(delete(Client))
            db.execute(delete(Status))
            db.execute(delete(FormField))
            db.execute(delete(Topic))
            db.execute(delete(TopicRequiredField))
            db.execute(delete(TopicDataTemplate))
            db.execute(delete(RequestDataRequirement))
            db.execute(delete(TopicStatusTransition))
            db.execute(delete(AdminUserTopic))
            db.execute(delete(Notification))
            db.execute(delete(TableAvailability))
            db.execute(delete(Quote))
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
    def _auth_headers(role: str, email: str | None = None, sub: str | None = None) -> dict[str, str]:
        token = create_jwt(
            {"sub": str(sub or uuid4()), "email": email or f"{role.lower()}@example.com", "role": role},
            settings.ADMIN_JWT_SECRET,
            timedelta(minutes=30),
        )
        return {"Authorization": f"Bearer {token}"}

    def test_admin_can_crud_quotes_and_audit_is_written(self):
        headers = self._auth_headers("ADMIN")

        created = self.client.post(
            "/api/admin/crud/quotes",
            headers=headers,
            json={"author": "Тест", "text": "Цитата", "source": "suite", "is_active": True, "sort_order": 7},
        )
        self.assertEqual(created.status_code, 201)
        created_body = created.json()
        self.assertEqual(created_body["author"], "Тест")
        self.assertEqual(created_body["responsible"], "admin@example.com")
        quote_id = created_body["id"]
        UUID(quote_id)

        updated = self.client.patch(
            f"/api/admin/crud/quotes/{quote_id}",
            headers=headers,
            json={"text": "Цитата обновлена", "sort_order": 9},
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["text"], "Цитата обновлена")
        self.assertEqual(updated.json()["responsible"], "admin@example.com")

        got = self.client.get(f"/api/admin/crud/quotes/{quote_id}", headers=headers)
        self.assertEqual(got.status_code, 200)
        self.assertEqual(got.json()["sort_order"], 9)

        deleted = self.client.delete(f"/api/admin/crud/quotes/{quote_id}", headers=headers)
        self.assertEqual(deleted.status_code, 200)

        missing = self.client.get(f"/api/admin/crud/quotes/{quote_id}", headers=headers)
        self.assertEqual(missing.status_code, 404)

        with self.SessionLocal() as db:
            actions = [row.action for row in db.query(AuditLog).filter(AuditLog.entity == "quotes", AuditLog.entity_id == quote_id).all()]
        self.assertEqual(set(actions), {"CREATE", "UPDATE", "DELETE"})

    def test_admin_table_catalog_lists_db_tables_for_dynamic_references(self):
        admin_headers = self._auth_headers("ADMIN")
        response = self.client.get("/api/admin/crud/meta/tables", headers=admin_headers)
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        tables = payload.get("tables") or []
        self.assertTrue(tables)

        by_table = {row["table"]: row for row in tables}
        self.assertIn("requests", by_table)
        self.assertIn("invoices", by_table)
        self.assertIn("clients", by_table)
        self.assertIn("quotes", by_table)
        self.assertIn("statuses", by_table)

        self.assertEqual(by_table["requests"]["section"], "main")
        self.assertEqual(by_table["invoices"]["section"], "main")
        self.assertEqual(by_table["quotes"]["section"], "dictionary")
        self.assertTrue(by_table["quotes"]["default_sort"])
        self.assertEqual(by_table["quotes"]["label"], "Цитаты")
        self.assertEqual(by_table["request_data_requirements"]["label"], "Требования данных заявки")
        quotes_columns = {col["name"]: col for col in (by_table["quotes"].get("columns") or [])}
        self.assertEqual(quotes_columns["author"]["label"], "Автор")
        self.assertEqual(quotes_columns["sort_order"]["label"], "Порядок")
        self.assertTrue(all(str(col.get("label") or "").strip() for col in (by_table["quotes"].get("columns") or [])))
        for table_name, table_meta in by_table.items():
            if table_name in {"requests", "invoices"}:
                expected_section = "main"
            elif table_name == "table_availability":
                expected_section = "system"
            else:
                expected_section = "dictionary"
            self.assertEqual(table_meta.get("section"), expected_section)

        admin_users_cols = {col["name"] for col in (by_table["admin_users"].get("columns") or [])}
        self.assertNotIn("password_hash", admin_users_cols)

        lawyer_headers = self._auth_headers("LAWYER")
        forbidden = self.client.get("/api/admin/crud/meta/tables", headers=lawyer_headers)
        self.assertEqual(forbidden.status_code, 403)

    def test_admin_can_toggle_dictionary_table_visibility(self):
        admin_headers = self._auth_headers("ADMIN")
        available = self.client.get("/api/admin/crud/meta/available-tables", headers=admin_headers)
        self.assertEqual(available.status_code, 200)
        rows = available.json().get("rows") or []
        by_table = {row["table"]: row for row in rows}
        self.assertIn("clients", by_table)
        self.assertIn("table_availability", by_table)
        self.assertEqual(by_table["table_availability"]["section"], "system")
        self.assertTrue(bool(by_table["clients"]["is_active"]))

        deactivated = self.client.patch(
            "/api/admin/crud/meta/available-tables/clients",
            headers=admin_headers,
            json={"is_active": False},
        )
        self.assertEqual(deactivated.status_code, 200)
        self.assertFalse(bool(deactivated.json().get("is_active")))

        filtered_catalog = self.client.get("/api/admin/crud/meta/tables", headers=admin_headers)
        self.assertEqual(filtered_catalog.status_code, 200)
        filtered_tables = {row["table"] for row in (filtered_catalog.json().get("tables") or [])}
        self.assertNotIn("clients", filtered_tables)
        self.assertIn("requests", filtered_tables)
        self.assertIn("invoices", filtered_tables)

        activated = self.client.patch(
            "/api/admin/crud/meta/available-tables/clients",
            headers=admin_headers,
            json={"is_active": True},
        )
        self.assertEqual(activated.status_code, 200)
        self.assertTrue(bool(activated.json().get("is_active")))

        refreshed_catalog = self.client.get("/api/admin/crud/meta/tables", headers=admin_headers)
        self.assertEqual(refreshed_catalog.status_code, 200)
        refreshed_tables = {row["table"] for row in (refreshed_catalog.json().get("tables") or [])}
        self.assertIn("clients", refreshed_tables)

        lawyer_headers = self._auth_headers("LAWYER")
        forbidden_list = self.client.get("/api/admin/crud/meta/available-tables", headers=lawyer_headers)
        self.assertEqual(forbidden_list.status_code, 403)
        forbidden_patch = self.client.patch(
            "/api/admin/crud/meta/available-tables/clients",
            headers=lawyer_headers,
            json={"is_active": False},
        )
        self.assertEqual(forbidden_patch.status_code, 403)

    def test_lawyer_permissions_and_request_crud(self):
        lawyer_headers = self._auth_headers("LAWYER")

        forbidden = self.client.post(
            "/api/admin/crud/quotes",
            headers=lawyer_headers,
            json={"author": "X", "text": "Y"},
        )
        self.assertEqual(forbidden.status_code, 403)

        request_create = self.client.post(
            "/api/admin/crud/requests",
            headers=lawyer_headers,
            json={
                "client_name": "ООО Право",
                "client_phone": "+79990000002",
                "status_code": "NEW",
                "description": "Тест универсального CRUD",
            },
        )
        self.assertEqual(request_create.status_code, 201)
        body = request_create.json()
        self.assertTrue(body["track_number"].startswith("TRK-"))
        self.assertEqual(body["responsible"], "lawyer@example.com")
        request_id = body["id"]
        UUID(request_id)

        query = self.client.post(
            "/api/admin/crud/requests/query",
            headers=lawyer_headers,
            json={"filters": [], "sort": [{"field": "created_at", "dir": "desc"}], "page": {"limit": 50, "offset": 0}},
        )
        self.assertEqual(query.status_code, 200)
        self.assertEqual(query.json()["total"], 1)

        status_forbidden = self.client.post(
            "/api/admin/crud/statuses/query",
            headers=lawyer_headers,
            json={"filters": [], "sort": [], "page": {"limit": 50, "offset": 0}},
        )
        self.assertEqual(status_forbidden.status_code, 403)

    def test_lawyer_can_see_own_and_unassigned_requests_and_close_only_own(self):
        with self.SessionLocal() as db:
            lawyer_self = AdminUser(
                role="LAWYER",
                name="Юрист Свой",
                email="lawyer.self@example.com",
                password_hash="hash",
                is_active=True,
            )
            lawyer_other = AdminUser(
                role="LAWYER",
                name="Юрист Чужой",
                email="lawyer.other@example.com",
                password_hash="hash",
                is_active=True,
            )
            db.add_all([lawyer_self, lawyer_other])
            db.flush()
            self_id = str(lawyer_self.id)
            other_id = str(lawyer_other.id)

            own = Request(
                track_number="TRK-LAWYER-OWN",
                client_name="Клиент Свой",
                client_phone="+79990001011",
                status_code="NEW",
                description="own",
                extra_fields={},
                assigned_lawyer_id=self_id,
            )
            foreign = Request(
                track_number="TRK-LAWYER-FOREIGN",
                client_name="Клиент Чужой",
                client_phone="+79990001012",
                status_code="NEW",
                description="foreign",
                extra_fields={},
                assigned_lawyer_id=other_id,
            )
            unassigned = Request(
                track_number="TRK-LAWYER-UNASSIGNED",
                client_name="Клиент Без назначения",
                client_phone="+79990001013",
                status_code="NEW",
                description="unassigned",
                extra_fields={},
                assigned_lawyer_id=None,
            )
            db.add_all([own, foreign, unassigned])
            db.commit()
            own_id = str(own.id)
            foreign_id = str(foreign.id)
            unassigned_id = str(unassigned.id)

        headers = self._auth_headers("LAWYER", email="lawyer.self@example.com", sub=self_id)

        crud_query = self.client.post(
            "/api/admin/crud/requests/query",
            headers=headers,
            json={"filters": [], "sort": [{"field": "created_at", "dir": "asc"}], "page": {"limit": 50, "offset": 0}},
        )
        self.assertEqual(crud_query.status_code, 200)
        crud_ids = {str(row["id"]) for row in (crud_query.json().get("rows") or [])}
        self.assertEqual(crud_ids, {own_id, unassigned_id})

        legacy_query = self.client.post(
            "/api/admin/requests/query",
            headers=headers,
            json={"filters": [], "sort": [{"field": "created_at", "dir": "asc"}], "page": {"limit": 50, "offset": 0}},
        )
        self.assertEqual(legacy_query.status_code, 200)
        legacy_ids = {str(row["id"]) for row in (legacy_query.json().get("rows") or [])}
        self.assertEqual(legacy_ids, {own_id, unassigned_id})

        crud_get_foreign = self.client.get(f"/api/admin/crud/requests/{foreign_id}", headers=headers)
        self.assertEqual(crud_get_foreign.status_code, 403)
        legacy_get_foreign = self.client.get(f"/api/admin/requests/{foreign_id}", headers=headers)
        self.assertEqual(legacy_get_foreign.status_code, 403)

        crud_update_unassigned = self.client.patch(
            f"/api/admin/crud/requests/{unassigned_id}",
            headers=headers,
            json={"status_code": "CLOSED"},
        )
        self.assertEqual(crud_update_unassigned.status_code, 403)
        legacy_update_unassigned = self.client.patch(
            f"/api/admin/requests/{unassigned_id}",
            headers=headers,
            json={"status_code": "CLOSED"},
        )
        self.assertEqual(legacy_update_unassigned.status_code, 403)

        close_own = self.client.patch(
            f"/api/admin/requests/{own_id}",
            headers=headers,
            json={"status_code": "CLOSED"},
        )
        self.assertEqual(close_own.status_code, 200)

        with self.SessionLocal() as db:
            refreshed = db.get(Request, UUID(own_id))
            self.assertIsNotNone(refreshed)
            self.assertEqual(refreshed.status_code, "CLOSED")

    def test_lawyer_messages_and_attachments_are_scoped_by_request_access(self):
        with self.SessionLocal() as db:
            lawyer_self = AdminUser(
                role="LAWYER",
                name="Юрист Свой",
                email="lawyer.msg.self@example.com",
                password_hash="hash",
                is_active=True,
            )
            lawyer_other = AdminUser(
                role="LAWYER",
                name="Юрист Чужой",
                email="lawyer.msg.other@example.com",
                password_hash="hash",
                is_active=True,
            )
            db.add_all([lawyer_self, lawyer_other])
            db.flush()
            self_id = str(lawyer_self.id)
            other_id = str(lawyer_other.id)

            own = Request(
                track_number="TRK-MSG-OWN",
                client_name="Клиент Свой",
                client_phone="+79990010101",
                status_code="IN_PROGRESS",
                description="own",
                extra_fields={},
                assigned_lawyer_id=self_id,
            )
            foreign = Request(
                track_number="TRK-MSG-FOREIGN",
                client_name="Клиент Чужой",
                client_phone="+79990010102",
                status_code="IN_PROGRESS",
                description="foreign",
                extra_fields={},
                assigned_lawyer_id=other_id,
            )
            unassigned = Request(
                track_number="TRK-MSG-UNASSIGNED",
                client_name="Клиент Без назначения",
                client_phone="+79990010103",
                status_code="NEW",
                description="unassigned",
                extra_fields={},
                assigned_lawyer_id=None,
            )
            db.add_all([own, foreign, unassigned])
            db.flush()

            msg_own = Message(request_id=own.id, author_type="CLIENT", author_name="Клиент", body="own", immutable=False)
            msg_foreign = Message(request_id=foreign.id, author_type="CLIENT", author_name="Клиент", body="foreign", immutable=False)
            msg_unassigned = Message(request_id=unassigned.id, author_type="CLIENT", author_name="Клиент", body="unassigned", immutable=False)
            db.add_all([msg_own, msg_foreign, msg_unassigned])
            db.flush()

            att_own = Attachment(
                request_id=own.id,
                message_id=msg_own.id,
                file_name="own.pdf",
                mime_type="application/pdf",
                size_bytes=100,
                s3_key=f"requests/{own.id}/own.pdf",
                immutable=False,
            )
            att_foreign = Attachment(
                request_id=foreign.id,
                message_id=msg_foreign.id,
                file_name="foreign.pdf",
                mime_type="application/pdf",
                size_bytes=100,
                s3_key=f"requests/{foreign.id}/foreign.pdf",
                immutable=False,
            )
            att_unassigned = Attachment(
                request_id=unassigned.id,
                message_id=msg_unassigned.id,
                file_name="unassigned.pdf",
                mime_type="application/pdf",
                size_bytes=100,
                s3_key=f"requests/{unassigned.id}/unassigned.pdf",
                immutable=False,
            )
            db.add_all([att_own, att_foreign, att_unassigned])
            db.commit()

            own_id = str(own.id)
            unassigned_id = str(unassigned.id)
            foreign_msg_id = str(msg_foreign.id)
            foreign_att_id = str(att_foreign.id)

        headers = self._auth_headers("LAWYER", email="lawyer.msg.self@example.com", sub=self_id)

        messages_query = self.client.post(
            "/api/admin/crud/messages/query",
            headers=headers,
            json={"filters": [], "sort": [{"field": "created_at", "dir": "asc"}], "page": {"limit": 50, "offset": 0}},
        )
        self.assertEqual(messages_query.status_code, 200)
        message_request_ids = {str(row.get("request_id")) for row in (messages_query.json().get("rows") or [])}
        self.assertEqual(message_request_ids, {own_id, unassigned_id})

        attachments_query = self.client.post(
            "/api/admin/crud/attachments/query",
            headers=headers,
            json={"filters": [], "sort": [{"field": "created_at", "dir": "asc"}], "page": {"limit": 50, "offset": 0}},
        )
        self.assertEqual(attachments_query.status_code, 200)
        attachment_request_ids = {str(row.get("request_id")) for row in (attachments_query.json().get("rows") or [])}
        self.assertEqual(attachment_request_ids, {own_id, unassigned_id})

        foreign_message_get = self.client.get(f"/api/admin/crud/messages/{foreign_msg_id}", headers=headers)
        self.assertEqual(foreign_message_get.status_code, 403)
        foreign_attachment_get = self.client.get(f"/api/admin/crud/attachments/{foreign_att_id}", headers=headers)
        self.assertEqual(foreign_attachment_get.status_code, 403)

        created_message = self.client.post(
            "/api/admin/crud/messages",
            headers=headers,
            json={"request_id": own_id, "body": "Ответ юриста"},
        )
        self.assertEqual(created_message.status_code, 201)
        self.assertEqual(created_message.json().get("author_type"), "LAWYER")
        self.assertEqual(created_message.json().get("request_id"), own_id)

        blocked_unassigned_create = self.client.post(
            "/api/admin/crud/messages",
            headers=headers,
            json={"request_id": unassigned_id, "body": "Попытка без назначения"},
        )
        self.assertEqual(blocked_unassigned_create.status_code, 403)

    def test_topic_status_flow_supports_branching_transitions(self):
        headers = self._auth_headers("ADMIN", email="root@example.com")
        with self.SessionLocal() as db:
            db.add_all(
                [
                    Topic(code="civil-branch", name="Гражданское (ветвление)", enabled=True, sort_order=1),
                    TopicStatusTransition(topic_code="civil-branch", from_status="NEW", to_status="IN_PROGRESS", enabled=True, sort_order=1),
                    TopicStatusTransition(topic_code="civil-branch", from_status="NEW", to_status="WAITING_CLIENT", enabled=True, sort_order=2),
                ]
            )
            req_in_progress = Request(
                track_number="TRK-BRANCH-1",
                client_name="Клиент 1",
                client_phone="+79991110021",
                topic_code="civil-branch",
                status_code="NEW",
                description="branch 1",
                extra_fields={},
            )
            req_waiting = Request(
                track_number="TRK-BRANCH-2",
                client_name="Клиент 2",
                client_phone="+79991110022",
                topic_code="civil-branch",
                status_code="NEW",
                description="branch 2",
                extra_fields={},
            )
            db.add_all([req_in_progress, req_waiting])
            db.commit()
            req_in_progress_id = str(req_in_progress.id)
            req_waiting_id = str(req_waiting.id)

        first_branch = self.client.patch(
            f"/api/admin/crud/requests/{req_in_progress_id}",
            headers=headers,
            json={"status_code": "IN_PROGRESS"},
        )
        self.assertEqual(first_branch.status_code, 200)

        second_branch = self.client.patch(
            f"/api/admin/crud/requests/{req_waiting_id}",
            headers=headers,
            json={"status_code": "WAITING_CLIENT"},
        )
        self.assertEqual(second_branch.status_code, 200)

    def test_admin_chat_service_endpoints_follow_rbac(self):
        with self.SessionLocal() as db:
            lawyer_self = AdminUser(
                role="LAWYER",
                name="Юрист Чат Свой",
                email="lawyer.chat.self@example.com",
                password_hash="hash",
                is_active=True,
            )
            lawyer_other = AdminUser(
                role="LAWYER",
                name="Юрист Чат Чужой",
                email="lawyer.chat.other@example.com",
                password_hash="hash",
                is_active=True,
            )
            db.add_all([lawyer_self, lawyer_other])
            db.flush()
            self_id = str(lawyer_self.id)
            other_id = str(lawyer_other.id)

            own = Request(
                track_number="TRK-CHAT-ADMIN-OWN",
                client_name="Клиент Свой",
                client_phone="+79990030001",
                status_code="IN_PROGRESS",
                description="own",
                extra_fields={},
                assigned_lawyer_id=self_id,
            )
            foreign = Request(
                track_number="TRK-CHAT-ADMIN-FOREIGN",
                client_name="Клиент Чужой",
                client_phone="+79990030002",
                status_code="IN_PROGRESS",
                description="foreign",
                extra_fields={},
                assigned_lawyer_id=other_id,
            )
            unassigned = Request(
                track_number="TRK-CHAT-ADMIN-UNASSIGNED",
                client_name="Клиент Без назначения",
                client_phone="+79990030003",
                status_code="NEW",
                description="unassigned",
                extra_fields={},
                assigned_lawyer_id=None,
            )
            db.add_all([own, foreign, unassigned])
            db.flush()
            db.add(Message(request_id=own.id, author_type="CLIENT", author_name="Клиент", body="start"))
            db.commit()
            own_id = str(own.id)
            foreign_id = str(foreign.id)
            unassigned_id = str(unassigned.id)

        lawyer_headers = self._auth_headers("LAWYER", email="lawyer.chat.self@example.com", sub=self_id)
        admin_headers = self._auth_headers("ADMIN", email="root@example.com")

        own_list = self.client.get(f"/api/admin/chat/requests/{own_id}/messages", headers=lawyer_headers)
        self.assertEqual(own_list.status_code, 200)
        self.assertEqual(own_list.json()["total"], 1)

        foreign_list = self.client.get(f"/api/admin/chat/requests/{foreign_id}/messages", headers=lawyer_headers)
        self.assertEqual(foreign_list.status_code, 403)

        own_create = self.client.post(
            f"/api/admin/chat/requests/{own_id}/messages",
            headers=lawyer_headers,
            json={"body": "Ответ из chat service"},
        )
        self.assertEqual(own_create.status_code, 201)
        self.assertEqual(own_create.json()["author_type"], "LAWYER")

        unassigned_create = self.client.post(
            f"/api/admin/chat/requests/{unassigned_id}/messages",
            headers=lawyer_headers,
            json={"body": "Нельзя в неназначенную"},
        )
        self.assertEqual(unassigned_create.status_code, 403)

        admin_create = self.client.post(
            f"/api/admin/chat/requests/{foreign_id}/messages",
            headers=admin_headers,
            json={"body": "Сообщение администратора"},
        )
        self.assertEqual(admin_create.status_code, 201)
        self.assertEqual(admin_create.json()["author_type"], "SYSTEM")

    def test_request_read_markers_status_update_and_lawyer_open_reset(self):
        with self.SessionLocal() as db:
            lawyer = AdminUser(
                role="LAWYER",
                name="Юрист Маркер",
                email="lawyer-marker@example.com",
                password_hash="hash",
                is_active=True,
            )
            db.add(lawyer)
            db.flush()
            request_row = Request(
                track_number="TRK-MARK-1",
                client_name="Клиент Маркер",
                client_phone="+79990009900",
                status_code="NEW",
                description="markers",
                extra_fields={},
                assigned_lawyer_id=str(lawyer.id),
                lawyer_has_unread_updates=True,
                lawyer_unread_event_type="MESSAGE",
            )
            db.add(request_row)
            db.commit()
            lawyer_id = str(lawyer.id)
            request_id = str(request_row.id)

        lawyer_headers = self._auth_headers("LAWYER", email="lawyer-marker@example.com", sub=lawyer_id)
        admin_headers = self._auth_headers("ADMIN", email="root@example.com")

        opened = self.client.get(f"/api/admin/crud/requests/{request_id}", headers=lawyer_headers)
        self.assertEqual(opened.status_code, 200)
        opened_body = opened.json()
        self.assertFalse(opened_body["lawyer_has_unread_updates"])
        self.assertIsNone(opened_body["lawyer_unread_event_type"])

        with self.SessionLocal() as db:
            opened_db = db.get(Request, UUID(request_id))
            self.assertIsNotNone(opened_db)
            self.assertFalse(opened_db.lawyer_has_unread_updates)
            self.assertIsNone(opened_db.lawyer_unread_event_type)

        updated = self.client.patch(
            f"/api/admin/crud/requests/{request_id}",
            headers=admin_headers,
            json={"status_code": "IN_PROGRESS"},
        )
        self.assertEqual(updated.status_code, 200)
        updated_body = updated.json()
        self.assertTrue(updated_body["client_has_unread_updates"])
        self.assertEqual(updated_body["client_unread_event_type"], "STATUS")

        with self.SessionLocal() as db:
            refreshed = db.get(Request, UUID(request_id))
            self.assertIsNotNone(refreshed)
            self.assertEqual(refreshed.status_code, "IN_PROGRESS")
            self.assertTrue(refreshed.client_has_unread_updates)
            self.assertEqual(refreshed.client_unread_event_type, "STATUS")

    def test_topic_status_flow_blocks_disallowed_transitions(self):
        headers = self._auth_headers("ADMIN", email="root@example.com")
        with self.SessionLocal() as db:
            db.add(Topic(code="civil-law", name="Гражданское право", enabled=True, sort_order=1))
            db.add_all(
                [
                    TopicStatusTransition(topic_code="civil-law", from_status="NEW", to_status="IN_PROGRESS", enabled=True, sort_order=1),
                    TopicStatusTransition(
                        topic_code="civil-law",
                        from_status="IN_PROGRESS",
                        to_status="WAITING_CLIENT",
                        enabled=True,
                        sort_order=2,
                    ),
                ]
            )
            req = Request(
                track_number="TRK-FLOW-1",
                client_name="Клиент Флоу",
                client_phone="+79997770011",
                topic_code="civil-law",
                status_code="NEW",
                description="flow",
                extra_fields={},
            )
            db.add(req)
            db.commit()
            request_id = str(req.id)

        allowed = self.client.patch(
            f"/api/admin/crud/requests/{request_id}",
            headers=headers,
            json={"status_code": "IN_PROGRESS"},
        )
        self.assertEqual(allowed.status_code, 200)

        blocked = self.client.patch(
            f"/api/admin/crud/requests/{request_id}",
            headers=headers,
            json={"status_code": "CLOSED"},
        )
        self.assertEqual(blocked.status_code, 400)
        self.assertIn("Переход статуса не разрешен", blocked.json().get("detail", ""))

        blocked_legacy = self.client.patch(
            f"/api/admin/requests/{request_id}",
            headers=headers,
            json={"status_code": "CLOSED"},
        )
        self.assertEqual(blocked_legacy.status_code, 400)
        self.assertIn("Переход статуса не разрешен", blocked_legacy.json().get("detail", ""))

    def test_topic_without_configured_flow_keeps_backward_compatibility(self):
        headers = self._auth_headers("ADMIN", email="root@example.com")
        with self.SessionLocal() as db:
            db.add(Topic(code="tax-law", name="Налоговое право", enabled=True, sort_order=1))
            req = Request(
                track_number="TRK-FLOW-2",
                client_name="Клиент Флоу 2",
                client_phone="+79997770012",
                topic_code="tax-law",
                status_code="NEW",
                description="flow fallback",
                extra_fields={},
            )
            db.add(req)
            db.commit()
            request_id = str(req.id)

        updated = self.client.patch(
            f"/api/admin/crud/requests/{request_id}",
            headers=headers,
            json={"status_code": "CLOSED"},
        )
        self.assertEqual(updated.status_code, 200)

    def test_admin_can_configure_sla_hours_for_status_transition(self):
        headers = self._auth_headers("ADMIN", email="root@example.com")
        with self.SessionLocal() as db:
            db.add(Topic(code="civil-law", name="Гражданское право", enabled=True, sort_order=1))
            db.add_all(
                [
                    Status(code="NEW", name="Новая", enabled=True, sort_order=0, is_terminal=False),
                    Status(code="IN_PROGRESS", name="В работе", enabled=True, sort_order=1, is_terminal=False),
                ]
            )
            db.commit()

        created = self.client.post(
            "/api/admin/crud/topic_status_transitions",
            headers=headers,
            json={
                "topic_code": "civil-law",
                "from_status": "NEW",
                "to_status": "IN_PROGRESS",
                "enabled": True,
                "sort_order": 1,
                "sla_hours": 24,
            },
        )
        self.assertEqual(created.status_code, 201)
        body = created.json()
        self.assertEqual(body["sla_hours"], 24)
        row_id = body["id"]

        updated = self.client.patch(
            f"/api/admin/crud/topic_status_transitions/{row_id}",
            headers=headers,
            json={"sla_hours": 12},
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["sla_hours"], 12)

        invalid_zero = self.client.patch(
            f"/api/admin/crud/topic_status_transitions/{row_id}",
            headers=headers,
            json={"sla_hours": 0},
        )
        self.assertEqual(invalid_zero.status_code, 400)

        invalid_same_status = self.client.patch(
            f"/api/admin/crud/topic_status_transitions/{row_id}",
            headers=headers,
            json={"to_status": "NEW"},
        )
        self.assertEqual(invalid_same_status.status_code, 400)

    def test_status_change_freezes_previous_messages_and_attachments_and_writes_history(self):
        headers = self._auth_headers("ADMIN", email="root@example.com")
        with self.SessionLocal() as db:
            req = Request(
                track_number="TRK-IMM-1",
                client_name="Клиент Иммутабельность",
                client_phone="+79998880011",
                topic_code="civil-law",
                status_code="NEW",
                description="immutable",
                extra_fields={},
            )
            db.add(req)
            db.flush()
            msg = Message(
                request_id=req.id,
                author_type="CLIENT",
                author_name="Клиент",
                body="Первое сообщение",
                immutable=False,
            )
            att = Attachment(
                request_id=req.id,
                file_name="old.pdf",
                mime_type="application/pdf",
                size_bytes=100,
                s3_key="requests/old.pdf",
                immutable=False,
            )
            db.add_all([msg, att])
            db.commit()
            request_id = str(req.id)
            message_id = str(msg.id)
            attachment_id = str(att.id)

        changed = self.client.patch(
            f"/api/admin/crud/requests/{request_id}",
            headers=headers,
            json={"status_code": "IN_PROGRESS"},
        )
        self.assertEqual(changed.status_code, 200)

        with self.SessionLocal() as db:
            msg = db.get(Message, UUID(message_id))
            att = db.get(Attachment, UUID(attachment_id))
            self.assertIsNotNone(msg)
            self.assertIsNotNone(att)
            self.assertTrue(msg.immutable)
            self.assertTrue(att.immutable)
            history = db.query(StatusHistory).filter(StatusHistory.request_id == UUID(request_id)).all()
            self.assertEqual(len(history), 1)
            self.assertEqual(history[0].from_status, "NEW")
            self.assertEqual(history[0].to_status, "IN_PROGRESS")

        blocked_update = self.client.patch(
            f"/api/admin/crud/messages/{message_id}",
            headers=headers,
            json={"body": "Попытка правки"},
        )
        self.assertEqual(blocked_update.status_code, 400)
        self.assertIn("зафиксирована", blocked_update.json().get("detail", ""))

        blocked_delete = self.client.delete(f"/api/admin/crud/attachments/{attachment_id}", headers=headers)
        self.assertEqual(blocked_delete.status_code, 400)
        self.assertIn("зафиксирована", blocked_delete.json().get("detail", ""))

    def test_legacy_request_patch_also_writes_status_history_and_freezes(self):
        headers = self._auth_headers("ADMIN", email="root@example.com")
        with self.SessionLocal() as db:
            req = Request(
                track_number="TRK-IMM-2",
                client_name="Клиент Legacy",
                client_phone="+79998880012",
                topic_code="civil-law",
                status_code="NEW",
                description="legacy immutable",
                extra_fields={},
            )
            db.add(req)
            db.flush()
            msg = Message(
                request_id=req.id,
                author_type="LAWYER",
                author_name="Юрист",
                body="Ответ",
                immutable=False,
            )
            db.add(msg)
            db.commit()
            request_id = str(req.id)
            message_id = str(msg.id)

        changed = self.client.patch(
            f"/api/admin/requests/{request_id}",
            headers=headers,
            json={"status_code": "IN_PROGRESS"},
        )
        self.assertEqual(changed.status_code, 200)

        with self.SessionLocal() as db:
            msg = db.get(Message, UUID(message_id))
            self.assertIsNotNone(msg)
            self.assertTrue(msg.immutable)
            history = db.query(StatusHistory).filter(StatusHistory.request_id == UUID(request_id)).all()
            self.assertEqual(len(history), 1)
            self.assertEqual(history[0].from_status, "NEW")
            self.assertEqual(history[0].to_status, "IN_PROGRESS")

    def test_request_status_route_returns_progress_and_respects_role_scope(self):
        with self.SessionLocal() as db:
            db.add_all(
                [
                    Status(code="NEW", name="Новая", enabled=True, sort_order=1, kind="DEFAULT"),
                    Status(code="IN_PROGRESS", name="В работе", enabled=True, sort_order=2, kind="DEFAULT"),
                    Status(code="WAITING_CLIENT", name="Ожидание клиента", enabled=True, sort_order=3, kind="DEFAULT"),
                ]
            )
            db.add_all(
                [
                    TopicStatusTransition(
                        topic_code="civil-law",
                        from_status="NEW",
                        to_status="IN_PROGRESS",
                        enabled=True,
                        sla_hours=24,
                        sort_order=1,
                    ),
                    TopicStatusTransition(
                        topic_code="civil-law",
                        from_status="IN_PROGRESS",
                        to_status="WAITING_CLIENT",
                        enabled=True,
                        sla_hours=72,
                        sort_order=2,
                    ),
                ]
            )
            lawyer = AdminUser(
                role="LAWYER",
                name="Юрист маршрута",
                email="lawyer.route@example.com",
                password_hash="hash",
                is_active=True,
            )
            outsider = AdminUser(
                role="LAWYER",
                name="Чужой юрист",
                email="lawyer.outside.route@example.com",
                password_hash="hash",
                is_active=True,
            )
            db.add_all([lawyer, outsider])
            db.flush()
            req = Request(
                track_number="TRK-ROUTE-1",
                client_name="Клиент",
                client_phone="+79990001122",
                topic_code="civil-law",
                status_code="IN_PROGRESS",
                assigned_lawyer_id=str(lawyer.id),
                description="route check",
                extra_fields={},
            )
            db.add(req)
            db.flush()
            db.add(
                StatusHistory(
                    request_id=req.id,
                    from_status="NEW",
                    to_status="IN_PROGRESS",
                    comment="start progress",
                    changed_by_admin_id=None,
                )
            )
            db.commit()
            request_id = str(req.id)
            lawyer_id = str(lawyer.id)
            outsider_id = str(outsider.id)

        admin_headers = self._auth_headers("ADMIN", email="root@example.com")
        assigned_headers = self._auth_headers("LAWYER", email="lawyer.route@example.com", sub=lawyer_id)
        outsider_headers = self._auth_headers("LAWYER", email="lawyer.outside.route@example.com", sub=outsider_id)

        admin_response = self.client.get(f"/api/admin/requests/{request_id}/status-route", headers=admin_headers)
        self.assertEqual(admin_response.status_code, 200)
        payload = admin_response.json()
        self.assertEqual(payload["current_status"], "IN_PROGRESS")
        nodes = payload.get("nodes") or []
        self.assertEqual([item["code"] for item in nodes], ["NEW", "IN_PROGRESS", "WAITING_CLIENT"])
        self.assertEqual(nodes[0]["state"], "completed")
        self.assertEqual(nodes[1]["state"], "current")
        self.assertEqual(nodes[2]["state"], "pending")
        self.assertEqual(nodes[1]["sla_hours"], 24)
        self.assertEqual(nodes[2]["sla_hours"], 72)

        assigned_response = self.client.get(f"/api/admin/requests/{request_id}/status-route", headers=assigned_headers)
        self.assertEqual(assigned_response.status_code, 200)
        self.assertEqual(assigned_response.json()["current_status"], "IN_PROGRESS")

        outsider_forbidden = self.client.get(f"/api/admin/requests/{request_id}/status-route", headers=outsider_headers)
        self.assertEqual(outsider_forbidden.status_code, 403)

    def test_lawyer_can_claim_unassigned_request_and_takeover_is_forbidden(self):
        with self.SessionLocal() as db:
            lawyer1 = AdminUser(
                role="LAWYER",
                name="Юрист 1",
                email="lawyer1@example.com",
                password_hash="hash",
                is_active=True,
            )
            lawyer2 = AdminUser(
                role="LAWYER",
                name="Юрист 2",
                email="lawyer2@example.com",
                password_hash="hash",
                is_active=True,
            )
            request_row = Request(
                track_number="TRK-CLAIM-1",
                client_name="Клиент",
                client_phone="+79991112233",
                status_code="NEW",
                description="claim test",
                extra_fields={},
                assigned_lawyer_id=None,
            )
            db.add_all([lawyer1, lawyer2, request_row])
            db.commit()
            lawyer1_id = str(lawyer1.id)
            lawyer2_id = str(lawyer2.id)
            request_id = str(request_row.id)

        headers1 = self._auth_headers("LAWYER", email="lawyer1@example.com", sub=lawyer1_id)
        headers2 = self._auth_headers("LAWYER", email="lawyer2@example.com", sub=lawyer2_id)
        admin_headers = self._auth_headers("ADMIN", email="root@example.com")

        first = self.client.post(f"/api/admin/requests/{request_id}/claim", headers=headers1)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.json()["assigned_lawyer_id"], lawyer1_id)

        second = self.client.post(f"/api/admin/requests/{request_id}/claim", headers=headers2)
        self.assertEqual(second.status_code, 409)

        admin_forbidden = self.client.post(f"/api/admin/requests/{request_id}/claim", headers=admin_headers)
        self.assertEqual(admin_forbidden.status_code, 403)

        with self.SessionLocal() as db:
            row = db.get(Request, UUID(request_id))
            self.assertIsNotNone(row)
            self.assertEqual(row.assigned_lawyer_id, lawyer1_id)
            claim_audits = db.query(AuditLog).filter(AuditLog.entity == "requests", AuditLog.entity_id == request_id, AuditLog.action == "MANUAL_CLAIM").all()
            self.assertEqual(len(claim_audits), 1)

    def test_lawyer_cannot_assign_request_via_universal_crud(self):
        with self.SessionLocal() as db:
            lawyer = AdminUser(
                role="LAWYER",
                name="Юрист",
                email="lawyer-assign@example.com",
                password_hash="hash",
                is_active=True,
            )
            request_row = Request(
                track_number="TRK-CLAIM-2",
                client_name="Клиент",
                client_phone="+79994445566",
                status_code="NEW",
                description="crud assign block",
                extra_fields={},
                assigned_lawyer_id=None,
            )
            db.add_all([lawyer, request_row])
            db.commit()
            lawyer_id = str(lawyer.id)
            request_id = str(request_row.id)

        headers = self._auth_headers("LAWYER", email="lawyer-assign@example.com", sub=lawyer_id)
        blocked_update = self.client.patch(
            f"/api/admin/crud/requests/{request_id}",
            headers=headers,
            json={"assigned_lawyer_id": lawyer_id},
        )
        self.assertEqual(blocked_update.status_code, 403)

        blocked_create = self.client.post(
            "/api/admin/crud/requests",
            headers=headers,
            json={
                "client_name": "Новый клиент",
                "client_phone": "+79990001122",
                "status_code": "NEW",
                "description": "blocked create assign",
                "assigned_lawyer_id": lawyer_id,
            },
        )
        self.assertEqual(blocked_create.status_code, 403)

        blocked_update_legacy = self.client.patch(
            f"/api/admin/requests/{request_id}",
            headers=headers,
            json={"assigned_lawyer_id": lawyer_id},
        )
        self.assertEqual(blocked_update_legacy.status_code, 403)

        blocked_create_legacy = self.client.post(
            "/api/admin/requests",
            headers=headers,
            json={
                "client_name": "Legacy клиент",
                "client_phone": "+79990001123",
                "status_code": "NEW",
                "description": "legacy assign block",
                "assigned_lawyer_id": lawyer_id,
            },
        )
        self.assertEqual(blocked_create_legacy.status_code, 403)

    def test_admin_can_reassign_assigned_request(self):
        with self.SessionLocal() as db:
            lawyer_from = AdminUser(
                role="LAWYER",
                name="Юрист Исходный",
                email="lawyer-from@example.com",
                password_hash="hash",
                is_active=True,
            )
            lawyer_to = AdminUser(
                role="LAWYER",
                name="Юрист Целевой",
                email="lawyer-to@example.com",
                password_hash="hash",
                is_active=True,
            )
            request_row = Request(
                track_number="TRK-REASSIGN-1",
                client_name="Клиент",
                client_phone="+79993334455",
                status_code="NEW",
                description="reassign test",
                extra_fields={},
                assigned_lawyer_id=None,
            )
            db.add_all([lawyer_from, lawyer_to, request_row])
            db.commit()
            lawyer_from_id = str(lawyer_from.id)
            lawyer_to_id = str(lawyer_to.id)
            request_id = str(request_row.id)

        claim_headers = self._auth_headers("LAWYER", email="lawyer-from@example.com", sub=lawyer_from_id)
        claimed = self.client.post(f"/api/admin/requests/{request_id}/claim", headers=claim_headers)
        self.assertEqual(claimed.status_code, 200)

        admin_headers = self._auth_headers("ADMIN", email="root@example.com")
        reassigned = self.client.post(
            f"/api/admin/requests/{request_id}/reassign",
            headers=admin_headers,
            json={"lawyer_id": lawyer_to_id},
        )
        self.assertEqual(reassigned.status_code, 200)
        body = reassigned.json()
        self.assertEqual(body["from_lawyer_id"], lawyer_from_id)
        self.assertEqual(body["assigned_lawyer_id"], lawyer_to_id)

        with self.SessionLocal() as db:
            row = db.get(Request, UUID(request_id))
            self.assertIsNotNone(row)
            self.assertEqual(row.assigned_lawyer_id, lawyer_to_id)
            events = db.query(AuditLog).filter(AuditLog.entity == "requests", AuditLog.entity_id == request_id).all()
            actions = [event.action for event in events]
            self.assertIn("MANUAL_REASSIGN", actions)

    def test_reassign_is_admin_only_and_validates_request_state(self):
        with self.SessionLocal() as db:
            lawyer1 = AdminUser(
                role="LAWYER",
                name="Юрист Один",
                email="lawyer-one@example.com",
                password_hash="hash",
                is_active=True,
            )
            lawyer2 = AdminUser(
                role="LAWYER",
                name="Юрист Два",
                email="lawyer-two@example.com",
                password_hash="hash",
                is_active=True,
            )
            db.add_all([lawyer1, lawyer2])
            db.flush()
            lawyer1_id = str(lawyer1.id)
            lawyer2_id = str(lawyer2.id)

            request_unassigned = Request(
                track_number="TRK-REASSIGN-2",
                client_name="Клиент",
                client_phone="+79995556677",
                status_code="NEW",
                description="reassign invalid",
                extra_fields={},
                assigned_lawyer_id=None,
            )
            request_assigned = Request(
                track_number="TRK-REASSIGN-3",
                client_name="Клиент",
                client_phone="+79995556678",
                status_code="NEW",
                description="reassign invalid same",
                extra_fields={},
                assigned_lawyer_id=lawyer1_id,
            )
            db.add_all([request_unassigned, request_assigned])
            db.commit()
            unassigned_id = str(request_unassigned.id)
            assigned_id = str(request_assigned.id)

        admin_headers = self._auth_headers("ADMIN", email="root@example.com")
        lawyer_headers = self._auth_headers("LAWYER", email="lawyer-one@example.com", sub=lawyer1_id)

        lawyer_forbidden = self.client.post(
            f"/api/admin/requests/{assigned_id}/reassign",
            headers=lawyer_headers,
            json={"lawyer_id": lawyer2_id},
        )
        self.assertEqual(lawyer_forbidden.status_code, 403)

        unassigned_blocked = self.client.post(
            f"/api/admin/requests/{unassigned_id}/reassign",
            headers=admin_headers,
            json={"lawyer_id": lawyer2_id},
        )
        self.assertEqual(unassigned_blocked.status_code, 400)

        same_lawyer_blocked = self.client.post(
            f"/api/admin/requests/{assigned_id}/reassign",
            headers=admin_headers,
            json={"lawyer_id": lawyer1_id},
        )
        self.assertEqual(same_lawyer_blocked.status_code, 400)

    def test_responsible_is_protected_from_manual_input(self):
        headers = self._auth_headers("ADMIN")
        response = self.client.post(
            "/api/admin/crud/quotes",
            headers=headers,
            json={"author": "A", "text": "B", "responsible": "hacker@example.com"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("Неизвестные поля", response.json().get("detail", ""))

    def test_calculated_fields_are_read_only_for_universal_crud(self):
        headers = self._auth_headers("ADMIN", email="root@example.com")

        blocked_create = self.client.post(
            "/api/admin/crud/requests",
            headers=headers,
            json={
                "client_name": "Клиент readonly",
                "client_phone": "+79995550011",
                "status_code": "NEW",
                "description": "calc readonly",
                "invoice_amount": 12500,
            },
        )
        self.assertEqual(blocked_create.status_code, 400)
        self.assertIn("Неизвестные поля", blocked_create.json().get("detail", ""))

        created = self.client.post(
            "/api/admin/crud/requests",
            headers=headers,
            json={
                "client_name": "Клиент readonly",
                "client_phone": "+79995550012",
                "status_code": "NEW",
                "description": "valid create",
            },
        )
        self.assertEqual(created.status_code, 201)
        request_id = created.json()["id"]

        blocked_patch = self.client.patch(
            f"/api/admin/crud/requests/{request_id}",
            headers=headers,
            json={"paid_at": "2026-02-24T12:00:00+03:00"},
        )
        self.assertEqual(blocked_patch.status_code, 400)
        self.assertIn("Неизвестные поля", blocked_patch.json().get("detail", ""))

        meta_response = self.client.get("/api/admin/crud/meta/tables", headers=headers)
        self.assertEqual(meta_response.status_code, 200)
        by_table = {row["table"]: row for row in (meta_response.json().get("tables") or [])}

        request_columns = {col["name"]: col for col in (by_table.get("requests", {}).get("columns") or [])}
        self.assertIn("invoice_amount", request_columns)
        self.assertIn("paid_at", request_columns)
        self.assertIn("paid_by_admin_id", request_columns)
        self.assertIn("total_attachments_bytes", request_columns)
        self.assertFalse(request_columns["invoice_amount"]["editable"])
        self.assertFalse(request_columns["paid_at"]["editable"])
        self.assertFalse(request_columns["paid_by_admin_id"]["editable"])
        self.assertFalse(request_columns["total_attachments_bytes"]["editable"])

        invoice_columns = {col["name"]: col for col in (by_table.get("invoices", {}).get("columns") or [])}
        self.assertIn("issued_at", invoice_columns)
        self.assertIn("paid_at", invoice_columns)
        self.assertFalse(invoice_columns["issued_at"]["editable"])
        self.assertFalse(invoice_columns["paid_at"]["editable"])

    def test_topic_code_is_autogenerated_when_missing(self):
        headers = self._auth_headers("ADMIN")
        first = self.client.post(
            "/api/admin/crud/topics",
            headers=headers,
            json={"name": "Семейное право"},
        )
        self.assertEqual(first.status_code, 201)
        body1 = first.json()
        self.assertTrue(body1.get("code"))
        self.assertRegex(body1["code"], r"^[a-z0-9-]+$")

        second = self.client.post(
            "/api/admin/crud/topics",
            headers=headers,
            json={"name": "Семейное право"},
        )
        self.assertEqual(second.status_code, 201)
        body2 = second.json()
        self.assertTrue(body2.get("code"))
        self.assertRegex(body2["code"], r"^[a-z0-9-]+$")
        self.assertNotEqual(body1["code"], body2["code"])

    def test_admin_can_manage_users_with_password_hashing(self):
        headers = self._auth_headers("ADMIN", email="root@example.com")
        topic_create = self.client.post(
            "/api/admin/crud/topics",
            headers=headers,
            json={"code": "civil-law", "name": "Гражданское право"},
        )
        self.assertEqual(topic_create.status_code, 201)

        created = self.client.post(
            "/api/admin/crud/admin_users",
            headers=headers,
            json={
                "name": "Юрист Тестовый",
                "email": "Lawyer.TEST@Example.com",
                "role": "LAWYER",
                "primary_topic_code": "civil-law",
                "avatar_url": "https://cdn.example.com/avatars/lawyer-test.png",
                "password": "StartPass-123",
                "is_active": True,
            },
        )
        self.assertEqual(created.status_code, 201)
        body = created.json()
        self.assertEqual(body["email"], "lawyer.test@example.com")
        self.assertEqual(body["role"], "LAWYER")
        self.assertEqual(body["avatar_url"], "https://cdn.example.com/avatars/lawyer-test.png")
        self.assertEqual(body["primary_topic_code"], "civil-law")
        self.assertNotIn("password_hash", body)
        user_id = body["id"]
        UUID(user_id)

        with self.SessionLocal() as db:
            user = db.get(AdminUser, UUID(user_id))
            self.assertIsNotNone(user)
            self.assertTrue(verify_password("StartPass-123", user.password_hash))

        updated = self.client.patch(
            f"/api/admin/crud/admin_users/{user_id}",
            headers=headers,
            json={"role": "ADMIN", "password": "UpdatedPass-999", "is_active": False, "primary_topic_code": "", "avatar_url": ""},
        )
        self.assertEqual(updated.status_code, 200)
        upd_body = updated.json()
        self.assertEqual(upd_body["role"], "ADMIN")
        self.assertIsNone(upd_body["avatar_url"])
        self.assertIsNone(upd_body["primary_topic_code"])
        self.assertFalse(upd_body["is_active"])
        self.assertNotIn("password_hash", upd_body)

        with self.SessionLocal() as db:
            user = db.get(AdminUser, UUID(user_id))
            self.assertIsNotNone(user)
            self.assertTrue(verify_password("UpdatedPass-999", user.password_hash))
            self.assertFalse(verify_password("StartPass-123", user.password_hash))

        q = self.client.post(
            "/api/admin/crud/admin_users/query",
            headers=headers,
            json={"filters": [], "sort": [{"field": "created_at", "dir": "desc"}], "page": {"limit": 50, "offset": 0}},
        )
        self.assertEqual(q.status_code, 200)
        self.assertGreaterEqual(q.json()["total"], 1)
        self.assertNotIn("password_hash", q.json()["rows"][0])

        blocked_hash_write = self.client.patch(
            f"/api/admin/crud/admin_users/{user_id}",
            headers=headers,
            json={"password_hash": "forged"},
        )
        self.assertEqual(blocked_hash_write.status_code, 400)

        self_headers = self._auth_headers("ADMIN", email="self@example.com", sub=user_id)
        self_delete = self.client.delete(f"/api/admin/crud/admin_users/{user_id}", headers=self_headers)
        self.assertEqual(self_delete.status_code, 400)

        deleted = self.client.delete(f"/api/admin/crud/admin_users/{user_id}", headers=headers)
        self.assertEqual(deleted.status_code, 200)

    def test_dashboard_metrics_returns_lawyer_loads(self):
        headers = self._auth_headers("ADMIN", email="root@example.com")
        with self.SessionLocal() as db:
            db.add_all(
                [
                    Status(code="NEW", name="Новая", enabled=True, sort_order=0, is_terminal=False),
                    Status(code="IN_PROGRESS", name="В работе", enabled=True, sort_order=1, is_terminal=False),
                    Status(code="CLOSED", name="Закрыта", enabled=True, sort_order=2, is_terminal=True),
                ]
            )
            lawyer_busy = AdminUser(
                role="LAWYER",
                name="Юрист Загруженный",
                email="busy@example.com",
                password_hash="hash",
                avatar_url="https://cdn.example.com/a.png",
                primary_topic_code="civil-law",
                is_active=True,
            )
            lawyer_free = AdminUser(
                role="LAWYER",
                name="Юрист Свободный",
                email="free@example.com",
                password_hash="hash",
                avatar_url=None,
                primary_topic_code="family-law",
                is_active=True,
            )
            db.add_all([lawyer_busy, lawyer_free])
            db.flush()
            db.add_all(
                [
                    Request(
                        track_number="TRK-METRICS-1",
                        client_name="Клиент 1",
                        client_phone="+79990000001",
                        topic_code="civil-law",
                        status_code="NEW",
                        assigned_lawyer_id=str(lawyer_busy.id),
                        extra_fields={},
                    ),
                    Request(
                        track_number="TRK-METRICS-2",
                        client_name="Клиент 2",
                        client_phone="+79990000002",
                        topic_code="civil-law",
                        status_code="CLOSED",
                        assigned_lawyer_id=str(lawyer_busy.id),
                        extra_fields={},
                    ),
                ]
            )
            db.commit()

        response = self.client.get("/api/admin/metrics/overview", headers=headers)
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("lawyer_loads", body)
        self.assertEqual(len(body["lawyer_loads"]), 2)

        by_email = {row["email"]: row for row in body["lawyer_loads"]}
        self.assertEqual(by_email["busy@example.com"]["active_load"], 1)
        self.assertEqual(by_email["busy@example.com"]["total_assigned"], 2)
        self.assertEqual(by_email["busy@example.com"]["avatar_url"], "https://cdn.example.com/a.png")
        self.assertEqual(by_email["free@example.com"]["active_load"], 0)
        self.assertEqual(by_email["free@example.com"]["total_assigned"], 0)

    def test_dashboard_metrics_returns_dynamic_sla_and_frt(self):
        headers = self._auth_headers("ADMIN", email="root@example.com")
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as db:
            db.add_all(
                [
                    Status(code="NEW", name="Новая", enabled=True, sort_order=0, is_terminal=False),
                    Status(code="CLOSED", name="Закрыта", enabled=True, sort_order=1, is_terminal=True),
                ]
            )

            req = Request(
                track_number="TRK-SLA-M-1",
                client_name="Клиент SLA",
                client_phone="+79990000003",
                topic_code="civil-law",
                status_code="NEW",
                extra_fields={},
                created_at=now - timedelta(hours=30),
                updated_at=now - timedelta(hours=30),
            )
            db.add(req)
            db.flush()
            db.add(
                Message(
                    request_id=req.id,
                    author_type="LAWYER",
                    author_name="Юрист",
                    body="Ответ",
                    created_at=req.created_at + timedelta(minutes=20),
                    updated_at=req.created_at + timedelta(minutes=20),
                )
            )
            db.add(
                StatusHistory(
                    request_id=req.id,
                    from_status=None,
                    to_status="NEW",
                    changed_by_admin_id=None,
                    created_at=now - timedelta(hours=30),
                    updated_at=now - timedelta(hours=30),
                )
            )
            db.commit()

        response = self.client.get("/api/admin/metrics/overview", headers=headers)
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertGreaterEqual(int(body.get("sla_overdue") or 0), 1)
        self.assertIsNotNone(body.get("frt_avg_minutes"))
        self.assertAlmostEqual(float(body["frt_avg_minutes"]), 20.0, places=1)
        self.assertIn("NEW", body.get("avg_time_in_status_hours") or {})

    def test_admin_can_manage_admin_user_topics_only_for_lawyers(self):
        headers = self._auth_headers("ADMIN", email="root@example.com")
        with self.SessionLocal() as db:
            db.add_all(
                [
                    Topic(code="civil-law", name="Гражданское право", enabled=True, sort_order=1),
                    Topic(code="tax-law", name="Налоговое право", enabled=True, sort_order=2),
                ]
            )
            lawyer = AdminUser(
                role="LAWYER",
                name="Юрист Профильный",
                email="lawyer.topics@example.com",
                password_hash="hash",
                is_active=True,
            )
            admin = AdminUser(
                role="ADMIN",
                name="Администратор",
                email="admin.topics@example.com",
                password_hash="hash",
                is_active=True,
            )
            db.add_all([lawyer, admin])
            db.commit()
            lawyer_id = str(lawyer.id)
            admin_id = str(admin.id)

        created = self.client.post(
            "/api/admin/crud/admin_user_topics",
            headers=headers,
            json={"admin_user_id": lawyer_id, "topic_code": "civil-law"},
        )
        self.assertEqual(created.status_code, 201)
        body = created.json()
        self.assertEqual(body["admin_user_id"], lawyer_id)
        self.assertEqual(body["topic_code"], "civil-law")
        self.assertEqual(body["responsible"], "root@example.com")
        relation_id = body["id"]
        UUID(relation_id)

        queried = self.client.post(
            "/api/admin/crud/admin_user_topics/query",
            headers=headers,
            json={
                "filters": [{"field": "admin_user_id", "op": "=", "value": lawyer_id}],
                "sort": [{"field": "created_at", "dir": "desc"}],
                "page": {"limit": 50, "offset": 0},
            },
        )
        self.assertEqual(queried.status_code, 200)
        self.assertEqual(queried.json()["total"], 1)

        updated = self.client.patch(
            f"/api/admin/crud/admin_user_topics/{relation_id}",
            headers=headers,
            json={"topic_code": "tax-law"},
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["topic_code"], "tax-law")

        forbidden_for_non_lawyer = self.client.post(
            "/api/admin/crud/admin_user_topics",
            headers=headers,
            json={"admin_user_id": admin_id, "topic_code": "civil-law"},
        )
        self.assertEqual(forbidden_for_non_lawyer.status_code, 400)

        deleted = self.client.delete(f"/api/admin/crud/admin_user_topics/{relation_id}", headers=headers)
        self.assertEqual(deleted.status_code, 200)

    def test_topic_templates_crud_and_request_required_fields_validation(self):
        headers = self._auth_headers("ADMIN", email="root@example.com")
        with self.SessionLocal() as db:
            db.add(Topic(code="civil-law", name="Гражданское право", enabled=True, sort_order=1))
            db.add(
                FormField(
                    key="passport_series",
                    label="Серия паспорта",
                    type="string",
                    required=False,
                    enabled=True,
                    sort_order=1,
                )
            )
            db.commit()

        required_created = self.client.post(
            "/api/admin/crud/topic_required_fields",
            headers=headers,
            json={
                "topic_code": "civil-law",
                "field_key": "passport_series",
                "required": True,
                "enabled": True,
                "sort_order": 10,
            },
        )
        self.assertEqual(required_created.status_code, 201)
        self.assertEqual(required_created.json()["responsible"], "root@example.com")

        invalid_required = self.client.post(
            "/api/admin/crud/topic_required_fields",
            headers=headers,
            json={
                "topic_code": "civil-law",
                "field_key": "missing_field",
                "required": True,
                "enabled": True,
                "sort_order": 11,
            },
        )
        self.assertEqual(invalid_required.status_code, 400)

        template_created = self.client.post(
            "/api/admin/crud/topic_data_templates",
            headers=headers,
            json={
                "topic_code": "civil-law",
                "key": "court_file",
                "label": "Судебный файл",
                "description": "PDF с материалами",
                "required": True,
                "enabled": True,
                "sort_order": 1,
            },
        )
        self.assertEqual(template_created.status_code, 201)
        self.assertEqual(template_created.json()["topic_code"], "civil-law")

        blocked = self.client.post(
            "/api/admin/crud/requests",
            headers=headers,
            json={
                "client_name": "ООО Проверка",
                "client_phone": "+79995550001",
                "topic_code": "civil-law",
                "status_code": "NEW",
                "description": "missing required extra field",
                "extra_fields": {},
            },
        )
        self.assertEqual(blocked.status_code, 400)
        self.assertIn("passport_series", blocked.json().get("detail", ""))

        created = self.client.post(
            "/api/admin/crud/requests",
            headers=headers,
            json={
                "client_name": "ООО Проверка",
                "client_phone": "+79995550001",
                "topic_code": "civil-law",
                "status_code": "NEW",
                "description": "required extra field provided",
                "extra_fields": {"passport_series": "1234"},
            },
        )
        self.assertEqual(created.status_code, 201)
        request_id = created.json()["id"]

        with self.SessionLocal() as db:
            row = db.get(Request, UUID(request_id))
            self.assertIsNotNone(row)
            self.assertEqual(row.extra_fields, {"passport_series": "1234"})

    def test_request_data_template_endpoints_for_assigned_lawyer(self):
        headers_admin = self._auth_headers("ADMIN", email="root@example.com")
        with self.SessionLocal() as db:
            db.add(Topic(code="civil-law", name="Гражданское право", enabled=True, sort_order=1))
            lawyer = AdminUser(
                role="LAWYER",
                name="Юрист Шаблон",
                email="lawyer.template@example.com",
                password_hash="hash",
                is_active=True,
            )
            outsider = AdminUser(
                role="LAWYER",
                name="Юрист Чужой",
                email="lawyer.outside@example.com",
                password_hash="hash",
                is_active=True,
            )
            db.add_all([lawyer, outsider])
            db.flush()
            req = Request(
                track_number="TRK-TEMPLATE-1",
                client_name="Клиент",
                client_phone="+79997770013",
                topic_code="civil-law",
                status_code="IN_PROGRESS",
                assigned_lawyer_id=str(lawyer.id),
                description="template flow",
                extra_fields={},
            )
            db.add(req)
            db.flush()
            db.add_all(
                [
                    TopicDataTemplate(
                        topic_code="civil-law",
                        key="power_of_attorney",
                        label="Доверенность",
                        description="Скан доверенности",
                        required=True,
                        enabled=True,
                        sort_order=1,
                    ),
                    TopicDataTemplate(
                        topic_code="civil-law",
                        key="claim_copy",
                        label="Копия иска",
                        description="Копия заявления",
                        required=False,
                        enabled=True,
                        sort_order=2,
                    ),
                ]
            )
            db.commit()
            request_id = str(req.id)
            lawyer_id = str(lawyer.id)
            outsider_id = str(outsider.id)

        headers_lawyer = self._auth_headers("LAWYER", email="lawyer.template@example.com", sub=lawyer_id)
        headers_outsider = self._auth_headers("LAWYER", email="lawyer.outside@example.com", sub=outsider_id)

        pre = self.client.get(f"/api/admin/requests/{request_id}/data-template", headers=headers_lawyer)
        self.assertEqual(pre.status_code, 200)
        self.assertEqual(len(pre.json()["topic_items"]), 2)
        self.assertEqual(len(pre.json()["request_items"]), 0)

        sync = self.client.post(f"/api/admin/requests/{request_id}/data-template/sync", headers=headers_lawyer)
        self.assertEqual(sync.status_code, 200)
        self.assertEqual(sync.json()["created"], 2)

        sync_repeat = self.client.post(f"/api/admin/requests/{request_id}/data-template/sync", headers=headers_lawyer)
        self.assertEqual(sync_repeat.status_code, 200)
        self.assertEqual(sync_repeat.json()["created"], 0)

        created_custom = self.client.post(
            f"/api/admin/requests/{request_id}/data-template/items",
            headers=headers_lawyer,
            json={
                "key": "additional_scan",
                "label": "Дополнительный скан",
                "description": "Любой дополнительный файл",
                "required": False,
            },
        )
        self.assertEqual(created_custom.status_code, 201)
        custom_item_id = created_custom.json()["id"]

        updated_custom = self.client.patch(
            f"/api/admin/requests/{request_id}/data-template/items/{custom_item_id}",
            headers=headers_lawyer,
            json={"label": "Дополнительный скан (обновлено)", "required": True},
        )
        self.assertEqual(updated_custom.status_code, 200)
        self.assertEqual(updated_custom.json()["label"], "Дополнительный скан (обновлено)")
        self.assertTrue(updated_custom.json()["required"])

        outsider_forbidden = self.client.get(f"/api/admin/requests/{request_id}/data-template", headers=headers_outsider)
        self.assertEqual(outsider_forbidden.status_code, 403)

        admin_access = self.client.get(f"/api/admin/requests/{request_id}/data-template", headers=headers_admin)
        self.assertEqual(admin_access.status_code, 200)
        self.assertEqual(len(admin_access.json()["request_items"]), 3)

        deleted_custom = self.client.delete(
            f"/api/admin/requests/{request_id}/data-template/items/{custom_item_id}",
            headers=headers_lawyer,
        )
        self.assertEqual(deleted_custom.status_code, 200)

        with self.SessionLocal() as db:
            count = db.query(RequestDataRequirement).filter(RequestDataRequirement.request_id == UUID(request_id)).count()
        self.assertEqual(count, 2)
