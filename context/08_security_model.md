# Security Model Context

## Public
- OTP verification required for request creation and request access
- JWT in httpOnly cookie (7 days)
- Rate limiting by IP + phone + track number (OTP send/verify)
- Protection from brute force

## Admin
- JWT bearer
- RBAC
- Audit log required

## Data Protection
- Messages and attachments from previous statuses are immutable after status change
- All actions logged
- HTTP hardening headers and request correlation (`X-Request-ID`) are added at middleware level

## S3 & Personal Data (baseline)
- Files in S3 are treated as personal data (PII/ПДн)
- Security baseline for implementation:
- Access model:
- strict RBAC/least-privilege for object read/write
- scoped object keys and server-side authorization checks on every download
- no direct anonymous public bucket/object access
- Cryptography:
- encryption in transit (TLS) for all client<->API and API<->S3 paths
- encryption at rest for object storage and backups
- key rotation policy and secret management (no static secrets in code)
- Audit & accountability:
- immutable security audit trail for file operations (who, when, what object, action, result)
- alerting on suspicious access patterns (mass download, repeated denied attempts)
- periodic access review reports
- Data lifecycle:
- retention rules by data category/status
- controlled deletion and archival procedures
- backup restore testing and disaster recovery runbook
- Compliance posture:
- map controls to РФ requirements for personal data protection and internal cyber policies
- formalize security checklist for release gates (threat review + access review + logging verification)

## Implemented Security Audit (`P26`)
- Added dedicated table `security_audit_log` (migration `0014_security_audit_log`) with fields:
- actor role/subject/ip, action, scope, object key, request/attachment IDs, allow/deny result, reason, details.
- File operations now write security events:
- `UPLOAD_INIT`, `UPLOAD_COMPLETE`, `DOWNLOAD_OBJECT` for admin and public upload/download flows.
- Denied attempts are logged too (including RBAC denials and invalid object access).
- RBAC hardening:
- universal CRUD for `security_audit_log` is read-only for ADMIN (`query`, `read`), no update/delete to preserve immutability.
- Suspicious activity signal:
- repeated denied `DOWNLOAD_OBJECT` events per subject/IP in short window emit server warning log.
