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
            "clients",
            "table_availability",
            "topics",
            "statuses",
            "status_groups",
            "form_fields",
            "topic_required_fields",
            "topic_data_templates",
            "request_data_templates",
            "request_data_template_items",
            "request_data_requirements",
            "request_service_requests",
            "requests",
            "messages",
            "attachments",
            "status_history",
            "audit_log",
            "otp_sessions",
            "quotes",
            "admin_user_topics",
            "landing_featured_staff",
            "topic_status_transitions",
            "notifications",
            "invoices",
            "security_audit_log",
            "alembic_version",
        }
        tables = set(self.inspector.get_table_names())
        self.assertTrue(expected.issubset(tables), f"Missing tables: {expected - tables}")

    def test_alembic_version_is_set(self):
        with self.engine.connect() as conn:
            version = conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
        self.assertEqual(version, "0026_srv_req_str_ids")

    def test_responsible_column_exists_in_all_domain_tables(self):
        tables = {
            "admin_users",
            "clients",
            "table_availability",
            "topics",
            "statuses",
            "status_groups",
            "form_fields",
            "topic_required_fields",
            "topic_data_templates",
            "request_data_templates",
            "request_data_template_items",
            "request_data_requirements",
            "request_service_requests",
            "requests",
            "messages",
            "attachments",
            "status_history",
            "audit_log",
            "otp_sessions",
            "quotes",
            "admin_user_topics",
            "landing_featured_staff",
            "topic_status_transitions",
            "notifications",
            "invoices",
            "security_audit_log",
        }
        for table in tables:
            columns = {column["name"] for column in self.inspector.get_columns(table)}
            self.assertIn("id", columns)
            self.assertIn("created_at", columns)
            self.assertIn("responsible", columns)

    def test_admin_users_contains_primary_topic_profile_column(self):
        columns = {column["name"] for column in self.inspector.get_columns("admin_users")}
        self.assertIn("primary_topic_code", columns)

    def test_admin_users_contains_avatar_column(self):
        columns = {column["name"] for column in self.inspector.get_columns("admin_users")}
        self.assertIn("avatar_url", columns)

    def test_requests_contains_read_marker_columns(self):
        columns = {column["name"] for column in self.inspector.get_columns("requests")}
        self.assertIn("client_has_unread_updates", columns)
        self.assertIn("client_unread_event_type", columns)
        self.assertIn("lawyer_has_unread_updates", columns)
        self.assertIn("lawyer_unread_event_type", columns)

    def test_status_transitions_contains_sla_hours_column(self):
        columns = {column["name"] for column in self.inspector.get_columns("topic_status_transitions")}
        self.assertIn("sla_hours", columns)
        self.assertIn("required_data_keys", columns)
        self.assertIn("required_mime_types", columns)

    def test_notifications_has_recipient_and_read_columns(self):
        columns = {column["name"] for column in self.inspector.get_columns("notifications")}
        self.assertIn("recipient_type", columns)
        self.assertIn("recipient_admin_user_id", columns)
        self.assertIn("recipient_track_number", columns)
        self.assertIn("event_type", columns)
        self.assertIn("is_read", columns)
        self.assertIn("read_at", columns)

    def test_admin_users_contains_rate_columns(self):
        columns = {column["name"] for column in self.inspector.get_columns("admin_users")}
        self.assertIn("default_rate", columns)
        self.assertIn("salary_percent", columns)
        self.assertIn("phone", columns)

    def test_requests_contains_financial_columns(self):
        columns = {column["name"] for column in self.inspector.get_columns("requests")}
        self.assertIn("client_id", columns)
        self.assertIn("important_date_at", columns)
        self.assertIn("effective_rate", columns)
        self.assertIn("request_cost", columns)
        self.assertIn("invoice_amount", columns)
        self.assertIn("paid_at", columns)
        self.assertIn("paid_by_admin_id", columns)

    def test_status_history_contains_important_date_column(self):
        columns = {column["name"] for column in self.inspector.get_columns("status_history")}
        self.assertIn("important_date_at", columns)

    def test_invoices_contains_core_columns(self):
        columns = {column["name"] for column in self.inspector.get_columns("invoices")}
        self.assertIn("client_id", columns)
        self.assertIn("request_id", columns)
        self.assertIn("invoice_number", columns)
        self.assertIn("status", columns)
        self.assertIn("amount", columns)
        self.assertIn("currency", columns)
        self.assertIn("payer_display_name", columns)
        self.assertIn("payer_details_encrypted", columns)
        self.assertIn("issued_by_admin_user_id", columns)
        self.assertIn("issued_by_role", columns)
        self.assertIn("issued_at", columns)
        self.assertIn("paid_at", columns)

    def test_statuses_contains_billing_columns(self):
        columns = {column["name"] for column in self.inspector.get_columns("statuses")}
        self.assertIn("kind", columns)
        self.assertIn("invoice_template", columns)
        self.assertIn("status_group_id", columns)

    def test_status_groups_contains_core_columns(self):
        columns = {column["name"] for column in self.inspector.get_columns("status_groups")}
        self.assertIn("id", columns)
        self.assertIn("name", columns)
        self.assertIn("sort_order", columns)
        self.assertIn("created_at", columns)
        self.assertIn("responsible", columns)

    def test_clients_contains_core_columns(self):
        columns = {column["name"] for column in self.inspector.get_columns("clients")}
        self.assertIn("id", columns)
        self.assertIn("full_name", columns)
        self.assertIn("phone", columns)
        self.assertIn("created_at", columns)
        self.assertIn("responsible", columns)

    def test_topic_data_templates_contains_request_data_catalog_fields(self):
        columns = {column["name"] for column in self.inspector.get_columns("topic_data_templates")}
        self.assertIn("value_type", columns)
        self.assertIn("document_name", columns)

    def test_request_data_requirements_contains_chat_request_fields(self):
        columns = {column["name"] for column in self.inspector.get_columns("request_data_requirements")}
        self.assertIn("request_message_id", columns)
        self.assertIn("field_type", columns)
        self.assertIn("document_name", columns)
        self.assertIn("value_text", columns)
        self.assertIn("sort_order", columns)

    def test_request_data_template_tables_contain_core_columns(self):
        templates = {column["name"] for column in self.inspector.get_columns("request_data_templates")}
        self.assertIn("topic_code", templates)
        self.assertIn("name", templates)
        self.assertIn("created_by_admin_id", templates)
        self.assertIn("sort_order", templates)

        items = {column["name"] for column in self.inspector.get_columns("request_data_template_items")}
        self.assertIn("request_data_template_id", items)
        self.assertIn("topic_data_template_id", items)
        self.assertIn("key", items)
        self.assertIn("label", items)
        self.assertIn("value_type", items)
        self.assertIn("sort_order", items)

    def test_request_service_requests_contains_core_columns(self):
        columns = {column["name"] for column in self.inspector.get_columns("request_service_requests")}
        self.assertIn("request_id", columns)
        self.assertIn("client_id", columns)
        self.assertIn("assigned_lawyer_id", columns)
        self.assertIn("type", columns)
        self.assertIn("status", columns)
        self.assertIn("body", columns)
        self.assertIn("admin_unread", columns)
        self.assertIn("lawyer_unread", columns)
        self.assertIn("admin_read_at", columns)
        self.assertIn("lawyer_read_at", columns)

    def test_landing_featured_staff_contains_core_columns(self):
        columns = {column["name"] for column in self.inspector.get_columns("landing_featured_staff")}
        self.assertIn("admin_user_id", columns)
        self.assertIn("caption", columns)
        self.assertIn("sort_order", columns)
        self.assertIn("pinned", columns)
        self.assertIn("enabled", columns)
