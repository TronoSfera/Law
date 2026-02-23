# File Storage Service Context

## Storage
- Self-hosted S3 (MinIO)
- Presigned PUT or multipart upload
- Store metadata in `attachments` table

## Rules
- Max 25MB per file
- Max 250MB per request
- Attachments created in previous statuses become immutable after status change
- Current UX target: download/open file (no mandatory inline preview yet)
- Download via presigned GET or proxy endpoint

## Implemented Enforcement (`P17`)
- Server-side limit checks in both public/admin upload flows:
- `init`: checks requested size and current request total
- `complete`: re-checks actual object size from S3 `head_object` and request total
- Object key scope validation:
- public attachment upload accepts only keys under `requests/{request_id}/...`
- admin request attachment upload accepts only keys under `requests/{request_id}/...`
- admin avatar upload accepts only keys under `avatars/{user_id}/...`
- Download access guard (`/api/admin/uploads/object/{key}`):
- `ADMIN`: full access
- `LAWYER`: only own avatar and files from own/unassigned requests

## Planned Security Audit (`P27`)
- Security event log for every file operation:
- upload init/complete
- download/open
- denied access attempts
- Logging fields: actor, role, IP/device, object key, request_id, outcome, timestamp
- Add periodic integrity/security checks for object metadata and access anomalies
