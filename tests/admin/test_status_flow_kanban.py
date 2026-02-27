from tests.admin.base import *  # noqa: F401,F403


class AdminStatusFlowKanbanTests(AdminUniversalCrudBase):
    def test_request_read_markers_status_update_and_lawyer_open_reset(self):
        with self.SessionLocal() as db:
            lawyer = AdminUser(
                role="LAWYER",
                name="Юрист Маркер",
                email="lawyer-marker@example.com",
                password_hash="hash",
                is_active=True,
            )
            db.add(lawyer)
            db.flush()
            request_row = Request(
                track_number="TRK-MARK-1",
                client_name="Клиент Маркер",
                client_phone="+79990009900",
                status_code="NEW",
                description="markers",
                extra_fields={},
                assigned_lawyer_id=str(lawyer.id),
                lawyer_has_unread_updates=True,
                lawyer_unread_event_type="MESSAGE",
            )
            db.add(request_row)
            db.commit()
            lawyer_id = str(lawyer.id)
            request_id = str(request_row.id)

        lawyer_headers = self._auth_headers("LAWYER", email="lawyer-marker@example.com", sub=lawyer_id)
        admin_headers = self._auth_headers("ADMIN", email="root@example.com")

        opened = self.client.get(f"/api/admin/crud/requests/{request_id}", headers=lawyer_headers)
        self.assertEqual(opened.status_code, 200)
        opened_body = opened.json()
        self.assertFalse(opened_body["lawyer_has_unread_updates"])
        self.assertIsNone(opened_body["lawyer_unread_event_type"])

        with self.SessionLocal() as db:
            opened_db = db.get(Request, UUID(request_id))
            self.assertIsNotNone(opened_db)
            self.assertFalse(opened_db.lawyer_has_unread_updates)
            self.assertIsNone(opened_db.lawyer_unread_event_type)

        updated = self.client.patch(
            f"/api/admin/crud/requests/{request_id}",
            headers=admin_headers,
            json={"status_code": "IN_PROGRESS"},
        )
        self.assertEqual(updated.status_code, 200)
        updated_body = updated.json()
        self.assertTrue(updated_body["client_has_unread_updates"])
        self.assertEqual(updated_body["client_unread_event_type"], "STATUS")

        with self.SessionLocal() as db:
            refreshed = db.get(Request, UUID(request_id))
            self.assertIsNotNone(refreshed)
            self.assertEqual(refreshed.status_code, "IN_PROGRESS")
            self.assertTrue(refreshed.client_has_unread_updates)
            self.assertEqual(refreshed.client_unread_event_type, "STATUS")

    def test_topic_status_flow_blocks_disallowed_transitions(self):
        headers = self._auth_headers("ADMIN", email="root@example.com")
        with self.SessionLocal() as db:
            db.add(Topic(code="civil-law", name="Гражданское право", enabled=True, sort_order=1))
            db.add_all(
                [
                    TopicStatusTransition(topic_code="civil-law", from_status="NEW", to_status="IN_PROGRESS", enabled=True, sort_order=1),
                    TopicStatusTransition(
                        topic_code="civil-law",
                        from_status="IN_PROGRESS",
                        to_status="WAITING_CLIENT",
                        enabled=True,
                        sort_order=2,
                    ),
                ]
            )
            req = Request(
                track_number="TRK-FLOW-1",
                client_name="Клиент Флоу",
                client_phone="+79997770011",
                topic_code="civil-law",
                status_code="NEW",
                description="flow",
                extra_fields={},
            )
            db.add(req)
            db.commit()
            request_id = str(req.id)

        allowed = self.client.patch(
            f"/api/admin/crud/requests/{request_id}",
            headers=headers,
            json={"status_code": "IN_PROGRESS"},
        )
        self.assertEqual(allowed.status_code, 200)

        blocked = self.client.patch(
            f"/api/admin/crud/requests/{request_id}",
            headers=headers,
            json={"status_code": "CLOSED"},
        )
        self.assertEqual(blocked.status_code, 400)
        self.assertIn("Переход статуса не разрешен", blocked.json().get("detail", ""))

        blocked_legacy = self.client.patch(
            f"/api/admin/requests/{request_id}",
            headers=headers,
            json={"status_code": "CLOSED"},
        )
        self.assertEqual(blocked_legacy.status_code, 400)
        self.assertIn("Переход статуса не разрешен", blocked_legacy.json().get("detail", ""))

    def test_topic_without_configured_flow_keeps_backward_compatibility(self):
        headers = self._auth_headers("ADMIN", email="root@example.com")
        with self.SessionLocal() as db:
            db.add(Topic(code="tax-law", name="Налоговое право", enabled=True, sort_order=1))
            req = Request(
                track_number="TRK-FLOW-2",
                client_name="Клиент Флоу 2",
                client_phone="+79997770012",
                topic_code="tax-law",
                status_code="NEW",
                description="flow fallback",
                extra_fields={},
            )
            db.add(req)
            db.commit()
            request_id = str(req.id)

        updated = self.client.patch(
            f"/api/admin/crud/requests/{request_id}",
            headers=headers,
            json={"status_code": "CLOSED"},
        )
        self.assertEqual(updated.status_code, 200)

    def test_admin_can_configure_sla_hours_for_status_transition(self):
        headers = self._auth_headers("ADMIN", email="root@example.com")
        with self.SessionLocal() as db:
            db.add(Topic(code="civil-law", name="Гражданское право", enabled=True, sort_order=1))
            db.add_all(
                [
                    Status(code="NEW", name="Новая", enabled=True, sort_order=0, is_terminal=False),
                    Status(code="IN_PROGRESS", name="В работе", enabled=True, sort_order=1, is_terminal=False),
                ]
            )
            db.commit()

        created = self.client.post(
            "/api/admin/crud/topic_status_transitions",
            headers=headers,
            json={
                "topic_code": "civil-law",
                "from_status": "NEW",
                "to_status": "IN_PROGRESS",
                "enabled": True,
                "sort_order": 1,
                "sla_hours": 24,
            },
        )
        self.assertEqual(created.status_code, 201)
        body = created.json()
        self.assertEqual(body["sla_hours"], 24)
        row_id = body["id"]

        updated = self.client.patch(
            f"/api/admin/crud/topic_status_transitions/{row_id}",
            headers=headers,
            json={"sla_hours": 12},
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["sla_hours"], 12)

        invalid_zero = self.client.patch(
            f"/api/admin/crud/topic_status_transitions/{row_id}",
            headers=headers,
            json={"sla_hours": 0},
        )
        self.assertEqual(invalid_zero.status_code, 400)

        invalid_same_status = self.client.patch(
            f"/api/admin/crud/topic_status_transitions/{row_id}",
            headers=headers,
            json={"to_status": "NEW"},
        )
        self.assertEqual(invalid_same_status.status_code, 400)

    def test_admin_can_configure_transition_step_requirements(self):
        headers = self._auth_headers("ADMIN", email="root@example.com")
        with self.SessionLocal() as db:
            db.add(Topic(code="civil-designer", name="Гражданское (конструктор)", enabled=True, sort_order=1))
            db.add_all(
                [
                    Status(code="NEW", name="Новая", enabled=True, sort_order=0, is_terminal=False),
                    Status(code="IN_PROGRESS", name="В работе", enabled=True, sort_order=1, is_terminal=False),
                ]
            )
            db.commit()

        created = self.client.post(
            "/api/admin/crud/topic_status_transitions",
            headers=headers,
            json={
                "topic_code": "civil-designer",
                "from_status": "NEW",
                "to_status": "IN_PROGRESS",
                "enabled": True,
                "sort_order": 1,
                "sla_hours": 24,
                "required_data_keys": ["passport_scan", "client_address"],
                "required_mime_types": ["application/pdf", "image/*"],
            },
        )
        self.assertEqual(created.status_code, 201)
        body = created.json()
        self.assertEqual(body["required_data_keys"], ["passport_scan", "client_address"])
        self.assertEqual(body["required_mime_types"], ["application/pdf", "image/*"])

        row_id = body["id"]
        updated = self.client.patch(
            f"/api/admin/crud/topic_status_transitions/{row_id}",
            headers=headers,
            json={
                "required_data_keys": ["passport_scan"],
                "required_mime_types": [],
            },
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["required_data_keys"], ["passport_scan"])
        self.assertEqual(updated.json()["required_mime_types"], [])

    def test_request_status_transition_requires_step_data_and_files(self):
        headers = self._auth_headers("ADMIN", email="root@example.com")
        with self.SessionLocal() as db:
            db.add(Topic(code="civil-step-check", name="Проверка шага", enabled=True, sort_order=1))
            db.add_all(
                [
                    Status(code="NEW", name="Новая", enabled=True, sort_order=0, is_terminal=False),
                    Status(code="IN_PROGRESS", name="В работе", enabled=True, sort_order=1, is_terminal=False),
                ]
            )
            db.add(
                TopicStatusTransition(
                    topic_code="civil-step-check",
                    from_status="NEW",
                    to_status="IN_PROGRESS",
                    enabled=True,
                    sort_order=1,
                    sla_hours=48,
                    required_data_keys=["passport_scan"],
                    required_mime_types=["application/pdf"],
                )
            )
            req = Request(
                track_number="TRK-STEP-REQ-1",
                client_name="Клиент шага",
                client_phone="+79990042211",
                topic_code="civil-step-check",
                status_code="NEW",
                description="step requirements",
                extra_fields={},
            )
            db.add(req)
            db.commit()
            request_id = str(req.id)
            request_uuid = UUID(request_id)

        blocked_without_all = self.client.patch(
            f"/api/admin/crud/requests/{request_id}",
            headers=headers,
            json={"status_code": "IN_PROGRESS"},
        )
        self.assertEqual(blocked_without_all.status_code, 400)
        self.assertIn("обязательные данные", blocked_without_all.json().get("detail", ""))
        self.assertIn("обязательные файлы", blocked_without_all.json().get("detail", ""))

        blocked_without_all_legacy = self.client.patch(
            f"/api/admin/requests/{request_id}",
            headers=headers,
            json={"status_code": "IN_PROGRESS"},
        )
        self.assertEqual(blocked_without_all_legacy.status_code, 400)
        self.assertIn("обязательные данные", blocked_without_all_legacy.json().get("detail", ""))

        with_data_only = self.client.patch(
            f"/api/admin/crud/requests/{request_id}",
            headers=headers,
            json={"extra_fields": {"passport_scan": "добавлено"}},
        )
        self.assertEqual(with_data_only.status_code, 200)

        blocked_without_file = self.client.patch(
            f"/api/admin/crud/requests/{request_id}",
            headers=headers,
            json={"status_code": "IN_PROGRESS"},
        )
        self.assertEqual(blocked_without_file.status_code, 400)
        self.assertIn("обязательные файлы", blocked_without_file.json().get("detail", ""))

        with self.SessionLocal() as db:
            db.add(
                Attachment(
                    request_id=request_uuid,
                    file_name="passport.pdf",
                    mime_type="application/pdf",
                    size_bytes=1024,
                    s3_key="requests/passport.pdf",
                    immutable=False,
                )
            )
            db.commit()

        moved = self.client.patch(
            f"/api/admin/crud/requests/{request_id}",
            headers=headers,
            json={"status_code": "IN_PROGRESS"},
        )
        self.assertEqual(moved.status_code, 200)
        self.assertEqual(moved.json().get("status_code"), "IN_PROGRESS")

    def test_status_change_freezes_previous_messages_and_attachments_and_writes_history(self):
        headers = self._auth_headers("ADMIN", email="root@example.com")
        with self.SessionLocal() as db:
            req = Request(
                track_number="TRK-IMM-1",
                client_name="Клиент Иммутабельность",
                client_phone="+79998880011",
                topic_code="civil-law",
                status_code="NEW",
                description="immutable",
                extra_fields={},
            )
            db.add(req)
            db.flush()
            msg = Message(
                request_id=req.id,
                author_type="CLIENT",
                author_name="Клиент",
                body="Первое сообщение",
                immutable=False,
            )
            att = Attachment(
                request_id=req.id,
                file_name="old.pdf",
                mime_type="application/pdf",
                size_bytes=100,
                s3_key="requests/old.pdf",
                immutable=False,
            )
            db.add_all([msg, att])
            db.commit()
            request_id = str(req.id)
            message_id = str(msg.id)
            attachment_id = str(att.id)

        changed = self.client.patch(
            f"/api/admin/crud/requests/{request_id}",
            headers=headers,
            json={"status_code": "IN_PROGRESS"},
        )
        self.assertEqual(changed.status_code, 200)

        with self.SessionLocal() as db:
            msg = db.get(Message, UUID(message_id))
            att = db.get(Attachment, UUID(attachment_id))
            self.assertIsNotNone(msg)
            self.assertIsNotNone(att)
            self.assertTrue(msg.immutable)
            self.assertTrue(att.immutable)
            history = db.query(StatusHistory).filter(StatusHistory.request_id == UUID(request_id)).all()
            self.assertEqual(len(history), 1)
            self.assertEqual(history[0].from_status, "NEW")
            self.assertEqual(history[0].to_status, "IN_PROGRESS")

        blocked_update = self.client.patch(
            f"/api/admin/crud/messages/{message_id}",
            headers=headers,
            json={"body": "Попытка правки"},
        )
        self.assertEqual(blocked_update.status_code, 400)
        self.assertIn("зафиксирована", blocked_update.json().get("detail", ""))

        blocked_delete = self.client.delete(f"/api/admin/crud/attachments/{attachment_id}", headers=headers)
        self.assertEqual(blocked_delete.status_code, 400)
        self.assertIn("зафиксирована", blocked_delete.json().get("detail", ""))

    def test_legacy_request_patch_also_writes_status_history_and_freezes(self):
        headers = self._auth_headers("ADMIN", email="root@example.com")
        with self.SessionLocal() as db:
            req = Request(
                track_number="TRK-IMM-2",
                client_name="Клиент Legacy",
                client_phone="+79998880012",
                topic_code="civil-law",
                status_code="NEW",
                description="legacy immutable",
                extra_fields={},
            )
            db.add(req)
            db.flush()
            msg = Message(
                request_id=req.id,
                author_type="LAWYER",
                author_name="Юрист",
                body="Ответ",
                immutable=False,
            )
            db.add(msg)
            db.commit()
            request_id = str(req.id)
            message_id = str(msg.id)

        changed = self.client.patch(
            f"/api/admin/requests/{request_id}",
            headers=headers,
            json={"status_code": "IN_PROGRESS"},
        )
        self.assertEqual(changed.status_code, 200)

        with self.SessionLocal() as db:
            msg = db.get(Message, UUID(message_id))
            self.assertIsNotNone(msg)
            self.assertTrue(msg.immutable)
            history = db.query(StatusHistory).filter(StatusHistory.request_id == UUID(request_id)).all()
            self.assertEqual(len(history), 1)
            self.assertEqual(history[0].from_status, "NEW")
            self.assertEqual(history[0].to_status, "IN_PROGRESS")

    def test_request_status_route_returns_progress_and_respects_role_scope(self):
        with self.SessionLocal() as db:
            db.add_all(
                [
                    Status(code="NEW", name="Новая", enabled=True, sort_order=1, kind="DEFAULT"),
                    Status(code="IN_PROGRESS", name="В работе", enabled=True, sort_order=2, kind="DEFAULT"),
                    Status(code="WAITING_CLIENT", name="Ожидание клиента", enabled=True, sort_order=3, kind="DEFAULT"),
                ]
            )
            db.add_all(
                [
                    TopicStatusTransition(
                        topic_code="civil-law",
                        from_status="NEW",
                        to_status="IN_PROGRESS",
                        enabled=True,
                        sla_hours=24,
                        sort_order=1,
                    ),
                    TopicStatusTransition(
                        topic_code="civil-law",
                        from_status="IN_PROGRESS",
                        to_status="WAITING_CLIENT",
                        enabled=True,
                        sla_hours=72,
                        sort_order=2,
                    ),
                ]
            )
            lawyer = AdminUser(
                role="LAWYER",
                name="Юрист маршрута",
                email="lawyer.route@example.com",
                password_hash="hash",
                is_active=True,
            )
            outsider = AdminUser(
                role="LAWYER",
                name="Чужой юрист",
                email="lawyer.outside.route@example.com",
                password_hash="hash",
                is_active=True,
            )
            db.add_all([lawyer, outsider])
            db.flush()
            req = Request(
                track_number="TRK-ROUTE-1",
                client_name="Клиент",
                client_phone="+79990001122",
                topic_code="civil-law",
                status_code="IN_PROGRESS",
                assigned_lawyer_id=str(lawyer.id),
                description="route check",
                extra_fields={},
            )
            db.add(req)
            db.flush()
            db.add(
                StatusHistory(
                    request_id=req.id,
                    from_status="NEW",
                    to_status="IN_PROGRESS",
                    comment="start progress",
                    changed_by_admin_id=None,
                )
            )
            db.commit()
            request_id = str(req.id)
            lawyer_id = str(lawyer.id)
            outsider_id = str(outsider.id)

        admin_headers = self._auth_headers("ADMIN", email="root@example.com")
        assigned_headers = self._auth_headers("LAWYER", email="lawyer.route@example.com", sub=lawyer_id)
        outsider_headers = self._auth_headers("LAWYER", email="lawyer.outside.route@example.com", sub=outsider_id)

        admin_response = self.client.get(f"/api/admin/requests/{request_id}/status-route", headers=admin_headers)
        self.assertEqual(admin_response.status_code, 200)
        payload = admin_response.json()
        self.assertEqual(payload["current_status"], "IN_PROGRESS")
        nodes = payload.get("nodes") or []
        self.assertEqual([item["code"] for item in nodes], ["NEW", "IN_PROGRESS", "WAITING_CLIENT"])
        self.assertEqual(nodes[0]["state"], "completed")
        self.assertEqual(nodes[1]["state"], "current")
        self.assertEqual(nodes[2]["state"], "pending")
        self.assertEqual(nodes[1]["sla_hours"], 24)
        self.assertEqual(nodes[2]["sla_hours"], 72)

        assigned_response = self.client.get(f"/api/admin/requests/{request_id}/status-route", headers=assigned_headers)
        self.assertEqual(assigned_response.status_code, 200)
        self.assertEqual(assigned_response.json()["current_status"], "IN_PROGRESS")

        outsider_forbidden = self.client.get(f"/api/admin/requests/{request_id}/status-route", headers=outsider_headers)
        self.assertEqual(outsider_forbidden.status_code, 403)

    def test_requests_kanban_returns_grouped_cards_and_role_scope(self):
        with self.SessionLocal() as db:
            group_new = StatusGroup(name="Новые", sort_order=10)
            group_progress = StatusGroup(name="В работе", sort_order=20)
            group_waiting = StatusGroup(name="Ожидание", sort_order=30)
            group_done = StatusGroup(name="Завершены", sort_order=40)
            db.add_all([group_new, group_progress, group_waiting, group_done])
            db.flush()
            db.add_all(
                [
                    Status(
                        code="NEW",
                        name="Новая",
                        enabled=True,
                        sort_order=1,
                        is_terminal=False,
                        kind="DEFAULT",
                        status_group_id=group_new.id,
                    ),
                    Status(
                        code="IN_PROGRESS",
                        name="В работе",
                        enabled=True,
                        sort_order=2,
                        is_terminal=False,
                        kind="DEFAULT",
                        status_group_id=group_progress.id,
                    ),
                    Status(
                        code="WAITING_CLIENT",
                        name="Ожидание клиента",
                        enabled=True,
                        sort_order=3,
                        is_terminal=False,
                        kind="DEFAULT",
                        status_group_id=group_waiting.id,
                    ),
                    Status(
                        code="CLOSED",
                        name="Закрыта",
                        enabled=True,
                        sort_order=4,
                        is_terminal=True,
                        kind="DEFAULT",
                        status_group_id=group_done.id,
                    ),
                ]
            )
            db.add(Topic(code="civil-law", name="Гражданское право", enabled=True, sort_order=1))
            db.add_all(
                [
                    TopicStatusTransition(
                        topic_code="civil-law",
                        from_status="NEW",
                        to_status="IN_PROGRESS",
                        enabled=True,
                        sla_hours=24,
                        sort_order=1,
                    ),
                    TopicStatusTransition(
                        topic_code="civil-law",
                        from_status="IN_PROGRESS",
                        to_status="WAITING_CLIENT",
                        enabled=True,
                        sla_hours=12,
                        sort_order=2,
                    ),
                    TopicStatusTransition(
                        topic_code="civil-law",
                        from_status="WAITING_CLIENT",
                        to_status="CLOSED",
                        enabled=True,
                        sla_hours=8,
                        sort_order=3,
                    ),
                ]
            )

            lawyer_main = AdminUser(
                role="LAWYER",
                name="Юрист канбана",
                email="lawyer.kanban@example.com",
                password_hash="hash",
                is_active=True,
            )
            lawyer_other = AdminUser(
                role="LAWYER",
                name="Другой юрист",
                email="lawyer.kanban.other@example.com",
                password_hash="hash",
                is_active=True,
            )
            db.add_all([lawyer_main, lawyer_other])
            db.flush()

            request_new = Request(
                track_number="TRK-KANBAN-NEW",
                client_name="Клиент 1",
                client_phone="+79990000001",
                topic_code="civil-law",
                status_code="NEW",
                description="Новая неназначенная",
                extra_fields={},
                assigned_lawyer_id=None,
            )
            request_progress = Request(
                track_number="TRK-KANBAN-PROGRESS",
                client_name="Клиент 2",
                client_phone="+79990000002",
                topic_code="civil-law",
                status_code="IN_PROGRESS",
                description="Заявка в работе",
                extra_fields={"deadline_at": "2031-01-01T10:00:00+00:00"},
                assigned_lawyer_id=str(lawyer_main.id),
            )
            request_waiting = Request(
                track_number="TRK-KANBAN-WAITING",
                client_name="Клиент 3",
                client_phone="+79990000003",
                topic_code="civil-law",
                status_code="WAITING_CLIENT",
                description="Чужая заявка",
                extra_fields={},
                assigned_lawyer_id=str(lawyer_other.id),
            )
            request_overdue = Request(
                track_number="TRK-KANBAN-OVERDUE",
                client_name="Клиент 4",
                client_phone="+79990000004",
                topic_code="civil-law",
                status_code="IN_PROGRESS",
                description="Просроченная заявка",
                extra_fields={},
                assigned_lawyer_id=str(lawyer_main.id),
            )
            db.add_all([request_new, request_progress, request_waiting, request_overdue])
            db.flush()

            entered_progress_at = datetime.now(timezone.utc) - timedelta(hours=2)
            entered_overdue_at = datetime.now(timezone.utc) - timedelta(hours=30)
            db.add(
                StatusHistory(
                    request_id=request_progress.id,
                    from_status="NEW",
                    to_status="IN_PROGRESS",
                    changed_by_admin_id=None,
                    comment="started",
                    created_at=entered_progress_at,
                )
            )
            db.add(
                StatusHistory(
                    request_id=request_overdue.id,
                    from_status="NEW",
                    to_status="IN_PROGRESS",
                    changed_by_admin_id=None,
                    comment="overdue",
                    created_at=entered_overdue_at,
                )
            )
            db.commit()

            request_new_id = str(request_new.id)
            request_progress_id = str(request_progress.id)
            request_waiting_id = str(request_waiting.id)
            request_overdue_id = str(request_overdue.id)
            lawyer_main_id = str(lawyer_main.id)
            group_new_id = str(group_new.id)
            group_progress_id = str(group_progress.id)

        admin_headers = self._auth_headers("ADMIN", email="root@example.com")
        admin_response = self.client.get("/api/admin/requests/kanban?limit=100", headers=admin_headers)
        self.assertEqual(admin_response.status_code, 200)
        admin_payload = admin_response.json()
        self.assertEqual(admin_payload["scope"], "ADMIN")
        self.assertEqual(admin_payload["total"], 4)
        rows = {item["id"]: item for item in (admin_payload.get("rows") or [])}
        self.assertIn(request_new_id, rows)
        self.assertIn(request_progress_id, rows)
        self.assertIn(request_waiting_id, rows)
        self.assertIn(request_overdue_id, rows)
        self.assertEqual(rows[request_new_id]["status_group"], group_new_id)
        self.assertEqual(rows[request_progress_id]["status_group"], group_progress_id)
        self.assertEqual(rows[request_progress_id]["assigned_lawyer_id"], lawyer_main_id)
        transitions = rows[request_progress_id].get("available_transitions") or []
        self.assertTrue(any(item.get("to_status") == "WAITING_CLIENT" for item in transitions))
        self.assertEqual(rows[request_progress_id]["case_deadline_at"], "2031-01-01T10:00:00+00:00")
        self.assertIsNotNone(rows[request_progress_id]["sla_deadline_at"])
        self.assertFalse(bool(admin_payload.get("truncated")))
        self.assertEqual([item.get("label") for item in (admin_payload.get("columns") or [])][:4], ["Новые", "В работе", "Ожидание", "Завершены"])

        lawyer_headers = self._auth_headers("LAWYER", email="lawyer.kanban@example.com", sub=lawyer_main_id)
        lawyer_response = self.client.get("/api/admin/requests/kanban?limit=100", headers=lawyer_headers)
        self.assertEqual(lawyer_response.status_code, 200)
        lawyer_payload = lawyer_response.json()
        self.assertEqual(lawyer_payload["scope"], "LAWYER")
        lawyer_rows = {item["id"]: item for item in (lawyer_payload.get("rows") or [])}
        self.assertIn(request_new_id, lawyer_rows)
        self.assertIn(request_progress_id, lawyer_rows)
        self.assertIn(request_overdue_id, lawyer_rows)
        self.assertNotIn(request_waiting_id, lawyer_rows)
        self.assertEqual(lawyer_payload["total"], 3)

        filtered_by_lawyer = self.client.get(
            "/api/admin/requests/kanban",
            headers=admin_headers,
            params={
                "limit": 100,
                "filters": json.dumps([{"field": "assigned_lawyer_id", "op": "=", "value": lawyer_main_id}]),
            },
        )
        self.assertEqual(filtered_by_lawyer.status_code, 200)
        filtered_rows = {item["id"] for item in (filtered_by_lawyer.json().get("rows") or [])}
        self.assertEqual(filtered_rows, {request_progress_id, request_overdue_id})

        filtered_overdue = self.client.get(
            "/api/admin/requests/kanban",
            headers=admin_headers,
            params={
                "limit": 100,
                "filters": json.dumps([{"field": "overdue", "op": "=", "value": True}]),
            },
        )
        self.assertEqual(filtered_overdue.status_code, 200)
        overdue_rows = {item["id"] for item in (filtered_overdue.json().get("rows") or [])}
        self.assertEqual(overdue_rows, {request_overdue_id})

        sorted_by_deadline = self.client.get(
            "/api/admin/requests/kanban",
            headers=admin_headers,
            params={"limit": 100, "sort_mode": "deadline"},
        )
        self.assertEqual(sorted_by_deadline.status_code, 200)
        sorted_rows = sorted_by_deadline.json().get("rows") or []
        self.assertTrue(sorted_rows)
        self.assertEqual(sorted_rows[0]["id"], request_overdue_id)

