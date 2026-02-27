from tests.admin.base import *  # noqa: F401,F403


class AdminCrudMetaTests(AdminUniversalCrudBase):
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

    def test_status_can_be_bound_to_status_group_via_crud(self):
        headers = self._auth_headers("ADMIN")

        created_group = self.client.post(
            "/api/admin/crud/status_groups",
            headers=headers,
            json={"name": "Этапы рассмотрения", "sort_order": 15},
        )
        self.assertEqual(created_group.status_code, 201)
        group_id = created_group.json()["id"]
        UUID(group_id)

        created_status = self.client.post(
            "/api/admin/crud/statuses",
            headers=headers,
            json={
                "code": "GROUPED_STATUS",
                "name": "Статус с группой",
                "status_group_id": group_id,
                "kind": "DEFAULT",
                "enabled": True,
                "sort_order": 11,
                "is_terminal": False,
            },
        )
        self.assertEqual(created_status.status_code, 201)
        status_id = created_status.json()["id"]
        self.assertEqual(created_status.json()["status_group_id"], group_id)

        got_status = self.client.get(f"/api/admin/crud/statuses/{status_id}", headers=headers)
        self.assertEqual(got_status.status_code, 200)
        self.assertEqual(got_status.json()["status_group_id"], group_id)

        bad_status = self.client.post(
            "/api/admin/crud/statuses",
            headers=headers,
            json={
                "code": "GROUPED_STATUS_BAD",
                "name": "Статус с невалидной группой",
                "status_group_id": str(uuid4()),
                "kind": "DEFAULT",
                "enabled": True,
                "sort_order": 12,
                "is_terminal": False,
            },
        )
        self.assertEqual(bad_status.status_code, 400)

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
        self.assertIn("status_groups", by_table)

        self.assertEqual(by_table["requests"]["section"], "main")
        self.assertEqual(by_table["invoices"]["section"], "main")
        self.assertEqual(by_table["quotes"]["section"], "dictionary")
        self.assertTrue(by_table["quotes"]["default_sort"])
        self.assertEqual(by_table["quotes"]["label"], "Цитаты")
        self.assertEqual(by_table["status_groups"]["label"], "Группы статусов")
        self.assertEqual(by_table["request_data_requirements"]["label"], "Требования данных заявки")
        quotes_columns = {col["name"]: col for col in (by_table["quotes"].get("columns") or [])}
        self.assertEqual(quotes_columns["author"]["label"], "Автор")
        self.assertEqual(quotes_columns["sort_order"]["label"], "Порядок")
        self.assertTrue(all(str(col.get("label") or "").strip() for col in (by_table["quotes"].get("columns") or [])))
        statuses_columns = {col["name"]: col for col in (by_table["statuses"].get("columns") or [])}
        self.assertEqual(statuses_columns["status_group_id"]["reference"]["table"], "status_groups")
        self.assertEqual(statuses_columns["status_group_id"]["reference"]["label_field"], "name")
        requests_columns = {col["name"]: col for col in (by_table["requests"].get("columns") or [])}
        self.assertEqual(requests_columns["assigned_lawyer_id"]["reference"]["table"], "admin_users")
        self.assertEqual(requests_columns["assigned_lawyer_id"]["reference"]["label_field"], "name")
        invoices_columns = {col["name"]: col for col in (by_table["invoices"].get("columns") or [])}
        self.assertEqual(invoices_columns["request_id"]["reference"]["table"], "requests")
        self.assertEqual(invoices_columns["request_id"]["reference"]["label_field"], "track_number")
        self.assertEqual(invoices_columns["client_id"]["reference"]["table"], "clients")
        self.assertEqual(invoices_columns["client_id"]["reference"]["label_field"], "full_name")
        for table_name, table_meta in by_table.items():
            if table_name in {"requests", "invoices", "request_service_requests"}:
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
