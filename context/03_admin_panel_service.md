# Admin Panel Service Context

## Roles
- ADMIN: full CRUD + config + SLA + quotes
- LAWYER: work with assigned requests only

## Core Features
- Universal table with filters (= != > < >= <= ~)
- Universal record modal (meta-driven)
- Manual editing of any table
- AuditLog for any CREATE/UPDATE/DELETE

## Status Logic
- On any status change:
  - All previous messages immutable
  - All previous attachments immutable
  - Add status_history record