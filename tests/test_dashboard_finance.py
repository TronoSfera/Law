import os
import unittest
from datetime import datetime, timedelta, timezone
from uuid import uuid4

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
from app.models.audit_log import AuditLog
from app.models.message import Message
from app.models.request import Request
from app.models.request_service_request import RequestServiceRequest
from app.models.status import Status
from app.models.status_history import StatusHistory
from app.models.topic_status_transition import TopicStatusTransition


class DashboardFinanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite+pysqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.SessionLocal = sessionmaker(bind=cls.engine, autocommit=False, autoflush=False)
        AdminUser.__table__.create(bind=cls.engine)
        AuditLog.__table__.create(bind=cls.engine)
        Request.__table__.create(bind=cls.engine)
        Status.__table__.create(bind=cls.engine)
        Message.__table__.create(bind=cls.engine)
        RequestServiceRequest.__table__.create(bind=cls.engine)
        StatusHistory.__table__.create(bind=cls.engine)
        TopicStatusTransition.__table__.create(bind=cls.engine)

    @classmethod
    def tearDownClass(cls):
        StatusHistory.__table__.drop(bind=cls.engine)
        TopicStatusTransition.__table__.drop(bind=cls.engine)
        RequestServiceRequest.__table__.drop(bind=cls.engine)
        Message.__table__.drop(bind=cls.engine)
        Status.__table__.drop(bind=cls.engine)
        Request.__table__.drop(bind=cls.engine)
        AuditLog.__table__.drop(bind=cls.engine)
        AdminUser.__table__.drop(bind=cls.engine)
        cls.engine.dispose()

    def setUp(self):
        with self.SessionLocal() as db:
            db.execute(delete(StatusHistory))
            db.execute(delete(TopicStatusTransition))
            db.execute(delete(Message))
            db.execute(delete(RequestServiceRequest))
            db.execute(delete(Request))
            db.execute(delete(Status))
            db.execute(delete(AuditLog))
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
    def _headers(role: str, sub: str | None = None, email: str | None = None) -> dict[str, str]:
        token = create_jwt(
            {"sub": sub or str(uuid4()), "email": email or f"{role.lower()}@example.com", "role": role},
            settings.ADMIN_JWT_SECRET,
            timedelta(minutes=30),
        )
        return {"Authorization": f"Bearer {token}"}

    def test_admin_dashboard_contains_lawyer_financial_metrics(self):
        now = datetime.now(timezone.utc)
        current_month_event = now - timedelta(days=2)
        with self.SessionLocal() as db:
            db.add_all(
                [
                    Status(code="NEW", name="Новая", enabled=True, sort_order=0, is_terminal=False),
                    Status(code="CLOSED", name="Закрыта", enabled=True, sort_order=1, is_terminal=True),
                    Status(code="PAID", name="Оплачено", enabled=True, sort_order=2, is_terminal=False),
                ]
            )
            lawyer_a = AdminUser(
                role="LAWYER",
                name="Юрист A",
                email="lawyer.a@example.com",
                password_hash="hash",
                salary_percent=30,
                default_rate=5000,
                is_active=True,
            )
            lawyer_b = AdminUser(
                role="LAWYER",
                name="Юрист B",
                email="lawyer.b@example.com",
                password_hash="hash",
                salary_percent=10,
                default_rate=3000,
                is_active=True,
            )
            db.add_all([lawyer_a, lawyer_b])
            db.flush()

            req_a_active = Request(
                track_number="TRK-FIN-A1",
                client_name="Клиент A1",
                client_phone="+79990000010",
                topic_code="civil",
                status_code="NEW",
                assigned_lawyer_id=str(lawyer_a.id),
                invoice_amount=1000,
                extra_fields={},
            )
            req_a_closed = Request(
                track_number="TRK-FIN-A2",
                client_name="Клиент A2",
                client_phone="+79990000011",
                topic_code="civil",
                status_code="CLOSED",
                assigned_lawyer_id=str(lawyer_a.id),
                invoice_amount=500,
                extra_fields={},
            )
            req_b_active = Request(
                track_number="TRK-FIN-B1",
                client_name="Клиент B1",
                client_phone="+79990000012",
                topic_code="civil",
                status_code="NEW",
                assigned_lawyer_id=str(lawyer_b.id),
                invoice_amount=2000,
                extra_fields={},
            )
            db.add_all([req_a_active, req_a_closed, req_b_active])
            db.flush()

            db.add_all(
                [
                    StatusHistory(
                        request_id=req_a_active.id,
                        from_status="INVOICE",
                        to_status="PAID",
                        changed_by_admin_id=None,
                        created_at=current_month_event,
                        updated_at=current_month_event,
                    ),
                    StatusHistory(
                        request_id=req_a_active.id,
                        from_status="INVOICE",
                        to_status="PAID",
                        changed_by_admin_id=None,
                        created_at=current_month_event + timedelta(hours=1),
                        updated_at=current_month_event + timedelta(hours=1),
                    ),
                    StatusHistory(
                        request_id=req_a_closed.id,
                        from_status="INVOICE",
                        to_status="PAID",
                        changed_by_admin_id=None,
                        created_at=current_month_event + timedelta(hours=2),
                        updated_at=current_month_event + timedelta(hours=2),
                    ),
                    StatusHistory(
                        request_id=req_b_active.id,
                        from_status="INVOICE",
                        to_status="PAID",
                        changed_by_admin_id=None,
                        created_at=now - timedelta(days=40),
                        updated_at=now - timedelta(days=40),
                    ),
                    StatusHistory(
                        request_id=req_a_closed.id,
                        from_status="IN_PROGRESS",
                        to_status="CLOSED",
                        changed_by_admin_id=None,
                        created_at=current_month_event + timedelta(hours=3),
                        updated_at=current_month_event + timedelta(hours=3),
                    ),
                ]
            )
            db.add_all(
                [
                    AuditLog(
                        actor_admin_id=None,
                        entity="requests",
                        entity_id=str(req_a_active.id),
                        action="MANUAL_CLAIM",
                        diff={"assigned_lawyer_id": str(lawyer_a.id)},
                        created_at=current_month_event,
                        updated_at=current_month_event,
                    ),
                    AuditLog(
                        actor_admin_id=None,
                        entity="requests",
                        entity_id=str(req_a_closed.id),
                        action="MANUAL_REASSIGN",
                        diff={"from_lawyer_id": str(lawyer_b.id), "to_lawyer_id": str(lawyer_a.id)},
                        created_at=current_month_event + timedelta(minutes=10),
                        updated_at=current_month_event + timedelta(minutes=10),
                    ),
                    AuditLog(
                        actor_admin_id=None,
                        entity="requests",
                        entity_id=str(req_b_active.id),
                        action="MANUAL_CLAIM",
                        diff={"assigned_lawyer_id": str(lawyer_b.id)},
                        created_at=current_month_event + timedelta(minutes=20),
                        updated_at=current_month_event + timedelta(minutes=20),
                    ),
                ]
            )
            db.commit()

        response = self.client.get("/api/admin/metrics/overview", headers=self._headers("ADMIN"))
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body.get("scope"), "ADMIN")
        self.assertIn("lawyer_loads", body)
        self.assertAlmostEqual(float(body.get("month_revenue") or 0.0), 2500.0, places=2)
        self.assertAlmostEqual(float(body.get("month_expenses") or 0.0), 750.0, places=2)

        by_email = {row["email"]: row for row in body["lawyer_loads"]}
        self.assertEqual(by_email["lawyer.a@example.com"]["active_load"], 1)
        self.assertEqual(by_email["lawyer.a@example.com"]["total_assigned"], 2)
        self.assertAlmostEqual(float(by_email["lawyer.a@example.com"]["active_amount"]), 1000.0, places=2)
        self.assertEqual(by_email["lawyer.a@example.com"]["monthly_paid_events"], 3)
        self.assertEqual(by_email["lawyer.a@example.com"]["monthly_assigned_count"], 2)
        self.assertEqual(by_email["lawyer.a@example.com"]["monthly_completed_count"], 1)
        self.assertAlmostEqual(float(by_email["lawyer.a@example.com"]["monthly_paid_gross"]), 2500.0, places=2)
        self.assertAlmostEqual(float(by_email["lawyer.a@example.com"]["monthly_salary"]), 750.0, places=2)

        self.assertEqual(by_email["lawyer.b@example.com"]["active_load"], 1)
        self.assertAlmostEqual(float(by_email["lawyer.b@example.com"]["active_amount"]), 2000.0, places=2)
        self.assertEqual(by_email["lawyer.b@example.com"]["monthly_assigned_count"], 1)
        self.assertEqual(by_email["lawyer.b@example.com"]["monthly_completed_count"], 0)
        self.assertEqual(by_email["lawyer.b@example.com"]["monthly_paid_events"], 0)
        self.assertAlmostEqual(float(by_email["lawyer.b@example.com"]["monthly_paid_gross"]), 0.0, places=2)
        self.assertAlmostEqual(float(by_email["lawyer.b@example.com"]["monthly_salary"]), 0.0, places=2)

    def test_admin_can_get_lawyer_active_requests_dashboard_detail(self):
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as db:
            db.add_all(
                [
                    Status(code="NEW", name="Новая", enabled=True, sort_order=0, is_terminal=False),
                    Status(code="CLOSED", name="Закрыта", enabled=True, sort_order=1, is_terminal=True),
                    Status(code="PAID", name="Оплачено", enabled=True, sort_order=2, is_terminal=False),
                ]
            )
            lawyer = AdminUser(
                role="LAWYER",
                name="Юрист Деталь",
                email="lawyer.detail@example.com",
                password_hash="hash",
                salary_percent=25,
                default_rate=4000,
                is_active=True,
            )
            db.add(lawyer)
            db.flush()

            active_req = Request(
                track_number="TRK-DETAIL-ACTIVE",
                client_name="Клиент Деталь",
                client_phone="+79990002001",
                topic_code="civil",
                status_code="NEW",
                assigned_lawyer_id=str(lawyer.id),
                invoice_amount=1200,
                extra_fields={},
            )
            closed_req = Request(
                track_number="TRK-DETAIL-CLOSED",
                client_name="Клиент Закрыт",
                client_phone="+79990002002",
                topic_code="civil",
                status_code="CLOSED",
                assigned_lawyer_id=str(lawyer.id),
                invoice_amount=700,
                extra_fields={},
            )
            db.add_all([active_req, closed_req])
            db.flush()
            db.add(
                StatusHistory(
                    request_id=active_req.id,
                    from_status="INVOICE",
                    to_status="PAID",
                    changed_by_admin_id=None,
                    created_at=now - timedelta(days=1),
                    updated_at=now - timedelta(days=1),
                )
            )
            db.commit()
            lawyer_id = str(lawyer.id)

        response = self.client.get(
            f"/api/admin/metrics/lawyers/{lawyer_id}/active-requests",
            headers=self._headers("ADMIN"),
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(int(body.get("total") or 0), 1)
        self.assertEqual(len(body.get("rows") or []), 1)
        row = (body.get("rows") or [])[0]
        self.assertEqual(row.get("track_number"), "TRK-DETAIL-ACTIVE")
        self.assertEqual(int(row.get("month_paid_events") or 0), 1)
        self.assertAlmostEqual(float(row.get("month_paid_amount") or 0.0), 1200.0, places=2)
        self.assertAlmostEqual(float(row.get("month_salary_amount") or 0.0), 300.0, places=2)
        self.assertAlmostEqual(float((body.get("totals") or {}).get("amount") or 0.0), 1200.0, places=2)
        self.assertAlmostEqual(float((body.get("totals") or {}).get("salary") or 0.0), 300.0, places=2)

    def test_lawyer_dashboard_is_scoped_to_current_lawyer(self):
        with self.SessionLocal() as db:
            db.add_all(
                [
                    Status(code="NEW", name="Новая", enabled=True, sort_order=0, is_terminal=False),
                    Status(code="CLOSED", name="Закрыта", enabled=True, sort_order=1, is_terminal=True),
                ]
            )
            lawyer_a = AdminUser(
                role="LAWYER",
                name="Юрист A",
                email="lawyer.scope.a@example.com",
                password_hash="hash",
                salary_percent=20,
                default_rate=4000,
                is_active=True,
            )
            lawyer_b = AdminUser(
                role="LAWYER",
                name="Юрист B",
                email="lawyer.scope.b@example.com",
                password_hash="hash",
                salary_percent=15,
                default_rate=3500,
                is_active=True,
            )
            db.add_all([lawyer_a, lawyer_b])
            db.flush()

            db.add_all(
                [
                    Request(
                        track_number="TRK-SCOPE-A1",
                        client_name="Клиент A1",
                        client_phone="+79990001001",
                        topic_code="civil",
                        status_code="NEW",
                        assigned_lawyer_id=str(lawyer_a.id),
                        lawyer_has_unread_updates=True,
                        lawyer_unread_event_type="MESSAGE",
                        extra_fields={},
                    ),
                    Request(
                        track_number="TRK-SCOPE-A2",
                        client_name="Клиент A2",
                        client_phone="+79990001002",
                        topic_code="civil",
                        status_code="CLOSED",
                        assigned_lawyer_id=str(lawyer_a.id),
                        extra_fields={},
                    ),
                    Request(
                        track_number="TRK-SCOPE-B1",
                        client_name="Клиент B1",
                        client_phone="+79990001003",
                        topic_code="civil",
                        status_code="NEW",
                        assigned_lawyer_id=str(lawyer_b.id),
                        extra_fields={},
                    ),
                    Request(
                        track_number="TRK-SCOPE-U1",
                        client_name="Клиент U1",
                        client_phone="+79990001004",
                        topic_code="civil",
                        status_code="NEW",
                        assigned_lawyer_id=None,
                        extra_fields={},
                    ),
                ]
            )
            db.commit()
            lawyer_a_id = str(lawyer_a.id)

        response = self.client.get(
            "/api/admin/metrics/overview",
            headers=self._headers("LAWYER", sub=lawyer_a_id, email="lawyer.scope.a@example.com"),
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body.get("scope"), "LAWYER")
        self.assertEqual(int(body.get("assigned_total") or 0), 2)
        self.assertEqual(int(body.get("active_assigned_total") or 0), 1)
        self.assertEqual(int(body.get("unassigned_total") or 0), 1)
        self.assertEqual(int(body.get("my_unread_updates") or 0), 1)
        self.assertEqual(int((body.get("my_unread_by_event") or {}).get("MESSAGE") or 0), 1)
        self.assertEqual(int((body.get("by_status") or {}).get("NEW") or 0), 1)
        self.assertEqual(int((body.get("by_status") or {}).get("CLOSED") or 0), 1)
        self.assertEqual(len(body.get("lawyer_loads") or []), 1)
        self.assertEqual((body.get("lawyer_loads") or [])[0].get("lawyer_id"), lawyer_a_id)
