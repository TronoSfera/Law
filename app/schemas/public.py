from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
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
    code: str
