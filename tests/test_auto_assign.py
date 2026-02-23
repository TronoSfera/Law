import os
import unittest
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import create_engine, delete
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("S3_ENDPOINT", "http://localhost:9000")
os.environ.setdefault("S3_ACCESS_KEY", "test")
os.environ.setdefault("S3_SECRET_KEY", "test")
os.environ.setdefault("S3_BUCKET", "test")

from app.models.admin_user import AdminUser
from app.models.admin_user_topic import AdminUserTopic
from app.models.audit_log import AuditLog
from app.models.request import Request
from app.models.status import Status
from app.workers.tasks import assign as assign_task


class AutoAssignTaskTests(unittest.TestCase):
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
        Status.__table__.create(bind=cls.engine)
        Request.__table__.create(bind=cls.engine)
        AuditLog.__table__.create(bind=cls.engine)

        cls._old_session_local = assign_task.SessionLocal
        assign_task.SessionLocal = cls.SessionLocal

    @classmethod
    def tearDownClass(cls):
        assign_task.SessionLocal = cls._old_session_local
        AuditLog.__table__.drop(bind=cls.engine)
        Request.__table__.drop(bind=cls.engine)
        Status.__table__.drop(bind=cls.engine)
        AdminUserTopic.__table__.drop(bind=cls.engine)
        AdminUser.__table__.drop(bind=cls.engine)
        cls.engine.dispose()

    def setUp(self):
        with self.SessionLocal() as db:
            db.execute(delete(AuditLog))
            db.execute(delete(Request))
            db.execute(delete(Status))
            db.execute(delete(AdminUserTopic))
            db.execute(delete(AdminUser))
            db.commit()

    def _create_lawyer(self, db, *, name, email, topic_code=None, is_active=True):
        lawyer = AdminUser(
            role="LAWYER",
            name=name,
            email=email,
            password_hash="hash",
            is_active=is_active,
            primary_topic_code=topic_code,
        )
        db.add(lawyer)
        db.flush()
        return lawyer

    def _link_additional_topic(self, db, *, lawyer_id, topic_code):
        row = AdminUserTopic(admin_user_id=lawyer_id, topic_code=topic_code)
        db.add(row)
        db.flush()
        return row

    def _create_request(
        self,
        db,
        *,
        track_number,
        topic_code,
        created_at,
        status_code="NEW",
        assigned_lawyer_id=None,
    ):
        req = Request(
            track_number=track_number,
            client_name="Тестовый клиент",
            client_phone="+79990000000",
            topic_code=topic_code,
            status_code=status_code,
            description="Описание",
            extra_fields={},
            assigned_lawyer_id=assigned_lawyer_id,
            total_attachments_bytes=0,
            created_at=created_at,
            updated_at=created_at,
        )
        db.add(req)
        db.flush()
        return req

    def test_auto_assign_matches_topic_and_uses_lowest_active_load(self):
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as db:
            db.add_all(
                [
                    Status(code="NEW", name="Новая", enabled=True, sort_order=0, is_terminal=False),
                    Status(code="IN_PROGRESS", name="В работе", enabled=True, sort_order=1, is_terminal=False),
                    Status(code="CLOSED", name="Закрыта", enabled=True, sort_order=99, is_terminal=True),
                ]
            )

            lawyer_low = self._create_lawyer(db, name="Юрист 1", email="law1@example.com", topic_code="family")
            lawyer_high = self._create_lawyer(db, name="Юрист 2", email="law2@example.com", topic_code="family")
            self._create_lawyer(db, name="Юрист 3", email="law3@example.com", topic_code="tax")

            self._create_request(
                db,
                track_number="TRK-HIGH-1",
                topic_code="family",
                created_at=now - timedelta(hours=30),
                status_code="NEW",
                assigned_lawyer_id=str(lawyer_high.id),
            )
            self._create_request(
                db,
                track_number="TRK-HIGH-2",
                topic_code="family",
                created_at=now - timedelta(hours=29),
                status_code="IN_PROGRESS",
                assigned_lawyer_id=str(lawyer_high.id),
            )
            self._create_request(
                db,
                track_number="TRK-LOW-CLOSED",
                topic_code="family",
                created_at=now - timedelta(hours=28),
                status_code="CLOSED",
                assigned_lawyer_id=str(lawyer_low.id),
            )

            target = self._create_request(
                db,
                track_number="TRK-TARGET",
                topic_code="family",
                created_at=now - timedelta(hours=25),
                status_code="NEW",
                assigned_lawyer_id=None,
            )
            fresh = self._create_request(
                db,
                track_number="TRK-FRESH",
                topic_code="family",
                created_at=now - timedelta(hours=3),
                status_code="NEW",
                assigned_lawyer_id=None,
            )
            unknown_topic = self._create_request(
                db,
                track_number="TRK-UNKNOWN",
                topic_code="banking",
                created_at=now - timedelta(hours=25),
                status_code="NEW",
                assigned_lawyer_id=None,
            )
            db.commit()
            target_id = str(target.id)
            target_expected_lawyer_id = str(lawyer_low.id)
            fresh_id = str(fresh.id)
            unknown_topic_id = str(unknown_topic.id)

        result = assign_task.auto_assign_unclaimed()
        self.assertEqual(result["checked"], 2)
        self.assertEqual(result["assigned"], 1)

        with self.SessionLocal() as db:
            assigned_target = db.get(Request, UUID(target_id))
            self.assertIsNotNone(assigned_target)
            self.assertEqual(assigned_target.assigned_lawyer_id, target_expected_lawyer_id)

            still_fresh = db.get(Request, UUID(fresh_id))
            self.assertIsNotNone(still_fresh)
            self.assertIsNone(still_fresh.assigned_lawyer_id)

            still_unknown = db.get(Request, UUID(unknown_topic_id))
            self.assertIsNotNone(still_unknown)
            self.assertIsNone(still_unknown.assigned_lawyer_id)

            audit_rows = (
                db.query(AuditLog)
                .filter(AuditLog.entity == "requests", AuditLog.entity_id == target_id, AuditLog.action == "AUTO_ASSIGN")
                .all()
            )
            self.assertEqual(len(audit_rows), 1)

    def test_auto_assign_uses_default_terminal_statuses_when_dictionary_is_empty(self):
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as db:
            lawyer_low = self._create_lawyer(db, name="Юрист A", email="la@example.com", topic_code="civil")
            lawyer_high = self._create_lawyer(db, name="Юрист B", email="lb@example.com", topic_code="civil")

            self._create_request(
                db,
                track_number="TRK-CLOSED",
                topic_code="civil",
                created_at=now - timedelta(hours=40),
                status_code="CLOSED",
                assigned_lawyer_id=str(lawyer_low.id),
            )
            self._create_request(
                db,
                track_number="TRK-ACTIVE",
                topic_code="civil",
                created_at=now - timedelta(hours=40),
                status_code="NEW",
                assigned_lawyer_id=str(lawyer_high.id),
            )

            target = self._create_request(
                db,
                track_number="TRK-TARGET2",
                topic_code="civil",
                created_at=now - timedelta(hours=26),
                status_code="NEW",
                assigned_lawyer_id=None,
            )
            db.commit()
            target_id = str(target.id)
            expected_lawyer_id = str(lawyer_low.id)

        result = assign_task.auto_assign_unclaimed()
        self.assertEqual(result["assigned"], 1)

        with self.SessionLocal() as db:
            assigned_target = db.get(Request, UUID(target_id))
            self.assertIsNotNone(assigned_target)
            self.assertEqual(assigned_target.assigned_lawyer_id, expected_lawyer_id)

    def test_auto_assign_prefers_primary_topic_over_additional_topic(self):
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as db:
            db.add_all(
                [
                    Status(code="NEW", name="Новая", enabled=True, sort_order=0, is_terminal=False),
                    Status(code="CLOSED", name="Закрыта", enabled=True, sort_order=99, is_terminal=True),
                ]
            )
            lawyer_primary = self._create_lawyer(db, name="Primary", email="primary@example.com", topic_code="family")
            lawyer_additional = self._create_lawyer(db, name="Additional", email="additional@example.com", topic_code="tax")
            self._link_additional_topic(db, lawyer_id=lawyer_additional.id, topic_code="family")

            self._create_request(
                db,
                track_number="TRK-PRI-LOAD-1",
                topic_code="family",
                created_at=now - timedelta(hours=40),
                status_code="NEW",
                assigned_lawyer_id=str(lawyer_primary.id),
            )
            self._create_request(
                db,
                track_number="TRK-PRI-LOAD-2",
                topic_code="family",
                created_at=now - timedelta(hours=39),
                status_code="NEW",
                assigned_lawyer_id=str(lawyer_primary.id),
            )

            target = self._create_request(
                db,
                track_number="TRK-PRI-TARGET",
                topic_code="family",
                created_at=now - timedelta(hours=30),
                status_code="NEW",
                assigned_lawyer_id=None,
            )
            db.commit()
            target_id = str(target.id)
            expected_lawyer_id = str(lawyer_primary.id)

        result = assign_task.auto_assign_unclaimed()
        self.assertEqual(result["checked"], 1)
        self.assertEqual(result["assigned"], 1)

        with self.SessionLocal() as db:
            assigned_target = db.get(Request, UUID(target_id))
            self.assertIsNotNone(assigned_target)
            self.assertEqual(assigned_target.assigned_lawyer_id, expected_lawyer_id)
            audit = (
                db.query(AuditLog)
                .filter(AuditLog.entity == "requests", AuditLog.entity_id == target_id, AuditLog.action == "AUTO_ASSIGN")
                .first()
            )
            self.assertIsNotNone(audit)
            self.assertEqual((audit.diff or {}).get("basis"), "primary_topic")

    def test_auto_assign_falls_back_to_additional_topics_and_uses_lowest_load(self):
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as db:
            db.add_all(
                [
                    Status(code="NEW", name="Новая", enabled=True, sort_order=0, is_terminal=False),
                    Status(code="CLOSED", name="Закрыта", enabled=True, sort_order=99, is_terminal=True),
                ]
            )

            lawyer_busy = self._create_lawyer(db, name="Busy", email="busy@example.com", topic_code="tax")
            lawyer_free = self._create_lawyer(db, name="Free", email="free@example.com", topic_code="corporate")
            lawyer_inactive = self._create_lawyer(db, name="Inactive", email="inactive@example.com", topic_code=None, is_active=False)

            self._link_additional_topic(db, lawyer_id=lawyer_busy.id, topic_code="family")
            self._link_additional_topic(db, lawyer_id=lawyer_free.id, topic_code="family")
            self._link_additional_topic(db, lawyer_id=lawyer_inactive.id, topic_code="family")

            self._create_request(
                db,
                track_number="TRK-BUSY-1",
                topic_code="tax",
                created_at=now - timedelta(hours=40),
                status_code="NEW",
                assigned_lawyer_id=str(lawyer_busy.id),
            )

            target = self._create_request(
                db,
                track_number="TRK-ADD-TARGET",
                topic_code="family",
                created_at=now - timedelta(hours=30),
                status_code="NEW",
                assigned_lawyer_id=None,
            )
            db.commit()
            target_id = str(target.id)
            expected_lawyer_id = str(lawyer_free.id)

        result = assign_task.auto_assign_unclaimed()
        self.assertEqual(result["checked"], 1)
        self.assertEqual(result["assigned"], 1)

        with self.SessionLocal() as db:
            assigned_target = db.get(Request, UUID(target_id))
            self.assertIsNotNone(assigned_target)
            self.assertEqual(assigned_target.assigned_lawyer_id, expected_lawyer_id)
            audit = (
                db.query(AuditLog)
                .filter(AuditLog.entity == "requests", AuditLog.entity_id == target_id, AuditLog.action == "AUTO_ASSIGN")
                .first()
            )
            self.assertIsNotNone(audit)
            self.assertEqual((audit.diff or {}).get("basis"), "additional_topic")
