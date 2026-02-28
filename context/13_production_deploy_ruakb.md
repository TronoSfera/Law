# Production deploy (ruakb.ru)

## Цель
Развернуть платформу на сервере `45.150.36.116` c HTTPS на `80/443` для домена `ruakb.ru`.

## Что добавлено
- `docker-compose.local.yml` — локальные публикации портов (`8081/8080/8002/5432/6379/9000/9001`)
- `docker-compose.prod.nginx.yml` — production override:
  - edge nginx на `80/443`
  - certbot volume для сертификатов
  - отключены внешние порты у внутренних сервисов
- `docker-compose.prod.cert.yml` — bootstrap override для первичного выпуска сертификата
  - edge nginx только на `80`
- `deploy/nginx/edge-http-only.conf` — nginx конфиг только под `80` + ACME challenge
- `deploy/nginx/edge-https.conf` — nginx конфиг для `80/443` + TLS + reverse proxy
- `Makefile` — цели локального и production запуска

## Предусловия
1. DNS:
   - `A ruakb.ru -> 45.150.36.116`
   - `A www.ruakb.ru -> 45.150.36.116` (опционально)
2. Открыты порты сервера:
   - `80/tcp`, `443/tcp`

## Первичный выпуск сертификата (nginx только 80)
```bash
cd /opt/law
make prod-cert-init LETSENCRYPT_EMAIL=you@example.com DOMAIN=ruakb.ru WWW_DOMAIN=www.ruakb.ru
```

## Запуск production
```bash
cd /opt/law
make prod-up
```

## Проверка
```bash
curl -I http://ruakb.ru
curl -I https://ruakb.ru
curl -fsS https://ruakb.ru/health
curl -fsS https://ruakb.ru/chat-health
ss -lntp | egrep ':(80|443|5432|6379|8002|8081|9000|9001)\b'
```

## Обновление
```bash
git pull
make prod-up
```

## Обновление сертификата
```bash
make prod-cert-renew
```

## Откат
```bash
make prod-down
# и вернуть предыдущий git tag/commit
```
