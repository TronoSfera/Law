from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel


class UploadScope(str, Enum):
    REQUEST_ATTACHMENT = "REQUEST_ATTACHMENT"
    USER_AVATAR = "USER_AVATAR"


class UploadInitPayload(BaseModel):
    file_name: str
    mime_type: str
    size_bytes: int
    scope: UploadScope
    request_id: Optional[str] = None
    user_id: Optional[str] = None


class UploadInitResponse(BaseModel):
    method: str = "PRESIGNED_PUT"
    key: str
    presigned_url: str


class UploadCompletePayload(BaseModel):
    key: str
    file_name: str
    mime_type: str
    size_bytes: int
    scope: UploadScope
    request_id: Optional[str] = None
    message_id: Optional[str] = None
    user_id: Optional[str] = None


class UploadCompleteResponse(BaseModel):
    status: str = "ok"
    attachment_id: Optional[str] = None
    avatar_url: Optional[str] = None
