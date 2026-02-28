# Production deploy (ruakb.ru)

## Цель
Развернуть платформу на сервере `45.150.36.116` c HTTPS на `80/443` для домена `ruakb.ru`.

## Что добавлено
- `docker-compose.prod.yml` — production override:
  - добавлен edge proxy (`caddy`) на `80/443`
  - отключены внешние порты у внутренних сервисов
- `deploy/caddy/Caddyfile` — TLS (Let's Encrypt) + reverse proxy
- `scripts/ops/deploy_prod.sh` — запуск стека и миграций

## Предусловия
1. DNS:
   - `A ruakb.ru -> 45.150.36.116`
   - `A www.ruakb.ru -> 45.150.36.116` (опционально)
2. Открыты порты сервера:
   - `80/tcp`, `443/tcp`

## Запуск
```bash
cd /opt/law
./scripts/ops/deploy_prod.sh
```

## Проверка
```bash
curl -I http://ruakb.ru
curl -I https://ruakb.ru
curl -fsS https://ruakb.ru/health
curl -fsS https://ruakb.ru/chat-health
```

## Обновление
```bash
git pull
./scripts/ops/deploy_prod.sh
```

## Откат
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml down
# и вернуть предыдущий git tag/commit
```
