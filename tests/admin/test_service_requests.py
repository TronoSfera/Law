from uuid import uuid4

from tests.admin.base import *  # noqa: F401,F403


class AdminServiceRequestsTests(AdminUniversalCrudBase):
    def test_list_service_requests_respects_role_scope(self):
        admin_headers = self._auth_headers("ADMIN")
        lawyer_id = str(uuid4())
        lawyer_headers = self._auth_headers("LAWYER", sub=lawyer_id, email="lawyer@example.com")

        with self.SessionLocal() as db:
            client = Client(full_name="Клиент запросов", phone="+79990000010", responsible="seed")
            db.add(client)
            db.flush()

            req = Request(
                track_number="TRK-SREQ-1",
                client_id=client.id,
                client_name=client.full_name,
                client_phone=client.phone,
                topic_code="consulting",
                status_code="IN_PROGRESS",
                description="Проверка запросов клиента",
                extra_fields={},
                assigned_lawyer_id=lawyer_id,
                responsible="seed",
            )
            db.add(req)
            db.flush()

            db.add_all(
                [
                    RequestServiceRequest(
                        request_id=str(req.id),
                        client_id=str(client.id),
                        assigned_lawyer_id=lawyer_id,
                        type="CURATOR_CONTACT",
                        status="NEW",
                        body="Нужна проверка куратора",
                        created_by_client=True,
                        admin_unread=True,
                        lawyer_unread=True,
                        responsible="Клиент",
                    ),
                    RequestServiceRequest(
                        request_id=str(req.id),
                        client_id=str(client.id),
                        assigned_lawyer_id=lawyer_id,
                        type="LAWYER_CHANGE_REQUEST",
                        status="NEW",
                        body="Прошу сменить юриста",
                        created_by_client=True,
                        admin_unread=True,
                        lawyer_unread=False,
                        responsible="Клиент",
                    ),
                ]
            )
            db.commit()
            request_id = str(req.id)

        listed_admin = self.client.get(f"/api/admin/requests/{request_id}/service-requests", headers=admin_headers)
        self.assertEqual(listed_admin.status_code, 200)
        self.assertEqual(listed_admin.json()["total"], 2)

        listed_lawyer = self.client.get(f"/api/admin/requests/{request_id}/service-requests", headers=lawyer_headers)
        self.assertEqual(listed_lawyer.status_code, 200)
        self.assertEqual(listed_lawyer.json()["total"], 1)
        self.assertEqual((listed_lawyer.json()["rows"] or [])[0]["type"], "CURATOR_CONTACT")

        foreign_lawyer = self.client.get(
            f"/api/admin/requests/{request_id}/service-requests",
            headers=self._auth_headers("LAWYER", sub=str(uuid4()), email="foreign@example.com"),
        )
        self.assertEqual(foreign_lawyer.status_code, 403)

    def test_read_marks_and_status_update_are_audited(self):
        admin_id = str(uuid4())
        admin_headers = self._auth_headers("ADMIN", sub=admin_id)
        lawyer_id = str(uuid4())
        lawyer_headers = self._auth_headers("LAWYER", sub=lawyer_id, email="lawyer@example.com")

        with self.SessionLocal() as db:
            client = Client(full_name="Клиент 2", phone="+79990000011", responsible="seed")
            db.add(client)
            db.flush()

            req = Request(
                track_number="TRK-SREQ-2",
                client_id=client.id,
                client_name=client.full_name,
                client_phone=client.phone,
                topic_code="consulting",
                status_code="IN_PROGRESS",
                description="Проверка read/status",
                extra_fields={},
                assigned_lawyer_id=lawyer_id,
                responsible="seed",
            )
            db.add(req)
            db.flush()

            curator_row = RequestServiceRequest(
                request_id=str(req.id),
                client_id=str(client.id),
                assigned_lawyer_id=lawyer_id,
                type="CURATOR_CONTACT",
                status="NEW",
                body="Сообщение куратору",
                created_by_client=True,
                admin_unread=True,
                lawyer_unread=True,
                responsible="Клиент",
            )
            change_row = RequestServiceRequest(
                request_id=str(req.id),
                client_id=str(client.id),
                assigned_lawyer_id=lawyer_id,
                type="LAWYER_CHANGE_REQUEST",
                status="NEW",
                body="Нужно сменить юриста",
                created_by_client=True,
                admin_unread=True,
                lawyer_unread=False,
                responsible="Клиент",
            )
            db.add_all([curator_row, change_row])
            db.commit()
            curator_id = str(curator_row.id)
            change_id = str(change_row.id)

        read_lawyer = self.client.post(f"/api/admin/requests/service-requests/{curator_id}/read", headers=lawyer_headers)
        self.assertEqual(read_lawyer.status_code, 200)
        self.assertEqual(read_lawyer.json()["changed"], 1)
        self.assertFalse(read_lawyer.json()["row"]["lawyer_unread"])

        denied_lawyer = self.client.post(f"/api/admin/requests/service-requests/{change_id}/read", headers=lawyer_headers)
        self.assertEqual(denied_lawyer.status_code, 403)

        read_admin = self.client.post(f"/api/admin/requests/service-requests/{change_id}/read", headers=admin_headers)
        self.assertEqual(read_admin.status_code, 200)
        self.assertEqual(read_admin.json()["changed"], 1)
        self.assertFalse(read_admin.json()["row"]["admin_unread"])

        status_updated = self.client.patch(
            f"/api/admin/requests/service-requests/{change_id}",
            headers=admin_headers,
            json={"status": "RESOLVED"},
        )
        self.assertEqual(status_updated.status_code, 200)
        self.assertEqual(status_updated.json()["changed"], 1)
        self.assertEqual(status_updated.json()["row"]["status"], "RESOLVED")
        self.assertEqual(status_updated.json()["row"]["resolved_by_admin_id"], admin_id)

        with self.SessionLocal() as db:
            actions = {
                row.action
                for row in db.query(AuditLog)
                .filter(AuditLog.entity == "request_service_requests", AuditLog.entity_id.in_([curator_id, change_id]))
                .all()
            }
        self.assertIn("READ_MARK_LAWYER", actions)
        self.assertIn("READ_MARK_ADMIN", actions)
        self.assertIn("STATUS_UPDATE", actions)

    def test_requests_query_contains_service_request_unread_marker(self):
        admin_headers = self._auth_headers("ADMIN")
        lawyer_id = str(uuid4())
        with self.SessionLocal() as db:
            client = Client(full_name="Клиент 3", phone="+79990000013", responsible="seed")
            db.add(client)
            db.flush()

            req = Request(
                track_number="TRK-SREQ-3",
                client_id=client.id,
                client_name=client.full_name,
                client_phone=client.phone,
                topic_code="consulting",
                status_code="IN_PROGRESS",
                description="Проверка маркера",
                extra_fields={},
                assigned_lawyer_id=lawyer_id,
                responsible="seed",
            )
            db.add(req)
            db.flush()
            req_id = str(req.id)
            service_req = RequestServiceRequest(
                request_id=req_id,
                client_id=str(client.id),
                assigned_lawyer_id=lawyer_id,
                type="CURATOR_CONTACT",
                status="NEW",
                body="Нужна проверка",
                created_by_client=True,
                admin_unread=True,
                lawyer_unread=True,
                responsible="Клиент",
            )
            db.add(service_req)
            db.commit()
            service_req_id = str(service_req.id)

        queried = self.client.post(
            "/api/admin/requests/query",
            headers=admin_headers,
            json={
                "filters": [{"field": "track_number", "op": "=", "value": "TRK-SREQ-3"}],
                "sort": [{"field": "created_at", "dir": "desc"}],
                "page": {"limit": 10, "offset": 0},
            },
        )
        self.assertEqual(queried.status_code, 200)
        rows = queried.json()["rows"] or []
        self.assertEqual(len(rows), 1)
        self.assertTrue(rows[0]["has_service_requests_unread"])
        self.assertEqual(int(rows[0]["service_requests_unread_count"]), 1)

        mark_read = self.client.post(
            f"/api/admin/requests/service-requests/{service_req_id}/read",
            headers=admin_headers,
        )
        self.assertEqual(mark_read.status_code, 200)

        queried_after = self.client.post(
            "/api/admin/requests/query",
            headers=admin_headers,
            json={
                "filters": [{"field": "track_number", "op": "=", "value": "TRK-SREQ-3"}],
                "sort": [{"field": "created_at", "dir": "desc"}],
                "page": {"limit": 10, "offset": 0},
            },
        )
        self.assertEqual(queried_after.status_code, 200)
        rows_after = queried_after.json()["rows"] or []
        self.assertEqual(len(rows_after), 1)
        self.assertFalse(rows_after[0]["has_service_requests_unread"])
        self.assertEqual(int(rows_after[0]["service_requests_unread_count"]), 0)

    def test_curator_role_can_view_and_mark_service_requests(self):
        curator_headers = self._auth_headers("CURATOR", sub=str(uuid4()), email="curator@example.com")
        with self.SessionLocal() as db:
            client = Client(full_name="Клиент 4", phone="+79990000014", responsible="seed")
            db.add(client)
            db.flush()
            req = Request(
                track_number="TRK-SREQ-4",
                client_id=client.id,
                client_name=client.full_name,
                client_phone=client.phone,
                topic_code="consulting",
                status_code="IN_PROGRESS",
                description="Проверка куратора",
                extra_fields={},
                assigned_lawyer_id=str(uuid4()),
                responsible="seed",
            )
            db.add(req)
            db.flush()
            service_req = RequestServiceRequest(
                request_id=str(req.id),
                client_id=str(client.id),
                assigned_lawyer_id=str(req.assigned_lawyer_id),
                type="LAWYER_CHANGE_REQUEST",
                status="NEW",
                body="Прошу сменить юриста",
                created_by_client=True,
                admin_unread=True,
                lawyer_unread=False,
                responsible="Клиент",
            )
            db.add(service_req)
            db.commit()
            request_id = str(req.id)
            service_req_id = str(service_req.id)

        listed = self.client.get(f"/api/admin/requests/{request_id}/service-requests", headers=curator_headers)
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.json()["total"], 1)

        mark_read = self.client.post(f"/api/admin/requests/service-requests/{service_req_id}/read", headers=curator_headers)
        self.assertEqual(mark_read.status_code, 200)
        self.assertEqual(mark_read.json()["changed"], 1)
        self.assertFalse(mark_read.json()["row"]["admin_unread"])
