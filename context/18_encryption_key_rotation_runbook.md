# Runbook: Ротация ключей шифрования (KID)

Дата: 02.03.2026  
Статус: `активен`

## Цель
Безопасная ротация ключей шифрования для:
- реквизитов счетов (`invoices.payer_details_encrypted`),
- TOTP-секретов администраторов (`admin_users.totp_secret_encrypted`),
- сообщений чата (`messages.body`).

## Формат ключей
- `DATA_ENCRYPTION_ACTIVE_KID=<kid>`
- `DATA_ENCRYPTION_KEYS=<kid1>=<secret1>,<kid2>=<secret2>`
- `CHAT_ENCRYPTION_ACTIVE_KID=<kid>`
- `CHAT_ENCRYPTION_KEYS=<kid1>=<secret1>,<kid2>=<secret2>`

Примечание: старые ключи удалять только после полной перешифровки и верификации.

## Порядок ротации
1. Добавить новый KID в `.env` и переключить активный KID:
```bash
make rotate-encryption-kid
```

2. Перезапустить сервисы с новым env:
```bash
docker compose up -d --build backend chat-service worker beat
```

3. Выполнить dry-run перешифровки:
```bash
docker compose exec -T backend python -m app.scripts.reencrypt_with_active_kid
```

4. Выполнить apply-перешифровку:
```bash
docker compose exec -T backend python -m app.scripts.reencrypt_with_active_kid --apply
```

5. Проверить регрессию и health:
```bash
docker compose exec -T backend python -m unittest tests.test_crypto_kid_rotation tests.test_invoices tests.test_public_cabinet -v
docker compose ps
curl -fsS http://localhost:8081/health
curl -fsS http://localhost:8081/chat-health
```

6. После периода наблюдения удалить старый KID из `*_ENCRYPTION_KEYS`.

## Rollback
- Вернуть предыдущий `.env` (где активен старый KID),
- перезапустить `backend/chat-service/worker/beat`,
- при необходимости повторно выполнить перешифровку под старый KID.

## Критерии завершения
- Новые записи шифруются с новым KID.
- Исторические записи успешно читаются и перешифрованы.
- Автотесты и health-check зелёные.
