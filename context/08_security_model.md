# Security Model Context

## Public
- OTP verification required for request creation and request access
- JWT in httpOnly cookie (7 days)
- Rate limiting
- Protection from brute force

## Admin
- JWT bearer
- RBAC
- Audit log required

## Data Protection
- Messages and attachments from previous statuses are immutable after status change
- All actions logged

## S3 & Personal Data (planned hardening)
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
