import os
import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Ensure settings can be initialized in test environments
os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("S3_ENDPOINT", "http://localhost:9000")
os.environ.setdefault("S3_ACCESS_KEY", "test")
os.environ.setdefault("S3_SECRET_KEY", "test")
os.environ.setdefault("S3_BUCKET", "test")

from app.data.quotes_justice_seed import JUSTICE_QUOTES
from app.models.quote import Quote
from app.scripts.upsert_quotes import upsert_quotes


class QuotesSeedTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite+pysqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.SessionLocal = sessionmaker(bind=cls.engine, autocommit=False, autoflush=False)
        Quote.__table__.create(bind=cls.engine)

    @classmethod
    def tearDownClass(cls):
        Quote.__table__.drop(bind=cls.engine)
        cls.engine.dispose()

    def setUp(self):
        self.db = self.SessionLocal()
        self.db.query(Quote).delete()
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_upsert_creates_all_50_quotes_and_is_idempotent(self):
        created, updated = upsert_quotes(self.db, JUSTICE_QUOTES)
        self.assertEqual(created, 50)
        self.assertEqual(updated, 0)
        self.assertEqual(self.db.query(Quote).count(), 50)

        created2, updated2 = upsert_quotes(self.db, JUSTICE_QUOTES)
        self.assertEqual(created2, 0)
        self.assertEqual(updated2, 0)
        self.assertEqual(self.db.query(Quote).count(), 50)

    def test_upsert_updates_existing_quote(self):
        base = JUSTICE_QUOTES[0]
        self.db.add(
            Quote(
                author=base["author"],
                text=base["text"],
                source="wrong",
                is_active=False,
                sort_order=999,
            )
        )
        self.db.commit()

        created, updated = upsert_quotes(self.db, [base])
        self.assertEqual(created, 0)
        self.assertEqual(updated, 1)

        row = self.db.query(Quote).filter(Quote.author == base["author"], Quote.text == base["text"]).first()
        self.assertIsNotNone(row)
        self.assertEqual(row.source, base.get("source"))
        self.assertTrue(row.is_active)
        self.assertEqual(row.sort_order, 1)
