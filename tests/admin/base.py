import os
import json
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
from app.models.status_group import StatusGroup
from app.models.status_history import StatusHistory
from app.models.topic_data_template import TopicDataTemplate
from app.models.topic import Topic
from app.models.topic_required_field import TopicRequiredField
from app.models.request_data_requirement import RequestDataRequirement
from app.models.request_service_request import RequestServiceRequest
from app.models.topic_status_transition import TopicStatusTransition


class AdminUniversalCrudBase(unittest.TestCase):
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
        StatusGroup.__table__.create(bind=cls.engine)
        Status.__table__.create(bind=cls.engine)
        Message.__table__.create(bind=cls.engine)
        Attachment.__table__.create(bind=cls.engine)
        StatusHistory.__table__.create(bind=cls.engine)
        Topic.__table__.create(bind=cls.engine)
        TopicRequiredField.__table__.create(bind=cls.engine)
        TopicDataTemplate.__table__.create(bind=cls.engine)
        RequestDataRequirement.__table__.create(bind=cls.engine)
        RequestServiceRequest.__table__.create(bind=cls.engine)
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
        RequestServiceRequest.__table__.drop(bind=cls.engine)
        TopicDataTemplate.__table__.drop(bind=cls.engine)
        TopicRequiredField.__table__.drop(bind=cls.engine)
        TopicStatusTransition.__table__.drop(bind=cls.engine)
        Topic.__table__.drop(bind=cls.engine)
        StatusHistory.__table__.drop(bind=cls.engine)
        Attachment.__table__.drop(bind=cls.engine)
        Message.__table__.drop(bind=cls.engine)
        Status.__table__.drop(bind=cls.engine)
        StatusGroup.__table__.drop(bind=cls.engine)
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
            db.execute(delete(StatusGroup))
            db.execute(delete(Client))
            db.execute(delete(Status))
            db.execute(delete(FormField))
            db.execute(delete(Topic))
            db.execute(delete(TopicRequiredField))
            db.execute(delete(TopicDataTemplate))
            db.execute(delete(RequestDataRequirement))
            db.execute(delete(RequestServiceRequest))
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
