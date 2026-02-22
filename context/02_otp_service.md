# OTP Service Context

## Purpose
Secure access for:
- Creating request
- Viewing request

## Flow
1. Send OTP (CREATE_REQUEST / VIEW_REQUEST)
2. Store hashed code
3. Expire in 10 minutes
4. Max attempts limit
5. On verify -> issue public JWT cookie (7 days)

## Anti-abuse
- Rate limit (Redis)
- Cooldown between sends
- Lock after N failed attempts