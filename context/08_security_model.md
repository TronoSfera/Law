# Security Model Context

## Public
- OTP verification required
- JWT in httpOnly cookie (7 days)
- Rate limiting
- Protection from brute force

## Admin
- JWT bearer
- RBAC
- Audit log required

## Data Protection
- Immutable after status change
- All actions logged