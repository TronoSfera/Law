# File Storage Service Context

## Storage
- Self-hosted S3 (MinIO)
- Presigned PUT or multipart upload
- Store metadata in attachments table

## Rules
- Max 25MB per file
- Max 350MB per request
- Immutable after status change
- Download via presigned GET or proxy endpoint