from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List, Literal
from uuid import UUID

class PublicRequestCreate(BaseModel):
    client_name: str
    client_phone: str
    topic_code: Optional[str] = None
    description: Optional[str] = None
    extra_fields: Dict[str, Any] = Field(default_factory=dict)
    attachment_ids: Optional[List[UUID]] = None

class PublicRequestCreated(BaseModel):
    request_id: UUID
    track_number: str
    otp_required: bool = True

class OtpSend(BaseModel):
    purpose: str
    track_number: Optional[str] = None
    client_phone: Optional[str] = None

class OtpVerify(BaseModel):
    purpose: str
    track_number: Optional[str] = None
    client_phone: Optional[str] = None
    code: str


class PublicMessageCreate(BaseModel):
    body: str


class PublicMessageRead(BaseModel):
    id: UUID
    request_id: UUID
    author_type: str
    author_name: Optional[str] = None
    body: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class PublicAttachmentRead(BaseModel):
    id: UUID
    request_id: UUID
    message_id: Optional[UUID] = None
    file_name: str
    mime_type: str
    size_bytes: int
    created_at: Optional[str] = None
    download_url: str


class PublicStatusHistoryRead(BaseModel):
    id: UUID
    request_id: UUID
    from_status: Optional[str] = None
    to_status: str
    comment: Optional[str] = None
    created_at: Optional[str] = None


class PublicTimelineEvent(BaseModel):
    type: Literal["status_change", "message", "attachment"]
    created_at: Optional[str] = None
    payload: Dict[str, Any] = Field(default_factory=dict)


class PublicServiceRequestCreate(BaseModel):
    type: Literal["CURATOR_CONTACT", "LAWYER_CHANGE_REQUEST"]
    body: str = Field(min_length=3, max_length=4000)


class PublicServiceRequestRead(BaseModel):
    id: UUID
    request_id: UUID
    client_id: Optional[UUID] = None
    type: str
    status: str
    body: str
    created_by_client: bool
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    resolved_at: Optional[str] = None
