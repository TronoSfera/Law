import os
import unittest
from datetime import timedelta
from uuid import UUID
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
from app.models.invoice import Invoice
from app.models.request import Request
from app.services.invoice_crypto import decrypt_requisites


class InvoiceApiTests(unittest.TestCase):
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
        Invoice.__table__.create(bind=cls.engine)

    @classmethod
    def tearDownClass(cls):
        Invoice.__table__.drop(bind=cls.engine)
        Request.__table__.drop(bind=cls.engine)
        AdminUser.__table__.drop(bind=cls.engine)
        cls.engine.dispose()

    def setUp(self):
        with self.SessionLocal() as db:
            db.execute(delete(Invoice))
            db.execute(delete(Request))
            db.execute(delete(AdminUser))
            db.commit()

            self.admin = AdminUser(
                role="ADMIN",
                name="Админ",
                email="admin@example.com",
                password_hash="hash",
                is_active=True,
            )
            self.lawyer_a = AdminUser(
                role="LAWYER",
                name="Юрист А",
                email="lawyer-a@example.com",
                password_hash="hash",
                is_active=True,
            )
            self.lawyer_b = AdminUser(
                role="LAWYER",
                name="Юрист Б",
                email="lawyer-b@example.com",
                password_hash="hash",
                is_active=True,
            )
            db.add_all([self.admin, self.lawyer_a, self.lawyer_b])
            db.flush()

            self.request_a = Request(
                track_number="TRK-INV-A",
                client_name="Клиент А",
                client_phone="+79991110000",
                topic_code="consulting",
                status_code="NEW",
                description="Заявка А",
                extra_fields={},
                assigned_lawyer_id=str(self.lawyer_a.id),
            )
            self.request_b = Request(
                track_number="TRK-INV-B",
                client_name="Клиент Б",
                client_phone="+79992220000",
                topic_code="consulting",
                status_code="NEW",
                description="Заявка Б",
                extra_fields={},
                assigned_lawyer_id=str(self.lawyer_b.id),
            )
            db.add_all([self.request_a, self.request_b])
            db.commit()

            self.admin_id = str(self.admin.id)
            self.lawyer_a_id = str(self.lawyer_a.id)
            self.lawyer_b_id = str(self.lawyer_b.id)
            self.request_a_id = str(self.request_a.id)
            self.request_b_id = str(self.request_b.id)

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
    def _admin_headers(sub: str, role: str, email: str) -> dict[str, str]:
        token = create_jwt(
            {"sub": str(sub), "email": email, "role": role},
            settings.ADMIN_JWT_SECRET,
            timedelta(minutes=30),
        )
        return {"Authorization": f"Bearer {token}"}

    @staticmethod
    def _public_cookie(track_number: str) -> dict[str, str]:
        token = create_jwt(
            {"sub": track_number, "purpose": "VIEW_REQUEST"},
            settings.PUBLIC_JWT_SECRET,
            timedelta(days=1),
        )
        return {settings.PUBLIC_COOKIE_NAME: token}

    def test_admin_creates_invoice_and_data_is_encrypted(self):
        headers = self._admin_headers(self.admin_id, "ADMIN", "admin@example.com")
        payload = {
            "request_id": self.request_a_id,
            "amount": 12345.67,
            "currency": "RUB",
            "payer_display_name": 'ООО "Ромашка"',
            "payer_details": {"inn": "7700000000", "kpp": "770001001"},
        }
        created = self.client.post("/api/admin/invoices", headers=headers, json=payload)
        self.assertEqual(created.status_code, 201)
        body = created.json()
        self.assertEqual(body["request_id"], self.request_a_id)
        self.assertEqual(body["request_track_number"], "TRK-INV-A")
        self.assertEqual(body["status"], "WAITING_PAYMENT")
        self.assertEqual(body["amount"], 12345.67)
        self.assertTrue(str(body["invoice_number"]).startswith("INV-"))

        invoice_id = body["id"]
        with self.SessionLocal() as db:
            row = db.get(Invoice, UUID(invoice_id))
            self.assertIsNotNone(row)
            self.assertIsNotNone(row.payer_details_encrypted)
            self.assertNotIn("7700000000", str(row.payer_details_encrypted))
            decrypted = decrypt_requisites(row.payer_details_encrypted)
            self.assertEqual(decrypted["inn"], "7700000000")
            self.assertEqual(decrypted["kpp"], "770001001")

    def test_lawyer_scope_and_paid_restriction(self):
        admin_headers = self._admin_headers(self.admin_id, "ADMIN", "admin@example.com")
        lawyer_a_headers = self._admin_headers(self.lawyer_a_id, "LAWYER", "lawyer-a@example.com")

        own_created = self.client.post(
            "/api/admin/invoices",
            headers=lawyer_a_headers,
            json={
                "request_id": self.request_a_id,
                "amount": 5000,
                "payer_display_name": "ИП Иванов",
            },
        )
        self.assertEqual(own_created.status_code, 201)
        own_invoice_id = own_created.json()["id"]

        blocked_paid_create = self.client.post(
            "/api/admin/invoices",
            headers=lawyer_a_headers,
            json={
                "request_id": self.request_a_id,
                "amount": 6000,
                "status": "PAID",
                "payer_display_name": "ИП Иванов",
            },
        )
        self.assertEqual(blocked_paid_create.status_code, 403)

        blocked_paid_update = self.client.patch(
            f"/api/admin/invoices/{own_invoice_id}",
            headers=lawyer_a_headers,
            json={"status": "PAID"},
        )
        self.assertEqual(blocked_paid_update.status_code, 403)

        foreign_created = self.client.post(
            "/api/admin/invoices",
            headers=admin_headers,
            json={"request_id": self.request_b_id, "amount": 7000, "payer_display_name": "ООО Бета"},
        )
        self.assertEqual(foreign_created.status_code, 201)
        foreign_invoice_id = foreign_created.json()["id"]

        listed = self.client.post(
            "/api/admin/invoices/query",
            headers=lawyer_a_headers,
            json={"filters": [], "sort": [{"field": "created_at", "dir": "desc"}], "page": {"limit": 50, "offset": 0}},
        )
        self.assertEqual(listed.status_code, 200)
        rows = listed.json()["rows"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["id"], own_invoice_id)

        foreign_get = self.client.get(f"/api/admin/invoices/{foreign_invoice_id}", headers=lawyer_a_headers)
        self.assertEqual(foreign_get.status_code, 403)

        foreign_pdf = self.client.get(f"/api/admin/invoices/{foreign_invoice_id}/pdf", headers=lawyer_a_headers)
        self.assertEqual(foreign_pdf.status_code, 403)

    def test_admin_marks_invoice_paid_and_request_is_updated(self):
        headers = self._admin_headers(self.admin_id, "ADMIN", "admin@example.com")
        created = self.client.post(
            "/api/admin/invoices",
            headers=headers,
            json={"request_id": self.request_a_id, "amount": 10000, "payer_display_name": "ООО Плательщик"},
        )
        self.assertEqual(created.status_code, 201)
        invoice_id = created.json()["id"]

        paid = self.client.patch(
            f"/api/admin/invoices/{invoice_id}",
            headers=headers,
            json={"status": "PAID"},
        )
        self.assertEqual(paid.status_code, 200)
        paid_body = paid.json()
        self.assertEqual(paid_body["status"], "PAID")
        self.assertIsNotNone(paid_body["paid_at"])

        with self.SessionLocal() as db:
            req = db.get(Request, UUID(self.request_a_id))
            self.assertIsNotNone(req)
            self.assertEqual(float(req.invoice_amount or 0), 10000.0)
            self.assertIsNotNone(req.paid_at)
            self.assertEqual(req.paid_by_admin_id, self.admin_id)

    def test_public_invoice_list_and_pdf_available_in_cabinet(self):
        with self.SessionLocal() as db:
            row = Invoice(
                request_id=UUID(self.request_a_id),
                invoice_number=f"INV-TEST-{uuid4().hex[:6].upper()}",
                status="WAITING_PAYMENT",
                amount=9900,
                currency="RUB",
                payer_display_name="ООО Клиент",
                payer_details_encrypted="",
                issued_by_admin_user_id=UUID(self.admin_id),
                issued_by_role="ADMIN",
                issued_at=db.get(Request, UUID(self.request_a_id)).created_at,
                responsible="admin@example.com",
            )
            db.add(row)
            db.commit()
            db.refresh(row)
            invoice_id = str(row.id)

        unauthorized = self.client.get("/api/public/requests/TRK-INV-A/invoices")
        self.assertEqual(unauthorized.status_code, 401)

        cookies = self._public_cookie("TRK-INV-A")
        listed = self.client.get("/api/public/requests/TRK-INV-A/invoices", cookies=cookies)
        self.assertEqual(listed.status_code, 200)
        rows = listed.json()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["id"], invoice_id)
        self.assertIn("/api/public/requests/TRK-INV-A/invoices/", rows[0]["download_url"])

        pdf = self.client.get(f"/api/public/requests/TRK-INV-A/invoices/{invoice_id}/pdf", cookies=cookies)
        self.assertEqual(pdf.status_code, 200)
        self.assertEqual(pdf.headers.get("content-type"), "application/pdf")
        self.assertTrue(pdf.content.startswith(b"%PDF"))

        denied = self.client.get(
            f"/api/public/requests/TRK-INV-A/invoices/{invoice_id}/pdf",
            cookies=self._public_cookie("TRK-INV-B"),
        )
        self.assertEqual(denied.status_code, 403)
