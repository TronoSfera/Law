from tests.admin.base import *  # noqa: F401,F403
from app.chat_main import app as chat_app
from app.db.session import get_db
from app.services.chat_presence import clear_presence_for_tests


class AdminLawyerChatTests(AdminUniversalCrudBase):
    def setUp(self):
        super().setUp()
        clear_presence_for_tests()
        def override_get_db():
            db = self.SessionLocal()
            try:
                yield db
            finally:
                db.close()
        chat_app.dependency_overrides[get_db] = override_get_db
        self.chat_client = TestClient(chat_app)

    def tearDown(self):
        self.chat_client.close()
        chat_app.dependency_overrides.clear()
        clear_presence_for_tests()
        super().tearDown()

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
            foreign_id = str(foreign.id)
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

        own_request_attachments = self.client.get(f"/api/admin/uploads/request-attachments/{own_id}", headers=headers)
        self.assertEqual(own_request_attachments.status_code, 200)
        self.assertEqual(len(own_request_attachments.json().get("rows") or []), 1)

        unassigned_request_attachments = self.client.get(f"/api/admin/uploads/request-attachments/{unassigned_id}", headers=headers)
        self.assertEqual(unassigned_request_attachments.status_code, 200)
        self.assertEqual(len(unassigned_request_attachments.json().get("rows") or []), 1)

        blocked_request_attachments = self.client.get(f"/api/admin/uploads/request-attachments/{foreign_id}", headers=headers)
        self.assertEqual(blocked_request_attachments.status_code, 403)

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

    def test_request_workspace_endpoint_returns_compound_payload_with_role_scope(self):
        with self.SessionLocal() as db:
            lawyer_self = AdminUser(
                role="LAWYER",
                name="Юрист Workspace",
                email="lawyer.workspace@example.com",
                password_hash="hash",
                is_active=True,
            )
            lawyer_other = AdminUser(
                role="LAWYER",
                name="Юрист Чужой Workspace",
                email="lawyer.workspace.other@example.com",
                password_hash="hash",
                is_active=True,
            )
            db.add_all([lawyer_self, lawyer_other])
            db.flush()
            self_id = str(lawyer_self.id)
            other_id = str(lawyer_other.id)

            own = Request(
                track_number="TRK-WORKSPACE-OWN",
                client_name="Клиент Workspace",
                client_phone="+79990010111",
                status_code="IN_PROGRESS",
                description="workspace own",
                extra_fields={},
                assigned_lawyer_id=self_id,
            )
            foreign = Request(
                track_number="TRK-WORKSPACE-FOREIGN",
                client_name="Клиент Workspace Foreign",
                client_phone="+79990010112",
                status_code="IN_PROGRESS",
                description="workspace foreign",
                extra_fields={},
                assigned_lawyer_id=other_id,
            )
            db.add_all([own, foreign])
            db.flush()
            own_id = str(own.id)
            foreign_id = str(foreign.id)

            for index in range(55):
                db.add(
                    Message(
                        request_id=own.id,
                        author_type="CLIENT",
                        author_name="Клиент",
                        body=f"workspace msg {index}",
                    )
                )
            db.add(
                Attachment(
                    request_id=own.id,
                    file_name="workspace.pdf",
                    mime_type="application/pdf",
                    size_bytes=64,
                    s3_key=f"requests/{own.id}/workspace.pdf",
                    immutable=False,
                )
            )
            db.commit()

        headers = self._auth_headers("LAWYER", email="lawyer.workspace@example.com", sub=self_id)
        own_workspace = self.client.get(f"/api/admin/requests/{own_id}/workspace", headers=headers)
        self.assertEqual(own_workspace.status_code, 200)
        payload = own_workspace.json()
        self.assertEqual(str((payload.get("request") or {}).get("id")), own_id)
        self.assertEqual(len(payload.get("messages") or []), 50)
        self.assertTrue(bool(payload.get("messages_has_more")))
        self.assertEqual(int(payload.get("messages_total") or 0), 55)
        self.assertEqual(int(payload.get("messages_loaded_count") or 0), 50)
        self.assertEqual(len(payload.get("attachments") or []), 1)
        self.assertIn("status_route", payload)
        self.assertIn("finance_summary", payload)

        older_messages = self.chat_client.get(
            f"/api/admin/chat/requests/{own_id}/messages-window",
            headers=headers,
            params={"before_count": 50, "limit": 10},
        )
        self.assertEqual(older_messages.status_code, 200)
        older_payload = older_messages.json()
        self.assertEqual(len(older_payload.get("rows") or []), 5)
        self.assertFalse(bool(older_payload.get("has_more")))
        self.assertEqual(int(older_payload.get("loaded_count") or 0), 55)

        foreign_workspace = self.client.get(f"/api/admin/requests/{foreign_id}/workspace", headers=headers)
        self.assertEqual(foreign_workspace.status_code, 403)

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

        own_list = self.chat_client.get(f"/api/admin/chat/requests/{own_id}/messages", headers=lawyer_headers)
        self.assertEqual(own_list.status_code, 200)
        self.assertEqual(own_list.json()["total"], 1)

        foreign_list = self.chat_client.get(f"/api/admin/chat/requests/{foreign_id}/messages", headers=lawyer_headers)
        self.assertEqual(foreign_list.status_code, 403)

        own_create = self.chat_client.post(
            f"/api/admin/chat/requests/{own_id}/messages",
            headers=lawyer_headers,
            json={"body": "Ответ из chat service"},
        )
        self.assertEqual(own_create.status_code, 201)
        self.assertEqual(own_create.json()["author_type"], "LAWYER")

        unassigned_create = self.chat_client.post(
            f"/api/admin/chat/requests/{unassigned_id}/messages",
            headers=lawyer_headers,
            json={"body": "Нельзя в неназначенную"},
        )
        self.assertEqual(unassigned_create.status_code, 403)

        admin_create = self.chat_client.post(
            f"/api/admin/chat/requests/{foreign_id}/messages",
            headers=admin_headers,
            json={"body": "Сообщение администратора"},
        )
        self.assertEqual(admin_create.status_code, 201)
        self.assertEqual(admin_create.json()["author_type"], "SYSTEM")

    def test_admin_chat_live_and_typing_endpoints_follow_rbac(self):
        with self.SessionLocal() as db:
            lawyer_self = AdminUser(
                role="LAWYER",
                name="Юрист Live Свой",
                email="lawyer.live.self@example.com",
                password_hash="hash",
                is_active=True,
            )
            lawyer_other = AdminUser(
                role="LAWYER",
                name="Юрист Live Чужой",
                email="lawyer.live.other@example.com",
                password_hash="hash",
                is_active=True,
            )
            db.add_all([lawyer_self, lawyer_other])
            db.flush()
            self_id = str(lawyer_self.id)
            other_id = str(lawyer_other.id)

            own = Request(
                track_number="TRK-CHAT-LIVE-OWN",
                client_name="Клиент Live Свой",
                client_phone="+79995550101",
                status_code="IN_PROGRESS",
                description="own",
                extra_fields={},
                assigned_lawyer_id=self_id,
            )
            foreign = Request(
                track_number="TRK-CHAT-LIVE-FOREIGN",
                client_name="Клиент Live Чужой",
                client_phone="+79995550102",
                status_code="IN_PROGRESS",
                description="foreign",
                extra_fields={},
                assigned_lawyer_id=other_id,
            )
            unassigned = Request(
                track_number="TRK-CHAT-LIVE-UNASSIGNED",
                client_name="Клиент Live Без назначения",
                client_phone="+79995550103",
                status_code="NEW",
                description="unassigned",
                extra_fields={},
                assigned_lawyer_id=None,
            )
            db.add_all([own, foreign, unassigned])
            db.flush()
            db.add(Message(request_id=own.id, author_type="CLIENT", author_name="Клиент", body="live start"))
            db.commit()
            own_id = str(own.id)
            foreign_id = str(foreign.id)
            unassigned_id = str(unassigned.id)

        lawyer_headers = self._auth_headers("LAWYER", email="lawyer.live.self@example.com", sub=self_id)
        admin_headers = self._auth_headers("ADMIN", email="root@example.com")

        own_live = self.chat_client.get(f"/api/admin/chat/requests/{own_id}/live", headers=lawyer_headers)
        self.assertEqual(own_live.status_code, 200)
        own_cursor = str(own_live.json().get("cursor") or "")
        own_live_no_delta = self.chat_client.get(
            f"/api/admin/chat/requests/{own_id}/live",
            headers=lawyer_headers,
            params={"cursor": own_cursor},
        )
        self.assertEqual(own_live_no_delta.status_code, 200)
        self.assertFalse(bool(own_live_no_delta.json().get("has_updates")))

        with self.SessionLocal() as db:
            own_req = db.get(Request, UUID(own_id))
            self.assertIsNotNone(own_req)
            live_message = Message(request_id=own_req.id, author_type="CLIENT", author_name="Клиент", body="live delta", immutable=False)
            db.add(live_message)
            db.flush()
            db.add(
                Attachment(
                    request_id=own_req.id,
                    message_id=live_message.id,
                    file_name="live-delta.pdf",
                    mime_type="application/pdf",
                    size_bytes=321,
                    s3_key=f"requests/{own_req.id}/live-delta.pdf",
                    immutable=False,
                )
            )
            db.commit()

        own_live_delta = self.chat_client.get(
            f"/api/admin/chat/requests/{own_id}/live",
            headers=lawyer_headers,
            params={"cursor": own_cursor},
        )
        self.assertEqual(own_live_delta.status_code, 200)
        self.assertTrue(bool(own_live_delta.json().get("has_updates")))
        self.assertEqual(len(own_live_delta.json().get("messages") or []), 1)
        self.assertEqual(len(own_live_delta.json().get("attachments") or []), 1)

        foreign_live = self.chat_client.get(f"/api/admin/chat/requests/{foreign_id}/live", headers=lawyer_headers)
        self.assertEqual(foreign_live.status_code, 403)

        own_typing = self.chat_client.post(
            f"/api/admin/chat/requests/{own_id}/typing",
            headers=lawyer_headers,
            json={"typing": True},
        )
        self.assertEqual(own_typing.status_code, 200)
        self.assertTrue(bool(own_typing.json().get("typing")))

        unassigned_typing = self.chat_client.post(
            f"/api/admin/chat/requests/{unassigned_id}/typing",
            headers=lawyer_headers,
            json={"typing": True},
        )
        self.assertEqual(unassigned_typing.status_code, 403)

        admin_typing = self.chat_client.post(
            f"/api/admin/chat/requests/{own_id}/typing",
            headers=admin_headers,
            json={"typing": True},
        )
        self.assertEqual(admin_typing.status_code, 200)
        self.assertTrue(bool(admin_typing.json().get("typing")))

        own_live_with_typing = self.chat_client.get(f"/api/admin/chat/requests/{own_id}/live", headers=lawyer_headers)
        self.assertEqual(own_live_with_typing.status_code, 200)
        typing_rows = own_live_with_typing.json().get("typing") or []
        self.assertTrue(any(str(item.get("actor_role")) == "ADMIN" for item in typing_rows))

    def test_admin_chat_marks_delivery_and_read_receipts_for_client_messages(self):
        with self.SessionLocal() as db:
            lawyer_self = AdminUser(
                role="LAWYER",
                name="Юрист Receipt",
                email="lawyer.receipt@example.com",
                password_hash="hash",
                is_active=True,
            )
            db.add(lawyer_self)
            db.flush()
            self_id = str(lawyer_self.id)

            own = Request(
                track_number="TRK-CHAT-RECEIPTS-STAFF",
                client_name="Клиент Receipt",
                client_phone="+79995550777",
                status_code="IN_PROGRESS",
                description="staff receipts",
                extra_fields={},
                assigned_lawyer_id=self_id,
            )
            db.add(own)
            db.flush()
            msg = Message(
                request_id=own.id,
                author_type="CLIENT",
                author_name="Клиент",
                body="Сообщение клиента",
            )
            db.add(msg)
            db.commit()
            own_id = str(own.id)
            message_id = msg.id

        lawyer_headers = self._auth_headers("LAWYER", email="lawyer.receipt@example.com", sub=self_id)

        live = self.chat_client.get(f"/api/admin/chat/requests/{own_id}/live", headers=lawyer_headers)
        self.assertEqual(live.status_code, 200)

        with self.SessionLocal() as db:
            delivered_row = db.get(Message, message_id)
            self.assertIsNotNone(delivered_row)
            self.assertIsNotNone(delivered_row.delivered_to_staff_at)
            self.assertIsNone(delivered_row.read_by_staff_at)

        listed = self.chat_client.get(f"/api/admin/chat/requests/{own_id}/messages", headers=lawyer_headers)
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(int(listed.json().get("total") or 0), 1)
        first = (listed.json().get("rows") or [{}])[0]
        self.assertTrue(bool(first.get("delivered_to_staff_at")))
        self.assertTrue(bool(first.get("read_by_staff_at")))

        with self.SessionLocal() as db:
            read_row = db.get(Message, message_id)
            self.assertIsNotNone(read_row)
            self.assertIsNotNone(read_row.read_by_staff_at)

    def test_admin_live_detects_client_filled_request_data_updates(self):
        with self.SessionLocal() as db:
            now = datetime.now(timezone.utc)
            lawyer_self = AdminUser(
                role="LAWYER",
                name="Юрист Data Live",
                email="lawyer.data.live@example.com",
                password_hash="hash",
                is_active=True,
            )
            db.add(lawyer_self)
            db.flush()
            self_id = str(lawyer_self.id)

            own = Request(
                track_number="TRK-CHAT-LIVE-DATA",
                client_name="Клиент Data Live",
                client_phone="+79995550111",
                status_code="IN_PROGRESS",
                description="own data live",
                extra_fields={},
                assigned_lawyer_id=self_id,
            )
            db.add(own)
            db.flush()
            msg = Message(
                request_id=own.id,
                author_type="LAWYER",
                author_name="Юрист",
                body="Запрос",
                created_at=now - timedelta(minutes=2),
                updated_at=now - timedelta(minutes=2),
            )
            db.add(msg)
            db.flush()
            req_row = RequestDataRequirement(
                request_id=own.id,
                request_message_id=msg.id,
                key="inn",
                label="ИНН",
                field_type="text",
                required=True,
                sort_order=0,
            )
            db.add(req_row)
            db.commit()
            own_id = str(own.id)
            message_id = str(msg.id)
            req_row_id = str(req_row.id)

        lawyer_headers = self._auth_headers("LAWYER", email="lawyer.data.live@example.com", sub=self_id)
        own_live = self.chat_client.get(f"/api/admin/chat/requests/{own_id}/live", headers=lawyer_headers)
        self.assertEqual(own_live.status_code, 200)
        own_cursor = str(own_live.json().get("cursor") or "")
        self.assertTrue(bool(own_cursor))

        own_live_no_delta = self.chat_client.get(
            f"/api/admin/chat/requests/{own_id}/live",
            headers=lawyer_headers,
            params={"cursor": own_cursor},
        )
        self.assertEqual(own_live_no_delta.status_code, 200)
        self.assertFalse(bool(own_live_no_delta.json().get("has_updates")))

        public_token = create_jwt(
            {"sub": "TRK-CHAT-LIVE-DATA", "purpose": "VIEW_REQUEST"},
            settings.PUBLIC_JWT_SECRET,
            timedelta(minutes=30),
        )
        public_cookies = {settings.PUBLIC_COOKIE_NAME: public_token}
        save_values = self.chat_client.post(
            f"/api/public/chat/requests/TRK-CHAT-LIVE-DATA/data-requests/{message_id}",
            cookies=public_cookies,
            json={"items": [{"id": req_row_id, "value_text": "7701234567"}]},
        )
        self.assertEqual(save_values.status_code, 200)
        self.assertEqual(int(save_values.json().get("updated") or 0), 1)

        own_live_after_fill = self.chat_client.get(
            f"/api/admin/chat/requests/{own_id}/live",
            headers=lawyer_headers,
            params={"cursor": own_cursor},
        )
        self.assertEqual(own_live_after_fill.status_code, 200)
        self.assertTrue(bool(own_live_after_fill.json().get("has_updates")))
