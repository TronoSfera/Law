from pydantic import BaseModel, Field
from typing import Optional, Any

class AdminLogin(BaseModel):
    email: str
    password: str

class AdminToken(BaseModel):
    access_token: str
    token_type: str = "Bearer"

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
    enabled: bool = True
    sort_order: int = 0
    is_terminal: bool = False


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
    client_name: str
    client_phone: str
    topic_code: Optional[str] = None
    status_code: str = "NEW"
    description: Optional[str] = None
    extra_fields: dict = Field(default_factory=dict)
    assigned_lawyer_id: Optional[str] = None
    total_attachments_bytes: int = 0


class RequestAdminPatch(BaseModel):
    track_number: Optional[str] = None
    client_name: Optional[str] = None
    client_phone: Optional[str] = None
    topic_code: Optional[str] = None
    status_code: Optional[str] = None
    description: Optional[str] = None
    extra_fields: Optional[dict] = None
    assigned_lawyer_id: Optional[str] = None
    total_attachments_bytes: Optional[int] = None
