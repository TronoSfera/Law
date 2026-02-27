from tests.admin.base import *  # noqa: F401,F403


class AdminLawyerChatTests(AdminUniversalCrudBase):
    def test_lawyer_permissions_and_request_crud(self):
        lawyer_headers = self._auth_headers("LAWYER")

        forbidden = self.client.post(
            "/api/admin/crud/quotes",
            headers=lawyer_headers,
            json={"author": "X", "text": "Y"},
        )
        self.assertEqual(forbidden.status_code, 403)

        request_create = self.client.post(
            "/api/admin/crud/requests",
            headers=lawyer_headers,
            json={
                "client_name": "ООО Право",
                "client_phone": "+79990000002",
                "status_code": "NEW",
                "description": "Тест универсального CRUD",
            },
        )
        self.assertEqual(request_create.status_code, 201)
        body = request_create.json()
        self.assertTrue(body["track_number"].startswith("TRK-"))
        self.assertEqual(body["responsible"], "lawyer@example.com")
        request_id = body["id"]
        UUID(request_id)

        query = self.client.post(
            "/api/admin/crud/requests/query",
            headers=lawyer_headers,
            json={"filters": [], "sort": [{"field": "created_at", "dir": "desc"}], "page": {"limit": 50, "offset": 0}},
        )
        self.assertEqual(query.status_code, 200)
        self.assertEqual(query.json()["total"], 1)

        status_forbidden = self.client.post(
            "/api/admin/crud/statuses/query",
            headers=lawyer_headers,
            json={"filters": [], "sort": [], "page": {"limit": 50, "offset": 0}},
        )
        self.assertEqual(status_forbidden.status_code, 403)

    def test_lawyer_can_see_own_and_unassigned_requests_and_close_only_own(self):
        with self.SessionLocal() as db:
            lawyer_self = AdminUser(
                role="LAWYER",
                name="Юрист Свой",
                email="lawyer.self@example.com",
                password_hash="hash",
                is_active=True,
            )
            lawyer_other = AdminUser(
                role="LAWYER",
                name="Юрист Чужой",
                email="lawyer.other@example.com",
                password_hash="hash",
                is_active=True,
            )
            db.add_all([lawyer_self, lawyer_other])
            db.flush()
            self_id = str(lawyer_self.id)
            other_id = str(lawyer_other.id)

            own = Request(
                track_number="TRK-LAWYER-OWN",
                client_name="Клиент Свой",
                client_phone="+79990001011",
                status_code="NEW",
                description="own",
                extra_fields={},
                assigned_lawyer_id=self_id,
            )
            foreign = Request(
                track_number="TRK-LAWYER-FOREIGN",
                client_name="Клиент Чужой",
                client_phone="+79990001012",
                status_code="NEW",
                description="foreign",
                extra_fields={},
                assigned_lawyer_id=other_id,
            )
            unassigned = Request(
                track_number="TRK-LAWYER-UNASSIGNED",
                client_name="Клиент Без назначения",
                client_phone="+79990001013",
                status_code="NEW",
                description="unassigned",
                extra_fields={},
                assigned_lawyer_id=None,
            )
            db.add_all([own, foreign, unassigned])
            db.commit()
            own_id = str(own.id)
            foreign_id = str(foreign.id)
            unassigned_id = str(unassigned.id)

        headers = self._auth_headers("LAWYER", email="lawyer.self@example.com", sub=self_id)

        crud_query = self.client.post(
            "/api/admin/crud/requests/query",
            headers=headers,
            json={"filters": [], "sort": [{"field": "created_at", "dir": "asc"}], "page": {"limit": 50, "offset": 0}},
        )
        self.assertEqual(crud_query.status_code, 200)
        crud_ids = {str(row["id"]) for row in (crud_query.json().get("rows") or [])}
        self.assertEqual(crud_ids, {own_id, unassigned_id})

        legacy_query = self.client.post(
            "/api/admin/requests/query",
            headers=headers,
            json={"filters": [], "sort": [{"field": "created_at", "dir": "asc"}], "page": {"limit": 50, "offset": 0}},
        )
        self.assertEqual(legacy_query.status_code, 200)
        legacy_ids = {str(row["id"]) for row in (legacy_query.json().get("rows") or [])}
        self.assertEqual(legacy_ids, {own_id, unassigned_id})

        crud_get_foreign = self.client.get(f"/api/admin/crud/requests/{foreign_id}", headers=headers)
        self.assertEqual(crud_get_foreign.status_code, 403)
        legacy_get_foreign = self.client.get(f"/api/admin/requests/{foreign_id}", headers=headers)
        self.assertEqual(legacy_get_foreign.status_code, 403)

        crud_update_unassigned = self.client.patch(
            f"/api/admin/crud/requests/{unassigned_id}",
            headers=headers,
            json={"status_code": "CLOSED"},
        )
        self.assertEqual(crud_update_unassigned.status_code, 403)
        legacy_update_unassigned = self.client.patch(
            f"/api/admin/requests/{unassigned_id}",
            headers=headers,
            json={"status_code": "CLOSED"},
        )
        self.assertEqual(legacy_update_unassigned.status_code, 403)

        close_own = self.client.patch(
            f"/api/admin/requests/{own_id}",
            headers=headers,
            json={"status_code": "CLOSED"},
        )
        self.assertEqual(close_own.status_code, 200)

        with self.SessionLocal() as db:
            refreshed = db.get(Request, UUID(own_id))
            self.assertIsNotNone(refreshed)
            self.assertEqual(refreshed.status_code, "CLOSED")

    def test_lawyer_messages_and_attachments_are_scoped_by_request_access(self):
        with self.SessionLocal() as db:
            lawyer_self = AdminUser(
                role="LAWYER",
                name="Юрист Свой",
                email="lawyer.msg.self@example.com",
                password_hash="hash",
                is_active=True,
            )
            lawyer_other = AdminUser(
                role="LAWYER",
                name="Юрист Чужой",
                email="lawyer.msg.other@example.com",
                password_hash="hash",
                is_active=True,
            )
            db.add_all([lawyer_self, lawyer_other])
            db.flush()
            self_id = str(lawyer_self.id)
            other_id = str(lawyer_other.id)

            own = Request(
                track_number="TRK-MSG-OWN",
                client_name="Клиент Свой",
                client_phone="+79990010101",
                status_code="IN_PROGRESS",
                description="own",
                extra_fields={},
                assigned_lawyer_id=self_id,
            )
            foreign = Request(
                track_number="TRK-MSG-FOREIGN",
                client_name="Клиент Чужой",
                client_phone="+79990010102",
                status_code="IN_PROGRESS",
                description="foreign",
                extra_fields={},
                assigned_lawyer_id=other_id,
            )
            unassigned = Request(
                track_number="TRK-MSG-UNASSIGNED",
                client_name="Клиент Без назначения",
                client_phone="+79990010103",
                status_code="NEW",
                description="unassigned",
                extra_fields={},
                assigned_lawyer_id=None,
            )
            db.add_all([own, foreign, unassigned])
            db.flush()

            msg_own = Message(request_id=own.id, author_type="CLIENT", author_name="Клиент", body="own", immutable=False)
            msg_foreign = Message(request_id=foreign.id, author_type="CLIENT", author_name="Клиент", body="foreign", immutable=False)
            msg_unassigned = Message(request_id=unassigned.id, author_type="CLIENT", author_name="Клиент", body="unassigned", immutable=False)
            db.add_all([msg_own, msg_foreign, msg_unassigned])
            db.flush()

            att_own = Attachment(
                request_id=own.id,
                message_id=msg_own.id,
                file_name="own.pdf",
                mime_type="application/pdf",
                size_bytes=100,
                s3_key=f"requests/{own.id}/own.pdf",
                immutable=False,
            )
            att_foreign = Attachment(
                request_id=foreign.id,
                message_id=msg_foreign.id,
                file_name="foreign.pdf",
                mime_type="application/pdf",
                size_bytes=100,
                s3_key=f"requests/{foreign.id}/foreign.pdf",
                immutable=False,
            )
            att_unassigned = Attachment(
                request_id=unassigned.id,
                message_id=msg_unassigned.id,
                file_name="unassigned.pdf",
                mime_type="application/pdf",
                size_bytes=100,
                s3_key=f"requests/{unassigned.id}/unassigned.pdf",
                immutable=False,
            )
            db.add_all([att_own, att_foreign, att_unassigned])
            db.commit()

            own_id = str(own.id)
            unassigned_id = str(unassigned.id)
            foreign_msg_id = str(msg_foreign.id)
            foreign_att_id = str(att_foreign.id)

        headers = self._auth_headers("LAWYER", email="lawyer.msg.self@example.com", sub=self_id)

        messages_query = self.client.post(
            "/api/admin/crud/messages/query",
            headers=headers,
            json={"filters": [], "sort": [{"field": "created_at", "dir": "asc"}], "page": {"limit": 50, "offset": 0}},
        )
        self.assertEqual(messages_query.status_code, 200)
        message_request_ids = {str(row.get("request_id")) for row in (messages_query.json().get("rows") or [])}
        self.assertEqual(message_request_ids, {own_id, unassigned_id})

        attachments_query = self.client.post(
            "/api/admin/crud/attachments/query",
            headers=headers,
            json={"filters": [], "sort": [{"field": "created_at", "dir": "asc"}], "page": {"limit": 50, "offset": 0}},
        )
        self.assertEqual(attachments_query.status_code, 200)
        attachment_request_ids = {str(row.get("request_id")) for row in (attachments_query.json().get("rows") or [])}
        self.assertEqual(attachment_request_ids, {own_id, unassigned_id})

        foreign_message_get = self.client.get(f"/api/admin/crud/messages/{foreign_msg_id}", headers=headers)
        self.assertEqual(foreign_message_get.status_code, 403)
        foreign_attachment_get = self.client.get(f"/api/admin/crud/attachments/{foreign_att_id}", headers=headers)
        self.assertEqual(foreign_attachment_get.status_code, 403)

        created_message = self.client.post(
            "/api/admin/crud/messages",
            headers=headers,
            json={"request_id": own_id, "body": "Ответ юриста"},
        )
        self.assertEqual(created_message.status_code, 201)
        self.assertEqual(created_message.json().get("author_type"), "LAWYER")
        self.assertEqual(created_message.json().get("request_id"), own_id)

        blocked_unassigned_create = self.client.post(
            "/api/admin/crud/messages",
            headers=headers,
            json={"request_id": unassigned_id, "body": "Попытка без назначения"},
        )
        self.assertEqual(blocked_unassigned_create.status_code, 403)

    def test_topic_status_flow_supports_branching_transitions(self):
        headers = self._auth_headers("ADMIN", email="root@example.com")
        with self.SessionLocal() as db:
            db.add_all(
                [
                    Topic(code="civil-branch", name="Гражданское (ветвление)", enabled=True, sort_order=1),
                    TopicStatusTransition(topic_code="civil-branch", from_status="NEW", to_status="IN_PROGRESS", enabled=True, sort_order=1),
                    TopicStatusTransition(topic_code="civil-branch", from_status="NEW", to_status="WAITING_CLIENT", enabled=True, sort_order=2),
                ]
            )
            req_in_progress = Request(
                track_number="TRK-BRANCH-1",
                client_name="Клиент 1",
                client_phone="+79991110021",
                topic_code="civil-branch",
                status_code="NEW",
                description="branch 1",
                extra_fields={},
            )
            req_waiting = Request(
                track_number="TRK-BRANCH-2",
                client_name="Клиент 2",
                client_phone="+79991110022",
                topic_code="civil-branch",
                status_code="NEW",
                description="branch 2",
                extra_fields={},
            )
            db.add_all([req_in_progress, req_waiting])
            db.commit()
            req_in_progress_id = str(req_in_progress.id)
            req_waiting_id = str(req_waiting.id)

        first_branch = self.client.patch(
            f"/api/admin/crud/requests/{req_in_progress_id}",
            headers=headers,
            json={"status_code": "IN_PROGRESS"},
        )
        self.assertEqual(first_branch.status_code, 200)

        second_branch = self.client.patch(
            f"/api/admin/crud/requests/{req_waiting_id}",
            headers=headers,
            json={"status_code": "WAITING_CLIENT"},
        )
        self.assertEqual(second_branch.status_code, 200)

    def test_admin_chat_service_endpoints_follow_rbac(self):
        with self.SessionLocal() as db:
            lawyer_self = AdminUser(
                role="LAWYER",
                name="Юрист Чат Свой",
                email="lawyer.chat.self@example.com",
                password_hash="hash",
                is_active=True,
            )
            lawyer_other = AdminUser(
                role="LAWYER",
                name="Юрист Чат Чужой",
                email="lawyer.chat.other@example.com",
                password_hash="hash",
                is_active=True,
            )
            db.add_all([lawyer_self, lawyer_other])
            db.flush()
            self_id = str(lawyer_self.id)
            other_id = str(lawyer_other.id)

            own = Request(
                track_number="TRK-CHAT-ADMIN-OWN",
                client_name="Клиент Свой",
                client_phone="+79990030001",
                status_code="IN_PROGRESS",
                description="own",
                extra_fields={},
                assigned_lawyer_id=self_id,
            )
            foreign = Request(
                track_number="TRK-CHAT-ADMIN-FOREIGN",
                client_name="Клиент Чужой",
                client_phone="+79990030002",
                status_code="IN_PROGRESS",
                description="foreign",
                extra_fields={},
                assigned_lawyer_id=other_id,
            )
            unassigned = Request(
                track_number="TRK-CHAT-ADMIN-UNASSIGNED",
                client_name="Клиент Без назначения",
                client_phone="+79990030003",
                status_code="NEW",
                description="unassigned",
                extra_fields={},
                assigned_lawyer_id=None,
            )
            db.add_all([own, foreign, unassigned])
            db.flush()
            db.add(Message(request_id=own.id, author_type="CLIENT", author_name="Клиент", body="start"))
            db.commit()
            own_id = str(own.id)
            foreign_id = str(foreign.id)
            unassigned_id = str(unassigned.id)

        lawyer_headers = self._auth_headers("LAWYER", email="lawyer.chat.self@example.com", sub=self_id)
        admin_headers = self._auth_headers("ADMIN", email="root@example.com")

        own_list = self.client.get(f"/api/admin/chat/requests/{own_id}/messages", headers=lawyer_headers)
        self.assertEqual(own_list.status_code, 200)
        self.assertEqual(own_list.json()["total"], 1)

        foreign_list = self.client.get(f"/api/admin/chat/requests/{foreign_id}/messages", headers=lawyer_headers)
        self.assertEqual(foreign_list.status_code, 403)

        own_create = self.client.post(
            f"/api/admin/chat/requests/{own_id}/messages",
            headers=lawyer_headers,
            json={"body": "Ответ из chat service"},
        )
        self.assertEqual(own_create.status_code, 201)
        self.assertEqual(own_create.json()["author_type"], "LAWYER")

        unassigned_create = self.client.post(
            f"/api/admin/chat/requests/{unassigned_id}/messages",
            headers=lawyer_headers,
            json={"body": "Нельзя в неназначенную"},
        )
        self.assertEqual(unassigned_create.status_code, 403)

        admin_create = self.client.post(
            f"/api/admin/chat/requests/{foreign_id}/messages",
            headers=admin_headers,
            json={"body": "Сообщение администратора"},
        )
        self.assertEqual(admin_create.status_code, 201)
        self.assertEqual(admin_create.json()["author_type"], "SYSTEM")

