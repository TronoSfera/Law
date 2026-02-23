from __future__ import annotations

import re
import uuid
from functools import lru_cache
from urllib.parse import quote

import boto3
from botocore.exceptions import ClientError

from app.core.config import settings


def _safe_file_name(file_name: str) -> str:
    raw = str(file_name or "").strip() or "file.bin"
    return re.sub(r"[^A-Za-z0-9._-]+", "_", raw)


def build_object_key(prefix: str, file_name: str) -> str:
    safe_name = _safe_file_name(file_name)
    return f"{prefix.strip('/')}/{uuid.uuid4().hex}-{safe_name}"


class S3Storage:
    def __init__(self):
        self.bucket = settings.S3_BUCKET
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
            region_name=settings.S3_REGION,
            use_ssl=settings.S3_USE_SSL,
        )
        self._bucket_checked = False

    def ensure_bucket(self) -> None:
        if self._bucket_checked:
            return
        try:
            self.client.head_bucket(Bucket=self.bucket)
        except ClientError as exc:
            code = str(exc.response.get("Error", {}).get("Code", ""))
            if code not in {"404", "NoSuchBucket", "NotFound"}:
                raise
            kwargs: dict = {"Bucket": self.bucket}
            if settings.S3_REGION and settings.S3_REGION != "us-east-1":
                kwargs["CreateBucketConfiguration"] = {"LocationConstraint": settings.S3_REGION}
            self.client.create_bucket(**kwargs)
        self._bucket_checked = True

    def create_presigned_put_url(self, key: str, mime_type: str, expires_sec: int = 900) -> str:
        self.ensure_bucket()
        return self.client.generate_presigned_url(
            "put_object",
            Params={"Bucket": self.bucket, "Key": key, "ContentType": mime_type},
            ExpiresIn=expires_sec,
            HttpMethod="PUT",
        )

    def head_object(self, key: str) -> dict:
        self.ensure_bucket()
        return self.client.head_object(Bucket=self.bucket, Key=key)

    def get_object(self, key: str) -> dict:
        self.ensure_bucket()
        return self.client.get_object(Bucket=self.bucket, Key=key)

    def get_avatar_proxy_path(self, key: str, token: str) -> str:
        return "/api/admin/uploads/object/" + quote(key, safe="") + "?token=" + quote(token, safe="")


@lru_cache(maxsize=1)
def get_s3_storage() -> S3Storage:
    return S3Storage()
