from tests.admin.base import *  # noqa: F401,F403


class AdminMetricsTemplatesTests(AdminUniversalCrudBase):
    def test_dashboard_metrics_returns_lawyer_loads(self):
        headers = self._auth_headers("ADMIN", email="root@example.com")
        with self.SessionLocal() as db:
            db.add_all(
                [
                    Status(code="NEW", name="Новая", enabled=True, sort_order=0, is_terminal=False),
                    Status(code="IN_PROGRESS", name="В работе", enabled=True, sort_order=1, is_terminal=False),
                    Status(code="CLOSED", name="Закрыта", enabled=True, sort_order=2, is_terminal=True),
                ]
            )
            lawyer_busy = AdminUser(
                role="LAWYER",
                name="Юрист Загруженный",
                email="busy@example.com",
                password_hash="hash",
                avatar_url="https://cdn.example.com/a.png",
                primary_topic_code="civil-law",
                is_active=True,
            )
            lawyer_free = AdminUser(
                role="LAWYER",
                name="Юрист Свободный",
                email="free@example.com",
                password_hash="hash",
                avatar_url=None,
                primary_topic_code="family-law",
                is_active=True,
            )
            db.add_all([lawyer_busy, lawyer_free])
            db.flush()
            db.add_all(
                [
                    Request(
                        track_number="TRK-METRICS-1",
                        client_name="Клиент 1",
                        client_phone="+79990000001",
                        topic_code="civil-law",
                        status_code="NEW",
                        assigned_lawyer_id=str(lawyer_busy.id),
                        extra_fields={},
                    ),
                    Request(
                        track_number="TRK-METRICS-2",
                        client_name="Клиент 2",
                        client_phone="+79990000002",
                        topic_code="civil-law",
                        status_code="CLOSED",
                        assigned_lawyer_id=str(lawyer_busy.id),
                        extra_fields={},
                    ),
                ]
            )
            db.commit()

        response = self.client.get("/api/admin/metrics/overview", headers=headers)
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("lawyer_loads", body)
        self.assertEqual(len(body["lawyer_loads"]), 2)

        by_email = {row["email"]: row for row in body["lawyer_loads"]}
        self.assertEqual(by_email["busy@example.com"]["active_load"], 1)
        self.assertEqual(by_email["busy@example.com"]["total_assigned"], 2)
        self.assertEqual(by_email["busy@example.com"]["avatar_url"], "https://cdn.example.com/a.png")
        self.assertEqual(by_email["free@example.com"]["active_load"], 0)
        self.assertEqual(by_email["free@example.com"]["total_assigned"], 0)

    def test_dashboard_metrics_returns_service_request_unread_totals(self):
        admin_headers = self._auth_headers("ADMIN", email="root@example.com")
        lawyer_id = str(uuid4())
        lawyer_headers = self._auth_headers("LAWYER", sub=lawyer_id, email="lawyer@example.com")
        with self.SessionLocal() as db:
            client = Client(full_name="Клиент по запросам", phone="+79990000012", responsible="seed")
            db.add(client)
            db.flush()
            req = Request(
                track_number="TRK-METRICS-SR-1",
                client_id=client.id,
                client_name=client.full_name,
                client_phone=client.phone,
                topic_code="consulting",
                status_code="IN_PROGRESS",
                assigned_lawyer_id=lawyer_id,
                extra_fields={},
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
                        body="Нужна консультация администратора",
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

        admin_response = self.client.get("/api/admin/metrics/overview", headers=admin_headers)
        self.assertEqual(admin_response.status_code, 200)
        self.assertEqual(int(admin_response.json().get("service_request_unread_total") or 0), 2)

        lawyer_response = self.client.get("/api/admin/metrics/overview", headers=lawyer_headers)
        self.assertEqual(lawyer_response.status_code, 200)
        self.assertEqual(int(lawyer_response.json().get("service_request_unread_total") or 0), 1)

    def test_dashboard_metrics_returns_dynamic_sla_and_frt(self):
        headers = self._auth_headers("ADMIN", email="root@example.com")
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as db:
            db.add_all(
                [
                    Status(code="NEW", name="Новая", enabled=True, sort_order=0, is_terminal=False),
                    Status(code="CLOSED", name="Закрыта", enabled=True, sort_order=1, is_terminal=True),
                ]
            )

            req = Request(
                track_number="TRK-SLA-M-1",
                client_name="Клиент SLA",
                client_phone="+79990000003",
                topic_code="civil-law",
                status_code="NEW",
                extra_fields={},
                created_at=now - timedelta(hours=30),
                updated_at=now - timedelta(hours=30),
            )
            db.add(req)
            db.flush()
            db.add(
                Message(
                    request_id=req.id,
                    author_type="LAWYER",
                    author_name="Юрист",
                    body="Ответ",
                    created_at=req.created_at + timedelta(minutes=20),
                    updated_at=req.created_at + timedelta(minutes=20),
                )
            )
            db.add(
                StatusHistory(
                    request_id=req.id,
                    from_status=None,
                    to_status="NEW",
                    changed_by_admin_id=None,
                    created_at=now - timedelta(hours=30),
                    updated_at=now - timedelta(hours=30),
                )
            )
            db.commit()

        response = self.client.get("/api/admin/metrics/overview", headers=headers)
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertGreaterEqual(int(body.get("sla_overdue") or 0), 1)
        self.assertIsNotNone(body.get("frt_avg_minutes"))
        self.assertAlmostEqual(float(body["frt_avg_minutes"]), 20.0, places=1)
        self.assertIn("NEW", body.get("avg_time_in_status_hours") or {})

    def test_admin_can_manage_admin_user_topics_only_for_lawyers(self):
        headers = self._auth_headers("ADMIN", email="root@example.com")
        with self.SessionLocal() as db:
            db.add_all(
                [
                    Topic(code="civil-law", name="Гражданское право", enabled=True, sort_order=1),
                    Topic(code="tax-law", name="Налоговое право", enabled=True, sort_order=2),
                ]
            )
            lawyer = AdminUser(
                role="LAWYER",
                name="Юрист Профильный",
                email="lawyer.topics@example.com",
                password_hash="hash",
                is_active=True,
            )
            admin = AdminUser(
                role="ADMIN",
                name="Администратор",
                email="admin.topics@example.com",
                password_hash="hash",
                is_active=True,
            )
            db.add_all([lawyer, admin])
            db.commit()
            lawyer_id = str(lawyer.id)
            admin_id = str(admin.id)

        created = self.client.post(
            "/api/admin/crud/admin_user_topics",
            headers=headers,
            json={"admin_user_id": lawyer_id, "topic_code": "civil-law"},
        )
        self.assertEqual(created.status_code, 201)
        body = created.json()
        self.assertEqual(body["admin_user_id"], lawyer_id)
        self.assertEqual(body["topic_code"], "civil-law")
        self.assertEqual(body["responsible"], "root@example.com")
        relation_id = body["id"]
        UUID(relation_id)

        queried = self.client.post(
            "/api/admin/crud/admin_user_topics/query",
            headers=headers,
            json={
                "filters": [{"field": "admin_user_id", "op": "=", "value": lawyer_id}],
                "sort": [{"field": "created_at", "dir": "desc"}],
                "page": {"limit": 50, "offset": 0},
            },
        )
        self.assertEqual(queried.status_code, 200)
        self.assertEqual(queried.json()["total"], 1)

        updated = self.client.patch(
            f"/api/admin/crud/admin_user_topics/{relation_id}",
            headers=headers,
            json={"topic_code": "tax-law"},
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["topic_code"], "tax-law")

        forbidden_for_non_lawyer = self.client.post(
            "/api/admin/crud/admin_user_topics",
            headers=headers,
            json={"admin_user_id": admin_id, "topic_code": "civil-law"},
        )
        self.assertEqual(forbidden_for_non_lawyer.status_code, 400)

        deleted = self.client.delete(f"/api/admin/crud/admin_user_topics/{relation_id}", headers=headers)
        self.assertEqual(deleted.status_code, 200)

    def test_topic_templates_crud_and_request_required_fields_validation(self):
        headers = self._auth_headers("ADMIN", email="root@example.com")
        with self.SessionLocal() as db:
            db.add(Topic(code="civil-law", name="Гражданское право", enabled=True, sort_order=1))
            db.add(
                FormField(
                    key="passport_series",
                    label="Серия паспорта",
                    type="string",
                    required=False,
                    enabled=True,
                    sort_order=1,
                )
            )
            db.commit()

        required_created = self.client.post(
            "/api/admin/crud/topic_required_fields",
            headers=headers,
            json={
                "topic_code": "civil-law",
                "field_key": "passport_series",
                "required": True,
                "enabled": True,
                "sort_order": 10,
            },
        )
        self.assertEqual(required_created.status_code, 201)
        self.assertEqual(required_created.json()["responsible"], "root@example.com")

        invalid_required = self.client.post(
            "/api/admin/crud/topic_required_fields",
            headers=headers,
            json={
                "topic_code": "civil-law",
                "field_key": "missing_field",
                "required": True,
                "enabled": True,
                "sort_order": 11,
            },
        )
        self.assertEqual(invalid_required.status_code, 400)

        template_created = self.client.post(
            "/api/admin/crud/topic_data_templates",
            headers=headers,
            json={
                "topic_code": "civil-law",
                "key": "court_file",
                "label": "Судебный файл",
                "description": "PDF с материалами",
                "required": True,
                "enabled": True,
                "sort_order": 1,
            },
        )
        self.assertEqual(template_created.status_code, 201)
        self.assertEqual(template_created.json()["topic_code"], "civil-law")

        blocked = self.client.post(
            "/api/admin/crud/requests",
            headers=headers,
            json={
                "client_name": "ООО Проверка",
                "client_phone": "+79995550001",
                "topic_code": "civil-law",
                "status_code": "NEW",
                "description": "missing required extra field",
                "extra_fields": {},
            },
        )
        self.assertEqual(blocked.status_code, 400)
        self.assertIn("passport_series", blocked.json().get("detail", ""))

        created = self.client.post(
            "/api/admin/crud/requests",
            headers=headers,
            json={
                "client_name": "ООО Проверка",
                "client_phone": "+79995550001",
                "topic_code": "civil-law",
                "status_code": "NEW",
                "description": "required extra field provided",
                "extra_fields": {"passport_series": "1234"},
            },
        )
        self.assertEqual(created.status_code, 201)
        request_id = created.json()["id"]

        with self.SessionLocal() as db:
            row = db.get(Request, UUID(request_id))
            self.assertIsNotNone(row)
            self.assertEqual(row.extra_fields, {"passport_series": "1234"})

    def test_request_data_template_endpoints_for_assigned_lawyer(self):
        headers_admin = self._auth_headers("ADMIN", email="root@example.com")
        with self.SessionLocal() as db:
            db.add(Topic(code="civil-law", name="Гражданское право", enabled=True, sort_order=1))
            lawyer = AdminUser(
                role="LAWYER",
                name="Юрист Шаблон",
                email="lawyer.template@example.com",
                password_hash="hash",
                is_active=True,
            )
            outsider = AdminUser(
                role="LAWYER",
                name="Юрист Чужой",
                email="lawyer.outside@example.com",
                password_hash="hash",
                is_active=True,
            )
            db.add_all([lawyer, outsider])
            db.flush()
            req = Request(
                track_number="TRK-TEMPLATE-1",
                client_name="Клиент",
                client_phone="+79997770013",
                topic_code="civil-law",
                status_code="IN_PROGRESS",
                assigned_lawyer_id=str(lawyer.id),
                description="template flow",
                extra_fields={},
            )
            db.add(req)
            db.flush()
            db.add_all(
                [
                    TopicDataTemplate(
                        topic_code="civil-law",
                        key="power_of_attorney",
                        label="Доверенность",
                        description="Скан доверенности",
                        required=True,
                        enabled=True,
                        sort_order=1,
                    ),
                    TopicDataTemplate(
                        topic_code="civil-law",
                        key="claim_copy",
                        label="Копия иска",
                        description="Копия заявления",
                        required=False,
                        enabled=True,
                        sort_order=2,
                    ),
                ]
            )
            db.commit()
            request_id = str(req.id)
            lawyer_id = str(lawyer.id)
            outsider_id = str(outsider.id)

        headers_lawyer = self._auth_headers("LAWYER", email="lawyer.template@example.com", sub=lawyer_id)
        headers_outsider = self._auth_headers("LAWYER", email="lawyer.outside@example.com", sub=outsider_id)

        pre = self.client.get(f"/api/admin/requests/{request_id}/data-template", headers=headers_lawyer)
        self.assertEqual(pre.status_code, 200)
        self.assertEqual(len(pre.json()["topic_items"]), 2)
        self.assertEqual(len(pre.json()["request_items"]), 0)

        sync = self.client.post(f"/api/admin/requests/{request_id}/data-template/sync", headers=headers_lawyer)
        self.assertEqual(sync.status_code, 200)
        self.assertEqual(sync.json()["created"], 2)

        sync_repeat = self.client.post(f"/api/admin/requests/{request_id}/data-template/sync", headers=headers_lawyer)
        self.assertEqual(sync_repeat.status_code, 200)
        self.assertEqual(sync_repeat.json()["created"], 0)

        created_custom = self.client.post(
            f"/api/admin/requests/{request_id}/data-template/items",
            headers=headers_lawyer,
            json={
                "key": "additional_scan",
                "label": "Дополнительный скан",
                "description": "Любой дополнительный файл",
                "required": False,
            },
        )
        self.assertEqual(created_custom.status_code, 201)
        custom_item_id = created_custom.json()["id"]

        updated_custom = self.client.patch(
            f"/api/admin/requests/{request_id}/data-template/items/{custom_item_id}",
            headers=headers_lawyer,
            json={"label": "Дополнительный скан (обновлено)", "required": True},
        )
        self.assertEqual(updated_custom.status_code, 200)
        self.assertEqual(updated_custom.json()["label"], "Дополнительный скан (обновлено)")
        self.assertTrue(updated_custom.json()["required"])

        outsider_forbidden = self.client.get(f"/api/admin/requests/{request_id}/data-template", headers=headers_outsider)
        self.assertEqual(outsider_forbidden.status_code, 403)

        admin_access = self.client.get(f"/api/admin/requests/{request_id}/data-template", headers=headers_admin)
        self.assertEqual(admin_access.status_code, 200)
        self.assertEqual(len(admin_access.json()["request_items"]), 3)

        deleted_custom = self.client.delete(
            f"/api/admin/requests/{request_id}/data-template/items/{custom_item_id}",
            headers=headers_lawyer,
        )
        self.assertEqual(deleted_custom.status_code, 200)

        with self.SessionLocal() as db:
            count = db.query(RequestDataRequirement).filter(RequestDataRequirement.request_id == UUID(request_id)).count()
        self.assertEqual(count, 2)
