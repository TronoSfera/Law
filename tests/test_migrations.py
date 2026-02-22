import os
import subprocess
import unittest
from pathlib import Path

import psycopg
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url


class MigrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        db_url_raw = os.getenv("DATABASE_URL", "")
        if not db_url_raw.startswith("postgresql"):
            raise unittest.SkipTest("Migration test requires PostgreSQL DATABASE_URL")

        cls.project_root = Path(__file__).resolve().parents[1]
        cls.base_url = make_url(db_url_raw)
        cls.test_db_name = f"{cls.base_url.database}_migration_test"
        cls.test_url = cls.base_url.set(database=cls.test_db_name)
        cls.admin_url = cls.base_url.set(database="postgres")

        cls._drop_create_database()
        cls._run_alembic_upgrade()

        cls.engine = create_engine(cls.test_url)
        cls.inspector = inspect(cls.engine)

    @classmethod
    def tearDownClass(cls):
        if hasattr(cls, "engine"):
            cls.engine.dispose()
        if hasattr(cls, "admin_url") and hasattr(cls, "test_db_name"):
            cls._drop_database()

    @classmethod
    def _to_psycopg_dsn(cls, url):
        return url.render_as_string(hide_password=False).replace("+psycopg", "")

    @classmethod
    def _drop_create_database(cls):
        dsn = cls._to_psycopg_dsn(cls.admin_url)
        with psycopg.connect(dsn, autocommit=True) as conn:
            conn.execute(
                "SELECT pg_terminate_backend(pid) "
                "FROM pg_stat_activity "
                "WHERE datname = %s AND pid <> pg_backend_pid()",
                (cls.test_db_name,),
            )
            conn.execute(f'DROP DATABASE IF EXISTS "{cls.test_db_name}"')
            conn.execute(f'CREATE DATABASE "{cls.test_db_name}"')

    @classmethod
    def _drop_database(cls):
        dsn = cls._to_psycopg_dsn(cls.admin_url)
        with psycopg.connect(dsn, autocommit=True) as conn:
            conn.execute(
                "SELECT pg_terminate_backend(pid) "
                "FROM pg_stat_activity "
                "WHERE datname = %s AND pid <> pg_backend_pid()",
                (cls.test_db_name,),
            )
            conn.execute(f'DROP DATABASE IF EXISTS "{cls.test_db_name}"')

    @classmethod
    def _run_alembic_upgrade(cls):
        env = os.environ.copy()
        env["DATABASE_URL"] = cls.test_url.render_as_string(hide_password=False)
        env["PYTHONPATH"] = str(cls.project_root)
        subprocess.run(
            ["alembic", "upgrade", "head"],
            cwd=cls.project_root,
            env=env,
            check=True,
            capture_output=True,
            text=True,
        )

    def test_upgrade_head_creates_expected_tables(self):
        expected = {
            "admin_users",
            "topics",
            "statuses",
            "form_fields",
            "requests",
            "messages",
            "attachments",
            "status_history",
            "audit_log",
            "otp_sessions",
            "quotes",
            "alembic_version",
        }
        tables = set(self.inspector.get_table_names())
        self.assertTrue(expected.issubset(tables), f"Missing tables: {expected - tables}")

    def test_alembic_version_is_set(self):
        with self.engine.connect() as conn:
            version = conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
        self.assertEqual(version, "0001_init")
