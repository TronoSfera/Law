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
    # Optional crop parameters for USER_AVATAR scope.
    # JSON string: {"x": float, "y": float, "zoom": float}
    # x/y: -1.0..1.0 (offset from center), zoom: 1.0..4.0
    crop_json: Optional[str] = None


class UploadCompleteResponse(BaseModel):
    status: str = "ok"
    attachment_id: Optional[str] = None
    avatar_url: Optional[str] = None
    avatar_original_key: Optional[str] = None


class RecropPayload(BaseModel):
    user_id: str
    # JSON string: {"x": float, "y": float, "zoom": float}
    crop_json: str


class RecropResponse(BaseModel):
    status: str = "ok"
    avatar_url: Optional[str] = None
