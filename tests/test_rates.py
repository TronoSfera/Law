import os
import unittest
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

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
from app.models.admin_user_topic import AdminUserTopic
from app.models.audit_log import AuditLog
from app.models.client import Client
from app.models.notification import Notification
from app.models.request import Request
from app.models.status import Status
from app.models.topic_required_field import TopicRequiredField
from app.workers.tasks import assign as assign_task


class RequestRatesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite+pysqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.SessionLocal = sessionmaker(bind=cls.engine, autocommit=False, autoflush=False)
        AdminUser.__table__.create(bind=cls.engine)
        AdminUserTopic.__table__.create(bind=cls.engine)
        Client.__table__.create(bind=cls.engine)
        Request.__table__.create(bind=cls.engine)
        Status.__table__.create(bind=cls.engine)
        TopicRequiredField.__table__.create(bind=cls.engine)
        Notification.__table__.create(bind=cls.engine)
        AuditLog.__table__.create(bind=cls.engine)

        cls._old_session_local = assign_task.SessionLocal
        assign_task.SessionLocal = cls.SessionLocal

    @classmethod
    def tearDownClass(cls):
        assign_task.SessionLocal = cls._old_session_local
        AuditLog.__table__.drop(bind=cls.engine)
        Notification.__table__.drop(bind=cls.engine)
        TopicRequiredField.__table__.drop(bind=cls.engine)
        Status.__table__.drop(bind=cls.engine)
        Request.__table__.drop(bind=cls.engine)
        Client.__table__.drop(bind=cls.engine)
        AdminUserTopic.__table__.drop(bind=cls.engine)
        AdminUser.__table__.drop(bind=cls.engine)
        cls.engine.dispose()

    def setUp(self):
        with self.SessionLocal() as db:
            db.execute(delete(AuditLog))
            db.execute(delete(Notification))
            db.execute(delete(TopicRequiredField))
            db.execute(delete(Status))
            db.execute(delete(Request))
            db.execute(delete(Client))
            db.execute(delete(AdminUserTopic))
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
    def _auth_headers(role: str, email: str, sub: str | None = None) -> dict[str, str]:
        token = create_jwt(
            {"sub": str(sub or uuid4()), "email": email, "role": role},
            settings.ADMIN_JWT_SECRET,
            timedelta(minutes=30),
        )
        return {"Authorization": f"Bearer {token}"}

    def test_claim_sets_effective_rate_from_lawyer_profile(self):
        with self.SessionLocal() as db:
            lawyer = AdminUser(
                role="LAWYER",
                name="Юрист",
                email="lawyer-rate@example.com",
                password_hash="hash",
                is_active=True,
                default_rate=5000,
            )
            req = Request(
                track_number="TRK-RATE-CLAIM-1",
                client_name="Клиент",
                client_phone="+79990000001",
                status_code="NEW",
                description="claim",
                extra_fields={},
            )
            db.add_all([lawyer, req])
            db.commit()
            lawyer_id = str(lawyer.id)
            request_id = str(req.id)

        headers = self._auth_headers("LAWYER", "lawyer-rate@example.com", sub=lawyer_id)
        response = self.client.post(f"/api/admin/requests/{request_id}/claim", headers=headers)
        self.assertEqual(response.status_code, 200)

        with self.SessionLocal() as db:
            row = db.get(Request, UUID(request_id))
            self.assertIsNotNone(row)
            self.assertEqual(row.assigned_lawyer_id, lawyer_id)
            self.assertAlmostEqual(float(row.effective_rate or 0), 5000.0, places=2)

    def test_claim_keeps_existing_effective_rate(self):
        with self.SessionLocal() as db:
            lawyer = AdminUser(
                role="LAWYER",
                name="Юрист",
                email="lawyer-fixed@example.com",
                password_hash="hash",
                is_active=True,
                default_rate=5000,
            )
            req = Request(
                track_number="TRK-RATE-CLAIM-2",
                client_name="Клиент",
                client_phone="+79990000002",
                status_code="NEW",
                description="claim fixed",
                extra_fields={},
                effective_rate=7777,
            )
            db.add_all([lawyer, req])
            db.commit()
            lawyer_id = str(lawyer.id)
            request_id = str(req.id)

        headers = self._auth_headers("LAWYER", "lawyer-fixed@example.com", sub=lawyer_id)
        response = self.client.post(f"/api/admin/requests/{request_id}/claim", headers=headers)
        self.assertEqual(response.status_code, 200)

        with self.SessionLocal() as db:
            row = db.get(Request, UUID(request_id))
            self.assertIsNotNone(row)
            self.assertAlmostEqual(float(row.effective_rate or 0), 7777.0, places=2)

    def test_reassign_sets_effective_rate_only_when_missing(self):
        with self.SessionLocal() as db:
            from_lawyer = AdminUser(
                role="LAWYER",
                name="From",
                email="from-rate@example.com",
                password_hash="hash",
                is_active=True,
                default_rate=1000,
            )
            to_lawyer = AdminUser(
                role="LAWYER",
                name="To",
                email="to-rate@example.com",
                password_hash="hash",
                is_active=True,
                default_rate=9000,
            )
            db.add_all([from_lawyer, to_lawyer])
            db.flush()

            fixed_req = Request(
                track_number="TRK-RATE-REASSIGN-1",
                client_name="Клиент",
                client_phone="+79990000003",
                status_code="NEW",
                description="fixed",
                extra_fields={},
                assigned_lawyer_id=str(from_lawyer.id),
                effective_rate=6500,
            )
            missing_req = Request(
                track_number="TRK-RATE-REASSIGN-2",
                client_name="Клиент",
                client_phone="+79990000004",
                status_code="NEW",
                description="missing",
                extra_fields={},
                assigned_lawyer_id=str(from_lawyer.id),
                effective_rate=None,
            )
            db.add_all([fixed_req, missing_req])
            db.commit()
            to_lawyer_id = str(to_lawyer.id)
            fixed_id = str(fixed_req.id)
            missing_id = str(missing_req.id)

        admin_headers = self._auth_headers("ADMIN", "root@example.com")
        fixed_reassign = self.client.post(
            f"/api/admin/requests/{fixed_id}/reassign",
            headers=admin_headers,
            json={"lawyer_id": to_lawyer_id},
        )
        self.assertEqual(fixed_reassign.status_code, 200)

        missing_reassign = self.client.post(
            f"/api/admin/requests/{missing_id}/reassign",
            headers=admin_headers,
            json={"lawyer_id": to_lawyer_id},
        )
        self.assertEqual(missing_reassign.status_code, 200)

        with self.SessionLocal() as db:
            fixed = db.get(Request, UUID(fixed_id))
            missing = db.get(Request, UUID(missing_id))
            self.assertIsNotNone(fixed)
            self.assertIsNotNone(missing)
            self.assertAlmostEqual(float(fixed.effective_rate or 0), 6500.0, places=2)
            self.assertAlmostEqual(float(missing.effective_rate or 0), 9000.0, places=2)

    def test_auto_assign_sets_effective_rate_when_missing(self):
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as db:
            db.add_all(
                [
                    Status(code="NEW", name="Новая", enabled=True, sort_order=0, is_terminal=False),
                    Status(code="CLOSED", name="Закрыта", enabled=True, sort_order=99, is_terminal=True),
                ]
            )
            lawyer = AdminUser(
                role="LAWYER",
                name="Auto",
                email="auto-rate@example.com",
                password_hash="hash",
                is_active=True,
                primary_topic_code="family",
                default_rate=4200,
            )
            db.add(lawyer)
            db.flush()
            req_missing = Request(
                track_number="TRK-RATE-AUTO-1",
                client_name="Клиент",
                client_phone="+79990000005",
                topic_code="family",
                status_code="NEW",
                description="auto-missing",
                extra_fields={},
                created_at=now - timedelta(hours=30),
                updated_at=now - timedelta(hours=30),
            )
            req_fixed = Request(
                track_number="TRK-RATE-AUTO-2",
                client_name="Клиент",
                client_phone="+79990000006",
                topic_code="family",
                status_code="NEW",
                description="auto-fixed",
                extra_fields={},
                effective_rate=3333,
                created_at=now - timedelta(hours=29),
                updated_at=now - timedelta(hours=29),
            )
            db.add_all([req_missing, req_fixed])
            db.commit()
            missing_id = str(req_missing.id)
            fixed_id = str(req_fixed.id)
            lawyer_id = str(lawyer.id)

        result = assign_task.auto_assign_unclaimed()
        self.assertEqual(result["assigned"], 2)

        with self.SessionLocal() as db:
            missing = db.get(Request, UUID(missing_id))
            fixed = db.get(Request, UUID(fixed_id))
            self.assertIsNotNone(missing)
            self.assertIsNotNone(fixed)
            self.assertEqual(missing.assigned_lawyer_id, lawyer_id)
            self.assertEqual(fixed.assigned_lawyer_id, lawyer_id)
            self.assertAlmostEqual(float(missing.effective_rate or 0), 4200.0, places=2)
            self.assertAlmostEqual(float(fixed.effective_rate or 0), 3333.0, places=2)

    def test_lawyer_cannot_write_financial_fields(self):
        with self.SessionLocal() as db:
            lawyer = AdminUser(
                role="LAWYER",
                name="Lawyer",
                email="lawyer-finance@example.com",
                password_hash="hash",
                is_active=True,
            )
            db.add(lawyer)
            db.commit()
            lawyer_id = str(lawyer.id)

        headers = self._auth_headers("LAWYER", "lawyer-finance@example.com", sub=lawyer_id)

        blocked_create_legacy = self.client.post(
            "/api/admin/requests",
            headers=headers,
            json={
                "client_name": "Клиент",
                "client_phone": "+79990000007",
                "status_code": "NEW",
                "description": "legacy",
                "effective_rate": 100,
            },
        )
        self.assertEqual(blocked_create_legacy.status_code, 403)

        blocked_create_crud = self.client.post(
            "/api/admin/crud/requests",
            headers=headers,
            json={
                "client_name": "Клиент",
                "client_phone": "+79990000008",
                "status_code": "NEW",
                "description": "crud",
                "invoice_amount": 500,
            },
        )
        self.assertEqual(blocked_create_crud.status_code, 403)

        created = self.client.post(
            "/api/admin/requests",
            headers=headers,
            json={
                "client_name": "Клиент",
                "client_phone": "+79990000009",
                "status_code": "NEW",
                "description": "allowed",
            },
        )
        self.assertEqual(created.status_code, 201)
        request_id = created.json()["id"]

        blocked_patch_legacy = self.client.patch(
            f"/api/admin/requests/{request_id}",
            headers=headers,
            json={"effective_rate": 200},
        )
        self.assertEqual(blocked_patch_legacy.status_code, 403)

        blocked_patch_crud = self.client.patch(
            f"/api/admin/crud/requests/{request_id}",
            headers=headers,
            json={"invoice_amount": 900},
        )
        self.assertEqual(blocked_patch_crud.status_code, 403)

    def test_admin_assignment_autofills_effective_rate_in_create_and_update(self):
        with self.SessionLocal() as db:
            lawyer = AdminUser(
                role="LAWYER",
                name="Rate",
                email="admin-assign-rate@example.com",
                password_hash="hash",
                is_active=True,
                default_rate=6100,
            )
            db.add(lawyer)
            db.commit()
            lawyer_id = str(lawyer.id)

        admin_headers = self._auth_headers("ADMIN", "root@example.com")

        created_legacy = self.client.post(
            "/api/admin/requests",
            headers=admin_headers,
            json={
                "client_name": "Клиент A",
                "client_phone": "+79990000010",
                "status_code": "NEW",
                "description": "legacy create",
                "assigned_lawyer_id": lawyer_id,
            },
        )
        self.assertEqual(created_legacy.status_code, 201)
        legacy_id = created_legacy.json()["id"]

        created_crud = self.client.post(
            "/api/admin/crud/requests",
            headers=admin_headers,
            json={
                "client_name": "Клиент B",
                "client_phone": "+79990000011",
                "status_code": "NEW",
                "description": "crud create",
                "assigned_lawyer_id": lawyer_id,
            },
        )
        self.assertEqual(created_crud.status_code, 201)
        crud_id = created_crud.json()["id"]

        created_manual = self.client.post(
            "/api/admin/requests",
            headers=admin_headers,
            json={
                "client_name": "Клиент C",
                "client_phone": "+79990000012",
                "status_code": "NEW",
                "description": "manual rate",
                "assigned_lawyer_id": lawyer_id,
                "effective_rate": 7300,
            },
        )
        self.assertEqual(created_manual.status_code, 201)
        manual_id = created_manual.json()["id"]

        created_unassigned_legacy = self.client.post(
            "/api/admin/requests",
            headers=admin_headers,
            json={
                "client_name": "Клиент D",
                "client_phone": "+79990000013",
                "status_code": "NEW",
                "description": "legacy update",
            },
        )
        self.assertEqual(created_unassigned_legacy.status_code, 201)
        unassigned_legacy_id = created_unassigned_legacy.json()["id"]

        created_unassigned_crud = self.client.post(
            "/api/admin/crud/requests",
            headers=admin_headers,
            json={
                "client_name": "Клиент E",
                "client_phone": "+79990000014",
                "status_code": "NEW",
                "description": "crud update",
            },
        )
        self.assertEqual(created_unassigned_crud.status_code, 201)
        unassigned_crud_id = created_unassigned_crud.json()["id"]

        patched_legacy = self.client.patch(
            f"/api/admin/requests/{unassigned_legacy_id}",
            headers=admin_headers,
            json={"assigned_lawyer_id": lawyer_id},
        )
        self.assertEqual(patched_legacy.status_code, 200)

        patched_crud = self.client.patch(
            f"/api/admin/crud/requests/{unassigned_crud_id}",
            headers=admin_headers,
            json={"assigned_lawyer_id": lawyer_id},
        )
        self.assertEqual(patched_crud.status_code, 200)

        with self.SessionLocal() as db:
            legacy_row = db.get(Request, UUID(legacy_id))
            crud_row = db.get(Request, UUID(crud_id))
            manual_row = db.get(Request, UUID(manual_id))
            patched_legacy_row = db.get(Request, UUID(unassigned_legacy_id))
            patched_crud_row = db.get(Request, UUID(unassigned_crud_id))

            self.assertAlmostEqual(float(legacy_row.effective_rate or 0), 6100.0, places=2)
            self.assertAlmostEqual(float(crud_row.effective_rate or 0), 6100.0, places=2)
            self.assertAlmostEqual(float(manual_row.effective_rate or 0), 7300.0, places=2)
            self.assertAlmostEqual(float(patched_legacy_row.effective_rate or 0), 6100.0, places=2)
            self.assertAlmostEqual(float(patched_crud_row.effective_rate or 0), 6100.0, places=2)

    def test_public_request_read_does_not_expose_financial_fields(self):
        with self.SessionLocal() as db:
            req = Request(
                track_number="TRK-RATE-PUBLIC-1",
                client_name="Клиент",
                client_phone="+79990000015",
                status_code="IN_PROGRESS",
                description="public",
                extra_fields={},
                effective_rate=8800,
                invoice_amount=12500,
            )
            db.add(req)
            db.commit()

        public_token = create_jwt(
            {"sub": "TRK-RATE-PUBLIC-1", "purpose": "VIEW_REQUEST"},
            settings.PUBLIC_JWT_SECRET,
            timedelta(days=1),
        )
        cookies = {settings.PUBLIC_COOKIE_NAME: public_token}

        response = self.client.get("/api/public/requests/TRK-RATE-PUBLIC-1", cookies=cookies)
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertNotIn("effective_rate", body)
        self.assertNotIn("invoice_amount", body)
        self.assertNotIn("paid_at", body)
        self.assertNotIn("paid_by_admin_id", body)


if __name__ == "__main__":
    unittest.main()
