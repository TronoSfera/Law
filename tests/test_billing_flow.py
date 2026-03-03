import os
import unittest
from datetime import timedelta
from uuid import UUID, uuid4
from unittest.mock import patch

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
from app.models.invoice import Invoice
from app.models.message import Message
from app.models.notification import Notification
from app.models.request import Request
from app.models.status import Status
from app.models.status_history import StatusHistory
from app.models.topic_status_transition import TopicStatusTransition
from app.services.invoice_crypto import decrypt_requisites


class _FakeS3Storage:
    def __init__(self):
        self.objects = {}


class BillingFlowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite+pysqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.SessionLocal = sessionmaker(bind=cls.engine, autocommit=False, autoflush=False)

        AdminUser.__table__.create(bind=cls.engine)
        Status.__table__.create(bind=cls.engine)
        Request.__table__.create(bind=cls.engine)
        Message.__table__.create(bind=cls.engine)
        Attachment.__table__.create(bind=cls.engine)
        StatusHistory.__table__.create(bind=cls.engine)
        Notification.__table__.create(bind=cls.engine)
        Invoice.__table__.create(bind=cls.engine)
        TopicStatusTransition.__table__.create(bind=cls.engine)

    @classmethod
    def tearDownClass(cls):
        Invoice.__table__.drop(bind=cls.engine)
        TopicStatusTransition.__table__.drop(bind=cls.engine)
        Notification.__table__.drop(bind=cls.engine)
        StatusHistory.__table__.drop(bind=cls.engine)
        Attachment.__table__.drop(bind=cls.engine)
        Message.__table__.drop(bind=cls.engine)
        Request.__table__.drop(bind=cls.engine)
        Status.__table__.drop(bind=cls.engine)
        AdminUser.__table__.drop(bind=cls.engine)
        cls.engine.dispose()

    def setUp(self):
        with self.SessionLocal() as db:
            db.execute(delete(Invoice))
            db.execute(delete(Notification))
            db.execute(delete(StatusHistory))
            db.execute(delete(TopicStatusTransition))
            db.execute(delete(Attachment))
            db.execute(delete(Message))
            db.execute(delete(Request))
            db.execute(delete(Status))
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
        self.fake_s3 = _FakeS3Storage()
        self.s3_patch = patch("app.services.invoice_chat.get_s3_storage", return_value=self.fake_s3)
        self.s3_patch.start()

    def tearDown(self):
        self.client.close()
        self.s3_patch.stop()
        app.dependency_overrides.clear()

    @staticmethod
    def _auth_headers(role: str, email: str, sub: str | None = None) -> dict[str, str]:
        token = create_jwt(
            {"sub": str(sub or uuid4()), "email": email, "role": role},
            settings.ADMIN_JWT_SECRET,
            timedelta(minutes=30),
        )
        return {"Authorization": f"Bearer {token}"}

    def _seed_statuses(self):
        with self.SessionLocal() as db:
            db.add_all(
                [
                    Status(code="NEW", name="Новая", enabled=True, sort_order=0, is_terminal=False, kind="DEFAULT"),
                    Status(
                        code="BILLING",
                        name="Выставление счета",
                        enabled=True,
                        sort_order=1,
                        is_terminal=False,
                        kind="INVOICE",
                        invoice_template="Счет по заявке {track_number}; клиент {client_name}; сумма {amount}",
                    ),
                    Status(code="IN_PROGRESS", name="В работе", enabled=True, sort_order=2, is_terminal=False, kind="DEFAULT"),
                    Status(code="PAID", name="Оплачено", enabled=True, sort_order=3, is_terminal=False, kind="PAID"),
                ]
            )
            db.commit()

    def test_entering_billing_status_creates_waiting_invoice_from_template(self):
        self._seed_statuses()
        with self.SessionLocal() as db:
            req = Request(
                track_number="TRK-BILL-1",
                client_name="ООО Клиент",
                client_phone="+79990000021",
                status_code="NEW",
                topic_code=None,
                description="billing",
                extra_fields={},
                effective_rate=4300,
            )
            db.add(req)
            db.commit()
            request_id = str(req.id)

        admin_headers = self._auth_headers("ADMIN", "root@example.com")
        changed = self.client.patch(
            f"/api/admin/requests/{request_id}",
            headers=admin_headers,
            json={"status_code": "BILLING"},
        )
        self.assertEqual(changed.status_code, 200)

        with self.SessionLocal() as db:
            req = db.get(Request, UUID(request_id))
            self.assertIsNotNone(req)
            self.assertEqual(req.status_code, "BILLING")
            self.assertAlmostEqual(float(req.invoice_amount or 0), 4300.0, places=2)

            rows = db.query(Invoice).filter(Invoice.request_id == req.id).all()
            self.assertEqual(len(rows), 1)
            invoice = rows[0]
            self.assertEqual(invoice.status, "WAITING_PAYMENT")
            self.assertEqual(invoice.payer_display_name, "ООО Клиент")
            self.assertAlmostEqual(float(invoice.amount or 0), 4300.0, places=2)
            details = decrypt_requisites(invoice.payer_details_encrypted)
            rendered = str((details or {}).get("template_rendered") or "")
            self.assertIn("TRK-BILL-1", rendered)
            self.assertIn("ООО Клиент", rendered)

    def test_workflow_billing_invoice_contains_autofilled_requisites(self):
        self._seed_statuses()
        with self.SessionLocal() as db:
            req = Request(
                track_number="TRK-BILL-AUTO",
                client_name="ООО Авто",
                client_phone="+79990000111",
                status_code="NEW",
                topic_code="consulting",
                description="auto requisites",
                extra_fields={},
                invoice_amount=12500.5,
            )
            db.add(req)
            db.commit()
            request_id = str(req.id)

        admin_headers = self._auth_headers("ADMIN", "root@example.com")
        changed = self.client.patch(
            f"/api/admin/requests/{request_id}",
            headers=admin_headers,
            json={"status_code": "BILLING"},
        )
        self.assertEqual(changed.status_code, 200)

        with self.SessionLocal() as db:
            req = db.get(Request, UUID(request_id))
            self.assertIsNotNone(req)
            invoice = (
                db.query(Invoice)
                .filter(Invoice.request_id == req.id)
                .order_by(Invoice.issued_at.desc(), Invoice.created_at.desc(), Invoice.id.desc())
                .first()
            )
            self.assertIsNotNone(invoice)
            details = decrypt_requisites(invoice.payer_details_encrypted)
            self.assertEqual(details.get("request_track_number"), "TRK-BILL-AUTO")
            self.assertEqual(details.get("topic_code"), "consulting")
            rendered = str(details.get("template_rendered") or "")
            self.assertTrue(rendered)
            self.assertIn("TRK-BILL-AUTO", rendered)
            self.assertIn("ООО Авто", rendered)
            message = None
            message_rows = (
                db.query(Message)
                .filter(Message.request_id == req.id)
                .order_by(Message.created_at.desc(), Message.id.desc())
                .all()
            )
            for item in message_rows:
                if str(item.body or "").strip() == "Счет на оплату":
                    message = item
                    break
            self.assertIsNotNone(message)
            attachment = (
                db.query(Attachment)
                .filter(Attachment.request_id == req.id, Attachment.message_id == message.id)
                .order_by(Attachment.created_at.desc(), Attachment.id.desc())
                .first()
            )
            self.assertIsNotNone(attachment)
            self.assertEqual(attachment.mime_type, "application/pdf")
            self.assertIn(str(invoice.invoice_number), str(attachment.file_name))
            self.assertGreater(int(req.total_attachments_bytes or 0), 0)

            stored = self.fake_s3.objects.get(str(attachment.s3_key))
            self.assertIsNotNone(stored)
            self.assertEqual(stored.get("mime"), "application/pdf")
            self.assertTrue(bytes(stored.get("content") or b"").startswith(b"%PDF"))

    def test_paid_status_requires_admin_and_marks_waiting_invoice_paid(self):
        self._seed_statuses()
        with self.SessionLocal() as db:
            lawyer = AdminUser(
                role="LAWYER",
                name="Юрист",
                email="lawyer-paid@example.com",
                password_hash="hash",
                is_active=True,
            )
            req = Request(
                track_number="TRK-BILL-2",
                client_name="Клиент",
                client_phone="+79990000022",
                status_code="BILLING",
                topic_code=None,
                description="billing",
                extra_fields={},
            )
            db.add_all([lawyer, req])
            db.flush()
            invoice = Invoice(
                request_id=req.id,
                invoice_number="INV-MANUAL-1",
                status="WAITING_PAYMENT",
                amount=7500,
                currency="RUB",
                payer_display_name=req.client_name,
                payer_details_encrypted=None,
                issued_by_admin_user_id=None,
                issued_by_role="ADMIN",
                issued_at=req.created_at,
                paid_at=None,
                responsible="root@example.com",
            )
            db.add(invoice)
            db.commit()
            request_id = str(req.id)
            lawyer_id = str(lawyer.id)
            invoice_id = str(invoice.id)

        lawyer_headers = self._auth_headers("LAWYER", "lawyer-paid@example.com", sub=lawyer_id)
        blocked = self.client.patch(
            f"/api/admin/requests/{request_id}",
            headers=lawyer_headers,
            json={"status_code": "PAID"},
        )
        self.assertEqual(blocked.status_code, 403)

        admin_headers = self._auth_headers("ADMIN", "root@example.com")
        paid = self.client.patch(
            f"/api/admin/requests/{request_id}",
            headers=admin_headers,
            json={"status_code": "PAID"},
        )
        self.assertEqual(paid.status_code, 200)

        with self.SessionLocal() as db:
            req = db.get(Request, UUID(request_id))
            inv = db.get(Invoice, UUID(invoice_id))
            self.assertIsNotNone(req)
            self.assertIsNotNone(inv)
            self.assertEqual(inv.status, "PAID")
            self.assertIsNotNone(inv.paid_at)
            self.assertEqual(req.status_code, "PAID")
            self.assertIsNotNone(req.paid_at)
            self.assertEqual(str(req.paid_at), str(inv.paid_at))
            self.assertIsNotNone(req.paid_by_admin_id)
            self.assertAlmostEqual(float(req.invoice_amount or 0), 7500.0, places=2)

    def test_paid_status_without_waiting_invoice_returns_400(self):
        self._seed_statuses()
        with self.SessionLocal() as db:
            req = Request(
                track_number="TRK-BILL-3",
                client_name="Клиент",
                client_phone="+79990000023",
                status_code="IN_PROGRESS",
                topic_code=None,
                description="billing",
                extra_fields={},
            )
            db.add(req)
            db.commit()
            request_id = str(req.id)

        admin_headers = self._auth_headers("ADMIN", "root@example.com")
        blocked = self.client.patch(
            f"/api/admin/requests/{request_id}",
            headers=admin_headers,
            json={"status_code": "PAID"},
        )
        self.assertEqual(blocked.status_code, 400)
        self.assertIn("Ожидает оплату", blocked.json().get("detail", ""))

    def test_multiple_billing_cycles_are_supported(self):
        self._seed_statuses()
        with self.SessionLocal() as db:
            req = Request(
                track_number="TRK-BILL-4",
                client_name="Клиент",
                client_phone="+79990000024",
                status_code="NEW",
                topic_code=None,
                description="billing",
                extra_fields={},
                effective_rate=1000,
            )
            db.add(req)
            db.commit()
            request_id = str(req.id)

        admin_headers = self._auth_headers("ADMIN", "root@example.com")

        first_billing = self.client.patch(
            f"/api/admin/requests/{request_id}",
            headers=admin_headers,
            json={"status_code": "BILLING"},
        )
        self.assertEqual(first_billing.status_code, 200)

        with self.SessionLocal() as db:
            req = db.get(Request, UUID(request_id))
            first_invoice = (
                db.query(Invoice)
                .filter(Invoice.request_id == req.id)
                .order_by(Invoice.issued_at.desc(), Invoice.created_at.desc(), Invoice.id.desc())
                .first()
            )
            self.assertIsNotNone(first_invoice)
            first_invoice_id = str(first_invoice.id)

        tune_first_amount = self.client.patch(
            f"/api/admin/invoices/{first_invoice_id}",
            headers=admin_headers,
            json={"amount": 1100},
        )
        self.assertEqual(tune_first_amount.status_code, 200)

        first_paid = self.client.patch(
            f"/api/admin/requests/{request_id}",
            headers=admin_headers,
            json={"status_code": "PAID"},
        )
        self.assertEqual(first_paid.status_code, 200)

        back_to_work = self.client.patch(
            f"/api/admin/requests/{request_id}",
            headers=admin_headers,
            json={"status_code": "IN_PROGRESS"},
        )
        self.assertEqual(back_to_work.status_code, 200)

        set_second_amount = self.client.patch(
            f"/api/admin/requests/{request_id}",
            headers=admin_headers,
            json={"invoice_amount": 2500},
        )
        self.assertEqual(set_second_amount.status_code, 200)

        second_billing = self.client.patch(
            f"/api/admin/requests/{request_id}",
            headers=admin_headers,
            json={"status_code": "BILLING"},
        )
        self.assertEqual(second_billing.status_code, 200)

        second_paid = self.client.patch(
            f"/api/admin/requests/{request_id}",
            headers=admin_headers,
            json={"status_code": "PAID"},
        )
        self.assertEqual(second_paid.status_code, 200)

        with self.SessionLocal() as db:
            req = db.get(Request, UUID(request_id))
            self.assertIsNotNone(req)
            invoices = (
                db.query(Invoice)
                .filter(Invoice.request_id == req.id)
                .order_by(Invoice.issued_at.asc(), Invoice.created_at.asc(), Invoice.id.asc())
                .all()
            )
            self.assertEqual(len(invoices), 2)
            self.assertEqual(invoices[0].status, "PAID")
            self.assertEqual(invoices[1].status, "PAID")
            self.assertIsNotNone(invoices[0].paid_at)
            self.assertIsNotNone(invoices[1].paid_at)
            self.assertAlmostEqual(float(invoices[0].amount or 0), 1100.0, places=2)
            self.assertAlmostEqual(float(invoices[1].amount or 0), 2500.0, places=2)
            self.assertAlmostEqual(float(req.invoice_amount or 0), 2500.0, places=2)
            self.assertEqual(str(req.paid_at), str(invoices[1].paid_at))


if __name__ == "__main__":
    unittest.main()
