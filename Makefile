.PHONY: \
	help \
	local-up local-down local-logs local-migrate local-test local-seed local-seed-statuses local-seed-catalog \
	local-reencrypt-active-kid \
	prod-up prod-down prod-logs prod-ps prod-migrate \
	prod-seed-statuses prod-seed-catalog \
	prod-secrets-generate prod-secrets-apply prod-secrets-generate-env prod-secrets-apply-env \
	prod-minio-tls-init incident-checklist rotate-encryption-kid reencrypt-active-kid prod-reencrypt-active-kid \
	security-smoke prod-security-audit prod-security-scheduler-up prod-security-scheduler-logs \
	prod-cert-init prod-cert-renew \
	check-prod-files check-cert-files \
	run migrate test seed-quotes

DOMAIN ?= ruakb.ru
WWW_DOMAIN ?= www.ruakb.ru
SECOND_DOMAIN ?= ruakb.online
SECOND_WWW_DOMAIN ?= www.ruakb.online
LETSENCRYPT_EMAIL ?= admin@ruakb.ru
AUTO_CERT_INIT ?= 0
SKIP_LOCAL_SMOKE ?= 0
LOCAL_SMOKE_BASE_URL ?= https://127.0.0.1
LOCAL_SMOKE_CANDIDATES ?= $(LOCAL_SMOKE_BASE_URL),https://localhost,http://127.0.0.1,http://localhost
LOCAL_SMOKE_SKIP_DOCKER_CHECKS ?= 1
CONFIRM_TOKEN ?= ROTATE-PROD-SECRETS
CERTBOT_DOMAINS = -d "$(DOMAIN)" -d "$(WWW_DOMAIN)" $(if $(strip $(SECOND_DOMAIN)),-d "$(SECOND_DOMAIN)") $(if $(strip $(SECOND_WWW_DOMAIN)),-d "$(SECOND_WWW_DOMAIN)")

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
	@echo "  local-seed-statuses - Seed legal flow statuses (local)"
	@echo "  local-seed-catalog  - Seed quotes + legal flow statuses (local)"
	@echo "  local-reencrypt-active-kid - Re-encrypt historical chat/invoice/admin secrets using active KID (local)"
	@echo "  prod-up           - Start production stack (nginx 80/443 + TLS certs already issued)"
	@echo "  prod-down         - Stop production stack"
	@echo "  prod-logs         - Tail production logs"
	@echo "  prod-ps           - Show production services"
	@echo "  prod-migrate      - Apply migrations (prod)"
	@echo "  prod-seed-statuses - Seed legal flow statuses (prod)"
	@echo "  prod-seed-catalog  - Seed quotes + legal flow statuses (prod)"
	@echo "  prod-secrets-generate - Generate rotated internal secrets into .env.prod"
	@echo "  prod-secrets-apply    - Generate + apply rotated internal secrets to running prod stack"
	@echo "  prod-secrets-generate-env - Generate rotated secrets from current .env into .env.secure"
	@echo "  prod-secrets-apply-env    - Generate + apply rotated secrets directly for current .env"
	@echo "  prod-reencrypt-active-kid - Re-encrypt historical chat/invoice/admin secrets using active KID (prod)"
	@echo "  prod-minio-tls-init   - Generate internal CA and MinIO TLS certs (deploy/tls/minio)"
	@echo "  incident-checklist    - Create PDn incident checklist markdown report"
	@echo "  security-smoke        - Run security smoke checks and create report"
	@echo "  prod-security-audit   - Full production security audit/repair workflow"
	@echo "  prod-security-scheduler-up   - Start/update dedicated security scheduler service"
	@echo "  prod-security-scheduler-logs - Tail security scheduler logs"
	@echo "  rotate-encryption-kid - Add new KID key pair to .env and switch active KID"
	@echo "  reencrypt-active-kid  - Re-encrypt historical encrypted fields using active KID"
	@echo "  prod-cert-init    - Initial Let's Encrypt issue (nginx only 80 during bootstrap)"
	@echo "  prod-cert-renew   - Renew existing certificates"
	@echo ""
	@echo "Domains:"
	@echo "  DOMAIN=$(DOMAIN)"
	@echo "  WWW_DOMAIN=$(WWW_DOMAIN)"
	@echo "  SECOND_DOMAIN=$(SECOND_DOMAIN)"
	@echo "  SECOND_WWW_DOMAIN=$(SECOND_WWW_DOMAIN)"
	@echo "  AUTO_CERT_INIT=$(AUTO_CERT_INIT)"
	@echo "  SKIP_LOCAL_SMOKE=$(SKIP_LOCAL_SMOKE)"
	@echo "  LOCAL_SMOKE_BASE_URL=$(LOCAL_SMOKE_BASE_URL)"
	@echo "  LOCAL_SMOKE_CANDIDATES=$(LOCAL_SMOKE_CANDIDATES)"
	@echo "  LOCAL_SMOKE_SKIP_DOCKER_CHECKS=$(LOCAL_SMOKE_SKIP_DOCKER_CHECKS)"

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

local-seed-statuses:
	$(LOCAL_COMPOSE) exec -T backend python -m app.scripts.upsert_statuses_legal_flow

local-seed-catalog:
	$(LOCAL_COMPOSE) exec -T backend python -m app.scripts.upsert_quotes
	$(LOCAL_COMPOSE) exec -T backend python -m app.scripts.upsert_statuses_legal_flow

local-reencrypt-active-kid:
	$(LOCAL_COMPOSE) exec -T backend python -m app.scripts.reencrypt_with_active_kid --apply

check-prod-files:
	@test -f docker-compose.prod.nginx.yml || (echo "[ERROR] Missing docker-compose.prod.nginx.yml. Run: git pull"; exit 1)
	@test -f frontend/nginx.prod.conf || (echo "[ERROR] Missing frontend/nginx.prod.conf. Run: git pull"; exit 1)
	@test -f scripts/ops/minio_tls_bootstrap.sh || (echo "[ERROR] Missing scripts/ops/minio_tls_bootstrap.sh. Run: git pull"; exit 1)

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

prod-seed-statuses: check-prod-files
	$(PROD_COMPOSE) exec -T backend python -m app.scripts.upsert_statuses_legal_flow

prod-seed-catalog: check-prod-files
	$(PROD_COMPOSE) exec -T backend python -m app.scripts.upsert_quotes
	$(PROD_COMPOSE) exec -T backend python -m app.scripts.upsert_statuses_legal_flow

prod-secrets-generate:
	./scripts/ops/rotate_prod_secrets.sh --env-in .env.production --env-out .env.prod

prod-secrets-apply: check-prod-files
	./scripts/ops/rotate_prod_secrets.sh --env-in .env.production --env-out .env.prod --apply-running --compose-override docker-compose.prod.nginx.yml --non-interactive --require-confirmation-token "$(CONFIRM_TOKEN)"

prod-secrets-generate-env: check-prod-files
	./scripts/ops/rotate_prod_secrets.sh --env-in .env --env-out .env.secure

prod-secrets-apply-env: check-prod-files
	./scripts/ops/rotate_prod_secrets.sh --env-in .env --env-out .env.secure --apply-running --compose-override docker-compose.prod.nginx.yml --non-interactive --require-confirmation-token "$(CONFIRM_TOKEN)"

prod-minio-tls-init:
	./scripts/ops/minio_tls_bootstrap.sh

incident-checklist:
	./scripts/ops/incident_checklist.sh

security-smoke:
	./scripts/ops/security_smoke.sh

prod-security-audit: check-cert-files
	DOMAIN="$(DOMAIN)" \
	WWW_DOMAIN="$(WWW_DOMAIN)" \
	SECOND_DOMAIN="$(SECOND_DOMAIN)" \
	SECOND_WWW_DOMAIN="$(SECOND_WWW_DOMAIN)" \
	LETSENCRYPT_EMAIL="$(LETSENCRYPT_EMAIL)" \
	AUTO_CERT_INIT="$(AUTO_CERT_INIT)" \
	SKIP_LOCAL_SMOKE="$(SKIP_LOCAL_SMOKE)" \
	LOCAL_SMOKE_BASE_URL="$(LOCAL_SMOKE_BASE_URL)" \
	LOCAL_SMOKE_CANDIDATES="$(LOCAL_SMOKE_CANDIDATES)" \
	LOCAL_SMOKE_SKIP_DOCKER_CHECKS="$(LOCAL_SMOKE_SKIP_DOCKER_CHECKS)" \
	./scripts/ops/prod_security_audit.sh

prod-security-scheduler-up: check-prod-files
	@echo "[SEC] Checking MinIO TLS bundle"
	@if [ ! -f deploy/tls/minio/ca.crt ] || ! openssl x509 -in deploy/tls/minio/ca.crt -noout >/dev/null 2>&1 || [ ! -f deploy/tls/minio/public.crt ] || ! openssl x509 -in deploy/tls/minio/public.crt -noout >/dev/null 2>&1 || [ ! -f deploy/tls/minio/private.key ]; then \
		echo "[SEC] MinIO TLS bundle missing/invalid -> regenerating"; \
		MINIO_TLS_OVERWRITE=true ./scripts/ops/minio_tls_bootstrap.sh; \
	fi
	$(PROD_COMPOSE) up -d --build --force-recreate security-scheduler

prod-security-scheduler-logs: check-prod-files
	$(PROD_COMPOSE) logs -f --tail=200 security-scheduler

rotate-encryption-kid:
	./scripts/ops/rotate_encryption_kid.sh --env-file .env

reencrypt-active-kid:
	$(MAKE) local-reencrypt-active-kid

prod-reencrypt-active-kid: check-prod-files
	$(PROD_COMPOSE) exec -T backend python -m app.scripts.reencrypt_with_active_kid --apply

# Initial certificate bootstrap:
# 1) Start stack with edge nginx on port 80 only.
# 2) Obtain cert via certbot webroot challenge.
# 3) Restart stack in regular prod mode (80/443).
prod-cert-init: check-cert-files
	$(CERT_COMPOSE) up -d --build db redis minio backend chat-service worker beat frontend edge
	$(CERT_COMPOSE) run --rm certbot certonly --webroot -w /var/www/certbot --email "$(LETSENCRYPT_EMAIL)" --agree-tos --no-eff-email --non-interactive --expand $(CERTBOT_DOMAINS)
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
