from logging.config import fileConfig
from alembic import context
from sqlalchemy import engine_from_config, pool
import os
from app.db.session import Base

# import models
from app.models.admin_user import AdminUser
from app.models.topic import Topic
from app.models.status import Status
from app.models.form_field import FormField
from app.models.request import Request
from app.models.message import Message
from app.models.attachment import Attachment
from app.models.status_history import StatusHistory
from app.models.audit_log import AuditLog
from app.models.otp_session import OtpSession
from app.models.quote import Quote
from app.models.admin_user_topic import AdminUserTopic
from app.models.notification import Notification
from app.models.invoice import Invoice
from app.models.security_audit_log import SecurityAuditLog

config = context.config
fileConfig(config.config_file_name)
target_metadata = Base.metadata

def get_url():
    return os.getenv("DATABASE_URL")

def run_migrations_offline():
    context.configure(url=get_url(), target_metadata=target_metadata, literal_binds=True, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online():
    cfg = config.get_section(config.config_ini_section)
    cfg["sqlalchemy.url"] = get_url()
    connectable = engine_from_config(cfg, prefix="sqlalchemy.", poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
