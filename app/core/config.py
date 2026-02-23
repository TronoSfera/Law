from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    APP_ENV: str = "local"
    APP_NAME: str = "legal-case-tracker"

    PUBLIC_JWT_TTL_DAYS: int = 7
    ADMIN_JWT_TTL_MINUTES: int = 240
    ADMIN_JWT_SECRET: str = "change_me_admin"
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

    TELEGRAM_BOT_TOKEN: str = "change_me"
    TELEGRAM_CHAT_ID: str = "0"
    SMS_PROVIDER: str = "dummy"
    DATA_ENCRYPTION_SECRET: str = "change_me_data_encryption"

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()
