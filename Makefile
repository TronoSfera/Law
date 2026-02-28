.PHONY: \
	help \
	local-up local-down local-logs local-migrate local-test local-seed \
	prod-up prod-down prod-logs prod-ps prod-migrate \
	prod-cert-init prod-cert-renew \
	check-prod-files check-cert-files \
	run migrate test seed-quotes

DOMAIN ?= ruakb.ru
WWW_DOMAIN ?= www.ruakb.ru
LETSENCRYPT_EMAIL ?= admin@ruakb.ru

LOCAL_COMPOSE = docker compose -f docker-compose.yml -f docker-compose.local.yml
PROD_COMPOSE = docker compose -f docker-compose.yml -f docker-compose.prod.nginx.yml
CERT_COMPOSE = docker compose -f docker-compose.yml -f docker-compose.prod.nginx.yml -f docker-compose.prod.cert.yml

help:
	@echo "Targets:"
	@echo "  local-up          - Start local stack"
	@echo "  local-down        - Stop local stack"
	@echo "  local-logs        - Tail local logs"
	@echo "  local-migrate     - Apply migrations (local)"
	@echo "  local-test        - Run backend tests (local)"
	@echo "  local-seed        - Seed quotes (local)"
	@echo "  prod-up           - Start production stack (nginx 80/443 + TLS certs already issued)"
	@echo "  prod-down         - Stop production stack"
	@echo "  prod-logs         - Tail production logs"
	@echo "  prod-ps           - Show production services"
	@echo "  prod-migrate      - Apply migrations (prod)"
	@echo "  prod-cert-init    - Initial Let's Encrypt issue (nginx only 80 during bootstrap)"
	@echo "  prod-cert-renew   - Renew existing certificates"

local-up:
	$(LOCAL_COMPOSE) up -d --build

local-down:
	$(LOCAL_COMPOSE) down

local-logs:
	$(LOCAL_COMPOSE) logs -f --tail=200

local-migrate:
	$(LOCAL_COMPOSE) exec -T backend alembic upgrade head

local-test:
	$(LOCAL_COMPOSE) exec -T backend python -m unittest discover -s tests -p "test_*.py" -v

local-seed:
	$(LOCAL_COMPOSE) exec -T backend python -m app.scripts.upsert_quotes

check-prod-files:
	@test -f docker-compose.prod.nginx.yml || (echo "[ERROR] Missing docker-compose.prod.nginx.yml. Run: git pull"; exit 1)

check-cert-files: check-prod-files
	@test -f docker-compose.prod.cert.yml || (echo "[ERROR] Missing docker-compose.prod.cert.yml. Run: git pull"; exit 1)
	@test -f deploy/nginx/edge-http-only.conf || (echo "[ERROR] Missing deploy/nginx/edge-http-only.conf. Run: git pull"; exit 1)
	@test -f deploy/nginx/edge-https.conf || (echo "[ERROR] Missing deploy/nginx/edge-https.conf. Run: git pull"; exit 1)

prod-up: check-prod-files
	$(PROD_COMPOSE) up -d --build --force-recreate --remove-orphans
	$(PROD_COMPOSE) exec -T backend alembic upgrade head

prod-down: check-prod-files
	$(PROD_COMPOSE) down

prod-logs: check-prod-files
	$(PROD_COMPOSE) logs -f --tail=200

prod-ps: check-prod-files
	$(PROD_COMPOSE) ps

prod-migrate: check-prod-files
	$(PROD_COMPOSE) exec -T backend alembic upgrade head

# Initial certificate bootstrap:
# 1) Start stack with edge nginx on port 80 only.
# 2) Obtain cert via certbot webroot challenge.
# 3) Restart stack in regular prod mode (80/443).
prod-cert-init: check-cert-files
	$(CERT_COMPOSE) up -d --build db redis minio backend chat-service worker beat frontend edge
	$(CERT_COMPOSE) run --rm certbot certonly --webroot -w /var/www/certbot --email "$(LETSENCRYPT_EMAIL)" --agree-tos --no-eff-email -d "$(DOMAIN)" -d "$(WWW_DOMAIN)"
	$(PROD_COMPOSE) up -d --build edge
	$(PROD_COMPOSE) exec -T backend alembic upgrade head

prod-cert-renew: check-prod-files
	$(PROD_COMPOSE) run --rm certbot renew --webroot -w /var/www/certbot
	$(PROD_COMPOSE) exec -T edge nginx -s reload

# Backward-compatible aliases
run: local-up
migrate: local-migrate
test: local-test
seed-quotes: local-seed
