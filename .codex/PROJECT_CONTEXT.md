## Repository Context Map

### Entry Points
- `app/main.py`: main backend API (`/api/public`, `/api/admin`).
- `app/chat_main.py`: dedicated chat API service.
- `app/email_main.py`: email service.
- `docker-compose.yml`: local service topology.

### Main Backend Areas
- `app/api/public/`: public/client cabinet endpoints.
- `app/api/admin/`: admin and lawyer endpoints.
- `app/api/admin/requests_modules/kanban.py`: kanban aggregation and filters.
- `app/api/admin/crud_modules/`: generic CRUD/query layer.
- `app/services/`: shared domain services, including chat serialization/security.
  - `app/services/chat_crypto.py`: versioned chat crypto (`v1/v2` backward-compatible read, `v3` per-chat AEAD write path).
  - `app/services/chat_secure_service.py`: chat paging, explicit decrypt, message body batches, live delta.
- `app/models/`: SQLAlchemy models.
  - `app/models/message.py`: plaintext no longer auto-decrypts from ORM; chat body encryption happens on flush, read decrypt is explicit.
- `app/core/`: config, middleware, security hardening.

### Frontend Areas
- `app/web/admin/`: admin/lawyer UI source modules.
- `app/web/client.jsx`: client cabinet entry.
- `app/web/admin.js`, `app/web/client.js`: built bundles.

### Tests
- `tests/test_http_hardening.py`: middleware/security headers.
- `tests/test_public_cabinet.py`: client cabinet flows.
- `tests/admin/test_lawyer_chat.py`: admin/lawyer chat flows.
- `tests/test_migrations.py`: migration coverage.

### High-Risk Zones
- Request workspace loading: admin `app/web/admin/hooks/useRequestWorkspace.js`, client `app/web/client.jsx`.
- Kanban performance: `app/api/admin/requests_modules/kanban.py`.
- Generic query endpoints used by request modal: `app/api/admin/crud_modules/service.py`, `app/api/admin/invoices.py`.
- Chat serialization and live updates: `app/services/chat_secure_service.py`, public/admin chat routers.
- Chat crypto and migration safety: `app/services/chat_crypto.py`, `app/scripts/reencrypt_with_active_kid.py`, `tests/test_crypto_kid_rotation.py`, `tests/test_reencrypt_with_active_kid.py`.
