from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore",
    )

    APP_ENV: str = "local"
    APP_NAME: str = "legal-case-tracker"

    PUBLIC_JWT_TTL_DAYS: int = 7
    ADMIN_JWT_TTL_MINUTES: int = 240
    ADMIN_JWT_SECRET: str = "change_me_admin"
    ADMIN_AUTH_MODE: str = "password_totp_optional"  # password | password_totp_optional | password_totp_required
    TOTP_ISSUER: str = "Правовой Трекер"
    PUBLIC_JWT_SECRET: str = "change_me_public"
    PUBLIC_COOKIE_NAME: str = "public_jwt"
    PUBLIC_COOKIE_SECURE: bool = False
    PUBLIC_COOKIE_SAMESITE: str = "lax"
    PUBLIC_STRICT_ORIGIN_CHECK: bool = True
    PUBLIC_ALLOWED_WEB_ORIGINS: str = (
        "http://localhost:8080,http://localhost:8081,"
        "https://ruakb.ru,https://www.ruakb.ru,"
        "https://ruakb.online,https://www.ruakb.online"
    )
    PRODUCTION_ENFORCE_SECURE_SETTINGS: bool = True

    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:8081"
    CORS_ALLOW_METHODS: str = "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    CORS_ALLOW_HEADERS: str = "Authorization,Content-Type,X-Requested-With,X-Request-ID"
    CORS_ALLOW_CREDENTIALS: bool = True

    DATABASE_URL: str
    REDIS_URL: str

    S3_ENDPOINT: str
    S3_ACCESS_KEY: str
    S3_SECRET_KEY: str
    S3_BUCKET: str
    S3_REGION: str = "us-east-1"
    S3_USE_SSL: bool = False
    S3_VERIFY_SSL: bool = True
    S3_CA_CERT_PATH: str = ""
    MAX_FILE_MB: int = 25
    MAX_CASE_MB: int = 250
    ATTACHMENT_SCAN_ENABLED: bool = False
    ATTACHMENT_SCAN_ENFORCE: bool = False
    ATTACHMENT_ALLOWED_MIME_TYPES: str = (
        "application/pdf,image/jpeg,image/png,video/mp4,text/plain"
    )
    CLAMAV_ENABLED: bool = False
    CLAMAV_HOST: str = "clamav"
    CLAMAV_PORT: int = 3310
    CLAMAV_TIMEOUT_SECONDS: int = 20

    TELEGRAM_BOT_TOKEN: str = "change_me"
    TELEGRAM_CHAT_ID: str = "0"
    SMS_PROVIDER: str = "dummy"
    SMSAERO_EMAIL: str = ""
    SMSAERO_API_KEY: str = ""
    OTP_SMS_TEMPLATE: str = "Your verification code: {code}"
    OTP_AUTOTEST_FORCE_MOCK_SMS: bool = True
    PUBLIC_AUTH_MODE: str = "sms"  # sms | email | sms_or_email | totp
    EMAIL_PROVIDER: str = "dummy"  # dummy | smtp
    EMAIL_SERVICE_ENABLED: bool = True
    EMAIL_SERVICE_URL: str = "http://email-service:8010"
    INTERNAL_SERVICE_TOKEN: str = "change_me_internal_service_token"
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""
    SMTP_USE_TLS: bool = True
    SMTP_USE_SSL: bool = False
    OTP_EMAIL_SUBJECT_TEMPLATE: str = "Код подтверждения: {code}"
    OTP_EMAIL_TEMPLATE: str = "Ваш код подтверждения: {code}"
    OTP_EMAIL_FALLBACK_ENABLED: bool = True
    OTP_SMS_MIN_BALANCE: float = 20.0
    DATA_ENCRYPTION_ACTIVE_KID: str = "legacy"
    DATA_ENCRYPTION_KEYS: str = ""
    CHAT_ENCRYPTION_ACTIVE_KID: str = ""
    CHAT_ENCRYPTION_KEYS: str = ""
    DATA_ENCRYPTION_SECRET: str = "change_me_data_encryption"
    CHAT_ENCRYPTION_SECRET: str = ""
    OTP_RATE_LIMIT_WINDOW_SECONDS: int = 300
    OTP_SEND_RATE_LIMIT: int = 8
    OTP_VERIFY_RATE_LIMIT: int = 20
    OTP_DEV_MODE: bool = False
    ADMIN_BOOTSTRAP_ENABLED: bool = True
    ADMIN_BOOTSTRAP_EMAIL: str = "admin@example.com"
    ADMIN_BOOTSTRAP_PASSWORD: str = "admin123"
    ADMIN_BOOTSTRAP_NAME: str = "Администратор системы"

    # Compose/infra vars that may exist in shared .env
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres"
    POSTGRES_DB: str = "legal"
    MINIO_ROOT_USER: str = "minio_local_admin"
    MINIO_ROOT_PASSWORD: str = "minio_local_password_change_me"
    MINIO_TLS_ENABLED: bool = False

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def cors_allow_methods_list(self) -> List[str]:
        values = [v.strip().upper() for v in str(self.CORS_ALLOW_METHODS or "").split(",") if v.strip()]
        return values or ["GET", "POST", "OPTIONS"]

    @property
    def cors_allow_headers_list(self) -> List[str]:
        values = [v.strip() for v in str(self.CORS_ALLOW_HEADERS or "").split(",") if v.strip()]
        return values or ["Authorization", "Content-Type"]

    @property
    def public_allowed_web_origins_list(self) -> List[str]:
        values: list[str] = []
        for item in str(self.PUBLIC_ALLOWED_WEB_ORIGINS or "").split(","):
            value = item.strip().rstrip("/").lower()
            if value:
                values.append(value)
        return values

    @property
    def app_env_is_production(self) -> bool:
        return str(self.APP_ENV or "").strip().lower() in {"prod", "production"}

    @property
    def public_cookie_secure_effective(self) -> bool:
        if self.app_env_is_production:
            return True
        return bool(self.PUBLIC_COOKIE_SECURE)

    @property
    def public_cookie_samesite_effective(self) -> str:
        raw = str(self.PUBLIC_COOKIE_SAMESITE or "lax").strip().lower()
        if raw in {"lax", "strict", "none"}:
            return raw
        return "lax"

settings = Settings()


def _looks_insecure_secret(value: str, *, min_len: int = 16) -> bool:
    raw = str(value or "").strip()
    lowered = raw.lower()
    if len(raw) < min_len:
        return True
    markers = (
        "change_me",
        "example",
        "admin123",
        "password",
        "test",
        "local",
    )
    return any(marker in lowered for marker in markers)


def validate_production_security_or_raise(component: str = "app") -> None:
    if not settings.app_env_is_production:
        return
    if not bool(getattr(settings, "PRODUCTION_ENFORCE_SECURE_SETTINGS", True)):
        return

    issues: list[str] = []

    if bool(settings.OTP_DEV_MODE):
        issues.append("OTP_DEV_MODE=true запрещен в production")
    if bool(settings.ADMIN_BOOTSTRAP_ENABLED):
        issues.append("ADMIN_BOOTSTRAP_ENABLED=true запрещен в production")

    if not settings.public_cookie_secure_effective:
        issues.append("PUBLIC cookie должен быть secure в production")

    if settings.public_cookie_samesite_effective == "none" and not settings.public_cookie_secure_effective:
        issues.append("PUBLIC_COOKIE_SAMESITE=none требует secure cookie")

    if _looks_insecure_secret(settings.ADMIN_JWT_SECRET):
        issues.append("ADMIN_JWT_SECRET выглядит небезопасным")
    if _looks_insecure_secret(settings.PUBLIC_JWT_SECRET):
        issues.append("PUBLIC_JWT_SECRET выглядит небезопасным")
    if _looks_insecure_secret(settings.DATA_ENCRYPTION_SECRET):
        issues.append("DATA_ENCRYPTION_SECRET выглядит небезопасным")
    if _looks_insecure_secret(settings.INTERNAL_SERVICE_TOKEN):
        issues.append("INTERNAL_SERVICE_TOKEN выглядит небезопасным")

    if not str(settings.CHAT_ENCRYPTION_SECRET or "").strip():
        # Backward-compatible: keyring-based CHAT_ENCRYPTION_KEYS is allowed.
        if not str(getattr(settings, "CHAT_ENCRYPTION_KEYS", "") or "").strip():
            issues.append("CHAT_ENCRYPTION_SECRET или CHAT_ENCRYPTION_KEYS обязателен в production")

    if not str(getattr(settings, "DATA_ENCRYPTION_ACTIVE_KID", "") or "").strip():
        issues.append("DATA_ENCRYPTION_ACTIVE_KID должен быть задан в production")

    minio_user = str(settings.MINIO_ROOT_USER or "").strip().lower()
    minio_password = str(settings.MINIO_ROOT_PASSWORD or "").strip()
    if minio_user in {"", "minioadmin", "minio_local_admin"}:
        issues.append("MINIO_ROOT_USER должен быть переопределен для production")
    if _looks_insecure_secret(minio_password):
        issues.append("MINIO_ROOT_PASSWORD выглядит небезопасным")

    if not bool(settings.S3_USE_SSL):
        issues.append("S3_USE_SSL должен быть включен в production")
    s3_endpoint = str(settings.S3_ENDPOINT or "").strip().lower()
    if not s3_endpoint.startswith("https://"):
        issues.append("S3_ENDPOINT должен начинаться с https:// в production")
    if not bool(settings.S3_VERIFY_SSL):
        issues.append("S3_VERIFY_SSL должен быть включен в production")
    if not str(settings.S3_CA_CERT_PATH or "").strip():
        issues.append("S3_CA_CERT_PATH должен быть задан для trusted TLS в production")
    if not bool(settings.MINIO_TLS_ENABLED):
        issues.append("MINIO_TLS_ENABLED должен быть включен в production")

    if bool(getattr(settings, "PUBLIC_STRICT_ORIGIN_CHECK", True)):
        allowed_public_origins = settings.public_allowed_web_origins_list
        if not allowed_public_origins:
            issues.append("PUBLIC_ALLOWED_WEB_ORIGINS должен быть задан в production")
        for origin in allowed_public_origins:
            if "localhost" in origin or "127.0.0.1" in origin:
                issues.append("PUBLIC_ALLOWED_WEB_ORIGINS не должен содержать localhost в production")
                break

    cors_origins = [item.strip().lower().rstrip("/") for item in settings.cors_origins_list]
    if not cors_origins:
        issues.append("CORS_ORIGINS должен быть задан в production")
    for origin in cors_origins:
        if origin == "*" or "*" in origin:
            issues.append("CORS_ORIGINS не должен содержать wildcard (*) в production")
            break
        if "localhost" in origin or "127.0.0.1" in origin:
            issues.append("CORS_ORIGINS не должен содержать localhost в production")
            break
        if not origin.startswith("https://"):
            issues.append("CORS_ORIGINS должен содержать только https origins в production")
            break

    cors_methods = [item.strip().upper() for item in settings.cors_allow_methods_list]
    if "*" in cors_methods:
        issues.append("CORS_ALLOW_METHODS не должен содержать wildcard (*) в production")
    cors_headers_lower = [item.strip().lower() for item in settings.cors_allow_headers_list]
    if "*" in cors_headers_lower:
        issues.append("CORS_ALLOW_HEADERS не должен содержать wildcard (*) в production")

    if issues:
        formatted = "\n".join(f"- {item}" for item in issues)
        raise RuntimeError(f"[{component}] insecure production configuration:\n{formatted}")
