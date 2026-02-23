# Public Requests Service Context

## Responsibilities
- Show landing page and accept new legal case requests
- Request base fields: full name, phone, topic, problem description
- Require OTP verification before request creation (phone confirmation)
- Generate and return unique `track_number`
- Allow client to reopen request by `track_number` and continue communication with lawyer
- Allow client to see status/history, upload requested files, and read/write chat messages
- Track unread updates at request level for both client and lawyer side
- Store extra fields as JSON from admin-configured topic form template

## Key Rules
- Phone is mandatory and must be OTP-verified for create flow
- Base request fields are mandatory (`client_name`, `client_phone`, `topic_code`, `description`)
- Topic-specific required fields are configured by ADMIN in `topic_required_fields`
- File size limit: 25MB per file
- Case size limit: 250MB total
- Public file interaction for now: download/open (no inline preview requirement)
- New message/file/status update sets request-level "has updates" marker for target side
- Opening request resets marker and counts as acknowledgment
- Internal lawyer rates are hidden from public API/UI
- Client can receive generated invoice documents when request enters billing status

## Security
- Rate limit by IP/phone/track_number
- No direct access without OTP verification
- After successful OTP verification, device keeps JWT cookie for 7 days
- Public create endpoint requires cookie `purpose=CREATE_REQUEST` with `sub=<phone>`
- Public view endpoint (`GET /api/public/requests/{track_number}`) requires cookie `purpose=VIEW_REQUEST` with `sub=<track_number>`

## Implemented Public Cabinet Endpoints (`P12`)
- `GET /api/public/requests/{track_number}`: карточка заявки
- `GET /api/public/requests/{track_number}/messages`: чат заявки
- `POST /api/public/requests/{track_number}/messages`: сообщение клиента
- `GET /api/public/requests/{track_number}/attachments`: список файлов заявки
- `GET /api/public/requests/{track_number}/history`: история смены статусов
- `GET /api/public/requests/{track_number}/timeline`: объединенная лента событий (статусы/сообщения/файлы)
- `GET /api/public/uploads/object/{attachment_id}`: открыть/скачать файл с проверкой доступа по `track_number`

## UI
- На лендинге добавлен блок «Кабинет клиента»:
- вход по `track_number` с OTP (`VIEW_REQUEST`) при отсутствии валидной 7-дневной cookie
- отображение статуса заявки, чата, файлов и таймлайна
- отправка сообщения клиентом и загрузка файла через public upload flow (`init` -> `PUT` -> `complete`)
