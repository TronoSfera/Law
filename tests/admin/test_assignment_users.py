from tests.admin.base import *  # noqa: F401,F403


class AdminAssignmentAndUsersTests(AdminUniversalCrudBase):
    def test_lawyer_can_claim_unassigned_request_and_takeover_is_forbidden(self):
        with self.SessionLocal() as db:
            lawyer1 = AdminUser(
                role="LAWYER",
                name="Юрист 1",
                email="lawyer1@example.com",
                password_hash="hash",
                is_active=True,
            )
            lawyer2 = AdminUser(
                role="LAWYER",
                name="Юрист 2",
                email="lawyer2@example.com",
                password_hash="hash",
                is_active=True,
            )
            request_row = Request(
                track_number="TRK-CLAIM-1",
                client_name="Клиент",
                client_phone="+79991112233",
                status_code="NEW",
                description="claim test",
                extra_fields={},
                assigned_lawyer_id=None,
            )
            db.add_all([lawyer1, lawyer2, request_row])
            db.commit()
            lawyer1_id = str(lawyer1.id)
            lawyer2_id = str(lawyer2.id)
            request_id = str(request_row.id)

        headers1 = self._auth_headers("LAWYER", email="lawyer1@example.com", sub=lawyer1_id)
        headers2 = self._auth_headers("LAWYER", email="lawyer2@example.com", sub=lawyer2_id)
        admin_headers = self._auth_headers("ADMIN", email="root@example.com")

        first = self.client.post(f"/api/admin/requests/{request_id}/claim", headers=headers1)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.json()["assigned_lawyer_id"], lawyer1_id)

        second = self.client.post(f"/api/admin/requests/{request_id}/claim", headers=headers2)
        self.assertEqual(second.status_code, 409)

        admin_forbidden = self.client.post(f"/api/admin/requests/{request_id}/claim", headers=admin_headers)
        self.assertEqual(admin_forbidden.status_code, 403)

        with self.SessionLocal() as db:
            row = db.get(Request, UUID(request_id))
            self.assertIsNotNone(row)
            self.assertEqual(row.assigned_lawyer_id, lawyer1_id)
            claim_audits = db.query(AuditLog).filter(AuditLog.entity == "requests", AuditLog.entity_id == request_id, AuditLog.action == "MANUAL_CLAIM").all()
            self.assertEqual(len(claim_audits), 1)

    def test_lawyer_cannot_assign_request_via_universal_crud(self):
        with self.SessionLocal() as db:
            lawyer = AdminUser(
                role="LAWYER",
                name="Юрист",
                email="lawyer-assign@example.com",
                password_hash="hash",
                is_active=True,
            )
            request_row = Request(
                track_number="TRK-CLAIM-2",
                client_name="Клиент",
                client_phone="+79994445566",
                status_code="NEW",
                description="crud assign block",
                extra_fields={},
                assigned_lawyer_id=None,
            )
            db.add_all([lawyer, request_row])
            db.commit()
            lawyer_id = str(lawyer.id)
            request_id = str(request_row.id)

        headers = self._auth_headers("LAWYER", email="lawyer-assign@example.com", sub=lawyer_id)
        blocked_update = self.client.patch(
            f"/api/admin/crud/requests/{request_id}",
            headers=headers,
            json={"assigned_lawyer_id": lawyer_id},
        )
        self.assertEqual(blocked_update.status_code, 403)

        blocked_create = self.client.post(
            "/api/admin/crud/requests",
            headers=headers,
            json={
                "client_name": "Новый клиент",
                "client_phone": "+79990001122",
                "status_code": "NEW",
                "description": "blocked create assign",
                "assigned_lawyer_id": lawyer_id,
            },
        )
        self.assertEqual(blocked_create.status_code, 403)

        blocked_update_legacy = self.client.patch(
            f"/api/admin/requests/{request_id}",
            headers=headers,
            json={"assigned_lawyer_id": lawyer_id},
        )
        self.assertEqual(blocked_update_legacy.status_code, 403)

        blocked_create_legacy = self.client.post(
            "/api/admin/requests",
            headers=headers,
            json={
                "client_name": "Legacy клиент",
                "client_phone": "+79990001123",
                "status_code": "NEW",
                "description": "legacy assign block",
                "assigned_lawyer_id": lawyer_id,
            },
        )
        self.assertEqual(blocked_create_legacy.status_code, 403)

    def test_admin_can_reassign_assigned_request(self):
        with self.SessionLocal() as db:
            lawyer_from = AdminUser(
                role="LAWYER",
                name="Юрист Исходный",
                email="lawyer-from@example.com",
                password_hash="hash",
                is_active=True,
            )
            lawyer_to = AdminUser(
                role="LAWYER",
                name="Юрист Целевой",
                email="lawyer-to@example.com",
                password_hash="hash",
                is_active=True,
            )
            request_row = Request(
                track_number="TRK-REASSIGN-1",
                client_name="Клиент",
                client_phone="+79993334455",
                status_code="NEW",
                description="reassign test",
                extra_fields={},
                assigned_lawyer_id=None,
            )
            db.add_all([lawyer_from, lawyer_to, request_row])
            db.commit()
            lawyer_from_id = str(lawyer_from.id)
            lawyer_to_id = str(lawyer_to.id)
            request_id = str(request_row.id)

        claim_headers = self._auth_headers("LAWYER", email="lawyer-from@example.com", sub=lawyer_from_id)
        claimed = self.client.post(f"/api/admin/requests/{request_id}/claim", headers=claim_headers)
        self.assertEqual(claimed.status_code, 200)

        admin_headers = self._auth_headers("ADMIN", email="root@example.com")
        reassigned = self.client.post(
            f"/api/admin/requests/{request_id}/reassign",
            headers=admin_headers,
            json={"lawyer_id": lawyer_to_id},
        )
        self.assertEqual(reassigned.status_code, 200)
        body = reassigned.json()
        self.assertEqual(body["from_lawyer_id"], lawyer_from_id)
        self.assertEqual(body["assigned_lawyer_id"], lawyer_to_id)

        with self.SessionLocal() as db:
            row = db.get(Request, UUID(request_id))
            self.assertIsNotNone(row)
            self.assertEqual(row.assigned_lawyer_id, lawyer_to_id)
            events = db.query(AuditLog).filter(AuditLog.entity == "requests", AuditLog.entity_id == request_id).all()
            actions = [event.action for event in events]
            self.assertIn("MANUAL_REASSIGN", actions)

    def test_reassign_is_admin_only_and_validates_request_state(self):
        with self.SessionLocal() as db:
            lawyer1 = AdminUser(
                role="LAWYER",
                name="Юрист Один",
                email="lawyer-one@example.com",
                password_hash="hash",
                is_active=True,
            )
            lawyer2 = AdminUser(
                role="LAWYER",
                name="Юрист Два",
                email="lawyer-two@example.com",
                password_hash="hash",
                is_active=True,
            )
            db.add_all([lawyer1, lawyer2])
            db.flush()
            lawyer1_id = str(lawyer1.id)
            lawyer2_id = str(lawyer2.id)

            request_unassigned = Request(
                track_number="TRK-REASSIGN-2",
                client_name="Клиент",
                client_phone="+79995556677",
                status_code="NEW",
                description="reassign invalid",
                extra_fields={},
                assigned_lawyer_id=None,
            )
            request_assigned = Request(
                track_number="TRK-REASSIGN-3",
                client_name="Клиент",
                client_phone="+79995556678",
                status_code="NEW",
                description="reassign invalid same",
                extra_fields={},
                assigned_lawyer_id=lawyer1_id,
            )
            db.add_all([request_unassigned, request_assigned])
            db.commit()
            unassigned_id = str(request_unassigned.id)
            assigned_id = str(request_assigned.id)

        admin_headers = self._auth_headers("ADMIN", email="root@example.com")
        lawyer_headers = self._auth_headers("LAWYER", email="lawyer-one@example.com", sub=lawyer1_id)

        lawyer_forbidden = self.client.post(
            f"/api/admin/requests/{assigned_id}/reassign",
            headers=lawyer_headers,
            json={"lawyer_id": lawyer2_id},
        )
        self.assertEqual(lawyer_forbidden.status_code, 403)

        unassigned_blocked = self.client.post(
            f"/api/admin/requests/{unassigned_id}/reassign",
            headers=admin_headers,
            json={"lawyer_id": lawyer2_id},
        )
        self.assertEqual(unassigned_blocked.status_code, 400)

        same_lawyer_blocked = self.client.post(
            f"/api/admin/requests/{assigned_id}/reassign",
            headers=admin_headers,
            json={"lawyer_id": lawyer1_id},
        )
        self.assertEqual(same_lawyer_blocked.status_code, 400)

    def test_responsible_is_protected_from_manual_input(self):
        headers = self._auth_headers("ADMIN")
        response = self.client.post(
            "/api/admin/crud/quotes",
            headers=headers,
            json={"author": "A", "text": "B", "responsible": "hacker@example.com"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("Неизвестные поля", response.json().get("detail", ""))

    def test_calculated_fields_are_read_only_for_universal_crud(self):
        headers = self._auth_headers("ADMIN", email="root@example.com")

        blocked_create = self.client.post(
            "/api/admin/crud/requests",
            headers=headers,
            json={
                "client_name": "Клиент readonly",
                "client_phone": "+79995550011",
                "status_code": "NEW",
                "description": "calc readonly",
                "invoice_amount": 12500,
            },
        )
        self.assertEqual(blocked_create.status_code, 400)
        self.assertIn("Неизвестные поля", blocked_create.json().get("detail", ""))

        created = self.client.post(
            "/api/admin/crud/requests",
            headers=headers,
            json={
                "client_name": "Клиент readonly",
                "client_phone": "+79995550012",
                "status_code": "NEW",
                "description": "valid create",
            },
        )
        self.assertEqual(created.status_code, 201)
        request_id = created.json()["id"]

        blocked_patch = self.client.patch(
            f"/api/admin/crud/requests/{request_id}",
            headers=headers,
            json={"paid_at": "2026-02-24T12:00:00+03:00"},
        )
        self.assertEqual(blocked_patch.status_code, 400)
        self.assertIn("Неизвестные поля", blocked_patch.json().get("detail", ""))

        meta_response = self.client.get("/api/admin/crud/meta/tables", headers=headers)
        self.assertEqual(meta_response.status_code, 200)
        by_table = {row["table"]: row for row in (meta_response.json().get("tables") or [])}

        request_columns = {col["name"]: col for col in (by_table.get("requests", {}).get("columns") or [])}
        self.assertIn("invoice_amount", request_columns)
        self.assertIn("paid_at", request_columns)
        self.assertIn("paid_by_admin_id", request_columns)
        self.assertIn("total_attachments_bytes", request_columns)
        self.assertFalse(request_columns["invoice_amount"]["editable"])
        self.assertFalse(request_columns["paid_at"]["editable"])
        self.assertFalse(request_columns["paid_by_admin_id"]["editable"])
        self.assertFalse(request_columns["total_attachments_bytes"]["editable"])

        invoice_columns = {col["name"]: col for col in (by_table.get("invoices", {}).get("columns") or [])}
        self.assertIn("issued_at", invoice_columns)
        self.assertIn("paid_at", invoice_columns)
        self.assertFalse(invoice_columns["issued_at"]["editable"])
        self.assertFalse(invoice_columns["paid_at"]["editable"])

    def test_topic_code_is_autogenerated_when_missing(self):
        headers = self._auth_headers("ADMIN")
        first = self.client.post(
            "/api/admin/crud/topics",
            headers=headers,
            json={"name": "Семейное право"},
        )
        self.assertEqual(first.status_code, 201)
        body1 = first.json()
        self.assertTrue(body1.get("code"))
        self.assertRegex(body1["code"], r"^[a-z0-9-]+$")

        second = self.client.post(
            "/api/admin/crud/topics",
            headers=headers,
            json={"name": "Семейное право"},
        )
        self.assertEqual(second.status_code, 201)
        body2 = second.json()
        self.assertTrue(body2.get("code"))
        self.assertRegex(body2["code"], r"^[a-z0-9-]+$")
        self.assertNotEqual(body1["code"], body2["code"])

    def test_admin_can_manage_users_with_password_hashing(self):
        headers = self._auth_headers("ADMIN", email="root@example.com")
        topic_create = self.client.post(
            "/api/admin/crud/topics",
            headers=headers,
            json={"code": "civil-law", "name": "Гражданское право"},
        )
        self.assertEqual(topic_create.status_code, 201)

        created = self.client.post(
            "/api/admin/crud/admin_users",
            headers=headers,
            json={
                "name": "Юрист Тестовый",
                "email": "Lawyer.TEST@Example.com",
                "role": "LAWYER",
                "primary_topic_code": "civil-law",
                "avatar_url": "https://cdn.example.com/avatars/lawyer-test.png",
                "password": "StartPass-123",
                "is_active": True,
            },
        )
        self.assertEqual(created.status_code, 201)
        body = created.json()
        self.assertEqual(body["email"], "lawyer.test@example.com")
        self.assertEqual(body["role"], "LAWYER")
        self.assertEqual(body["avatar_url"], "https://cdn.example.com/avatars/lawyer-test.png")
        self.assertEqual(body["primary_topic_code"], "civil-law")
        self.assertNotIn("password_hash", body)
        user_id = body["id"]
        UUID(user_id)

        with self.SessionLocal() as db:
            user = db.get(AdminUser, UUID(user_id))
            self.assertIsNotNone(user)
            self.assertTrue(verify_password("StartPass-123", user.password_hash))

        updated = self.client.patch(
            f"/api/admin/crud/admin_users/{user_id}",
            headers=headers,
            json={"role": "ADMIN", "password": "UpdatedPass-999", "is_active": False, "primary_topic_code": "", "avatar_url": ""},
        )
        self.assertEqual(updated.status_code, 200)
        upd_body = updated.json()
        self.assertEqual(upd_body["role"], "ADMIN")
        self.assertIsNone(upd_body["avatar_url"])
        self.assertIsNone(upd_body["primary_topic_code"])
        self.assertFalse(upd_body["is_active"])
        self.assertNotIn("password_hash", upd_body)

        with self.SessionLocal() as db:
            user = db.get(AdminUser, UUID(user_id))
            self.assertIsNotNone(user)
            self.assertTrue(verify_password("UpdatedPass-999", user.password_hash))
            self.assertFalse(verify_password("StartPass-123", user.password_hash))

        q = self.client.post(
            "/api/admin/crud/admin_users/query",
            headers=headers,
            json={"filters": [], "sort": [{"field": "created_at", "dir": "desc"}], "page": {"limit": 50, "offset": 0}},
        )
        self.assertEqual(q.status_code, 200)
        self.assertGreaterEqual(q.json()["total"], 1)
        self.assertNotIn("password_hash", q.json()["rows"][0])

        blocked_hash_write = self.client.patch(
            f"/api/admin/crud/admin_users/{user_id}",
            headers=headers,
            json={"password_hash": "forged"},
        )
        self.assertEqual(blocked_hash_write.status_code, 400)

        self_headers = self._auth_headers("ADMIN", email="self@example.com", sub=user_id)
        self_delete = self.client.delete(f"/api/admin/crud/admin_users/{user_id}", headers=self_headers)
        self.assertEqual(self_delete.status_code, 400)

        deleted = self.client.delete(f"/api/admin/crud/admin_users/{user_id}", headers=headers)
        self.assertEqual(deleted.status_code, 200)

