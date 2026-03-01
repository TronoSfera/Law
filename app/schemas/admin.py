from datetime import datetime

from pydantic import BaseModel, Field, field_validator
from typing import Optional

class AdminLogin(BaseModel):
    email: str
    password: str
    totp_code: Optional[str] = None
    backup_code: Optional[str] = None

class AdminToken(BaseModel):
    access_token: str
    token_type: str = "Bearer"


class AdminTotpSetupIn(BaseModel):
    issuer: Optional[str] = None


class AdminTotpSetupOut(BaseModel):
    secret: str
    otpauth_uri: str
    issuer: str
    account_name: str


class AdminTotpEnableIn(BaseModel):
    secret: str
    code: str


class AdminTotpVerifyIn(BaseModel):
    code: Optional[str] = None
    backup_code: Optional[str] = None


class AdminTotpEnableOut(BaseModel):
    enabled: bool
    backup_codes: list[str]


class AdminTotpStatusOut(BaseModel):
    mode: str
    enabled: bool
    required: bool
    has_backup_codes: bool

class QuoteUpsert(BaseModel):
    text: str
    author: str
    source: Optional[str] = None
    is_active: bool = True
    sort_order: int = 0


class TopicUpsert(BaseModel):
    code: str
    name: str
    enabled: bool = True
    sort_order: int = 0


class StatusUpsert(BaseModel):
    code: str
    name: str
    status_group_id: Optional[str] = None
    enabled: bool = True
    sort_order: int = 0
    is_terminal: bool = False
    kind: str = "DEFAULT"
    invoice_template: Optional[str] = None

    @field_validator("kind")
    @classmethod
    def validate_kind(cls, value: str) -> str:
        normalized = str(value or "DEFAULT").strip().upper()
        if normalized not in {"DEFAULT", "INVOICE", "PAID"}:
            raise ValueError('kind должен быть одним из: DEFAULT, INVOICE, PAID')
        return normalized

    @field_validator("invoice_template")
    @classmethod
    def normalize_template(cls, value: Optional[str]) -> Optional[str]:
        text = str(value or "").strip()
        return text or None


class FormFieldUpsert(BaseModel):
    key: str
    label: str
    type: str
    required: bool = False
    enabled: bool = True
    sort_order: int = 0
    options: Optional[dict] = None


class RequestAdminCreate(BaseModel):
    track_number: Optional[str] = None
    client_id: Optional[str] = None
    client_name: str
    client_phone: str
    topic_code: Optional[str] = None
    status_code: str = "NEW"
    important_date_at: Optional[datetime] = None
    description: Optional[str] = None
    extra_fields: dict = Field(default_factory=dict)
    assigned_lawyer_id: Optional[str] = None
    effective_rate: Optional[float] = None
    request_cost: Optional[float] = None
    invoice_amount: Optional[float] = None
    paid_at: Optional[datetime] = None
    paid_by_admin_id: Optional[str] = None
    total_attachments_bytes: int = 0


class RequestAdminPatch(BaseModel):
    track_number: Optional[str] = None
    client_id: Optional[str] = None
    client_name: Optional[str] = None
    client_phone: Optional[str] = None
    topic_code: Optional[str] = None
    status_code: Optional[str] = None
    important_date_at: Optional[datetime] = None
    description: Optional[str] = None
    extra_fields: Optional[dict] = None
    assigned_lawyer_id: Optional[str] = None
    effective_rate: Optional[float] = None
    request_cost: Optional[float] = None
    invoice_amount: Optional[float] = None
    paid_at: Optional[datetime] = None
    paid_by_admin_id: Optional[str] = None
    total_attachments_bytes: Optional[int] = None


class RequestReassign(BaseModel):
    lawyer_id: str


class RequestStatusChange(BaseModel):
    status_code: str
    important_date_at: Optional[datetime] = None
    comment: Optional[str] = None


class RequestDataRequirementCreate(BaseModel):
    key: str
    label: str
    description: Optional[str] = None
    required: bool = True


class RequestDataRequirementPatch(BaseModel):
    key: Optional[str] = None
    label: Optional[str] = None
    description: Optional[str] = None
    required: Optional[bool] = None


class NotificationsReadAll(BaseModel):
    request_id: Optional[str] = None


class RequestServiceRequestPatch(BaseModel):
    status: str
