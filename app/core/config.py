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

    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:8081"

    DATABASE_URL: str
    REDIS_URL: str

    S3_ENDPOINT: str
    S3_ACCESS_KEY: str
    S3_SECRET_KEY: str
    S3_BUCKET: str
    S3_REGION: str = "us-east-1"
    S3_USE_SSL: bool = False
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

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

settings = Settings()
