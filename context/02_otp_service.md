# OTP Service Context

## Purpose
Secure public access for:
- Creating request (phone confirmation is mandatory)
- Viewing request status/chat/files by `track_number`

## Flow
1. Send OTP (`CREATE_REQUEST` / `VIEW_REQUEST`)
2. Store hashed code
3. Expire in 10 minutes
4. Max attempts limit
5. On verify -> issue public JWT cookie (7 days, same device)
6. If valid JWT exists on device, do not resend OTP until cookie expiration

## Current Dev Mode
- OTP code is printed to backend console log (`[OTP MOCK] ... code=XXXXXX`)
- SMS provider call is mocked (`sms_response.provider = mock_sms`)
- `CREATE_REQUEST` verification issues cookie with `purpose=CREATE_REQUEST` and `sub=<phone>`
- Request creation endpoint requires that cookie and then switches cookie to `purpose=VIEW_REQUEST`, `sub=<track_number>`
- `VIEW_REQUEST` verification issues cookie with `purpose=VIEW_REQUEST` and `sub=<track_number>`

## Anti-abuse
- Rate limit (Redis)
- Cooldown between sends
- Lock after N failed attempts
- Throttling by phone + track number + IP
