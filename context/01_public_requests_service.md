# Public Requests Service Context

## Responsibilities
- Accept new legal case requests
- Generate track_number
- Store configurable form fields (form_fields table)
- Trigger OTP flow
- Allow client to view request (after OTP verify)

## Key Rules
- Phone is mandatory
- Extra fields stored as JSON (validated against form_fields config)
- File size limit: 25MB per file
- Case size limit: 350MB total

## Security
- Rate limit by IP/phone/track_number
- No direct access without OTP verification