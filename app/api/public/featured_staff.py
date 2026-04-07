from __future__ import annotations

from uuid import UUID

from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.admin_user import AdminUser
from app.models.landing_featured_staff import LandingFeaturedStaff
from app.models.topic import Topic
from app.services.s3_storage import get_s3_storage
from app.api.admin.uploads import (
    AVATAR_THUMB_MAX_SIZE_PX,
    _avatar_variant_key,
    _read_object_body_or_400,
    _render_avatar_to_webp_or_400,
    _write_object_bytes_or_500,
)

router = APIRouter()


def _featured_avatar_proxy_path(admin_user_id: str, variant: str | None = "thumb") -> str:
    path = "/api/public/featured-staff/avatar/" + str(admin_user_id)
    normalized_variant = str(variant or "").strip().lower()
    if normalized_variant:
        return path + "?variant=" + normalized_variant
    return path


@router.get("")
def list_featured_staff(
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    topic_names = {
        str(row.code): str(row.name)
        for row in db.query(Topic).filter(Topic.enabled.is_(True)).all()
    }

    rows = (
        db.query(LandingFeaturedStaff, AdminUser)
        .join(AdminUser, AdminUser.id == LandingFeaturedStaff.admin_user_id)
        .filter(
            LandingFeaturedStaff.enabled.is_(True),
            AdminUser.is_active.is_(True),
            AdminUser.role.in_(("ADMIN", "LAWYER", "CURATOR")),
        )
        .order_by(
            LandingFeaturedStaff.pinned.desc(),
            LandingFeaturedStaff.sort_order.asc(),
            LandingFeaturedStaff.created_at.asc(),
        )
        .limit(limit)
        .all()
    )

    result = []
    for slot, user in rows:
        role_code = str(user.role or "").upper()
        role_label = "Администратор" if role_code == "ADMIN" else "Куратор" if role_code == "CURATOR" else "Юрист"
        primary_topic_code = str(user.primary_topic_code or "").strip() or None
        raw_avatar_url = str(user.avatar_url or "").strip()
        avatar_url = raw_avatar_url
        if raw_avatar_url.startswith("s3://"):
            avatar_url = _featured_avatar_proxy_path(str(user.id), variant="thumb")
        result.append(
            {
                "id": str(slot.id),
                "admin_user_id": str(user.id),
                "name": user.name,
                "role": role_code,
                "role_label": role_label,
                "avatar_url": avatar_url,
                "caption": str(slot.caption or "").strip() or None,
                "pinned": bool(slot.pinned),
                "sort_order": int(slot.sort_order or 0),
                "primary_topic_code": primary_topic_code,
                "primary_topic_name": topic_names.get(primary_topic_code or "", primary_topic_code),
            }
        )
    return {"items": result, "total": len(result)}


@router.get("/avatar/{admin_user_id}")
def get_featured_staff_avatar(
    admin_user_id: str,
    variant: str | None = Query("thumb"),
    db: Session = Depends(get_db),
):
    try:
        user_uuid = UUID(str(admin_user_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Некорректный id пользователя")

    row = (
        db.query(AdminUser.avatar_url)
        .join(LandingFeaturedStaff, LandingFeaturedStaff.admin_user_id == AdminUser.id)
        .filter(
            LandingFeaturedStaff.enabled.is_(True),
            AdminUser.id == user_uuid,
            AdminUser.is_active.is_(True),
            AdminUser.role.in_(("ADMIN", "LAWYER", "CURATOR")),
            AdminUser.avatar_url.is_not(None),
            and_(AdminUser.avatar_url != ""),
        )
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Аватар не найден")

    raw_avatar_url = str(row[0] or "").strip()
    if not raw_avatar_url.startswith("s3://"):
        raise HTTPException(status_code=404, detail="Аватар не найден")
    key = raw_avatar_url[len("s3://") :].strip()
    if not key.startswith("avatars/" + str(user_uuid) + "/"):
        raise HTTPException(status_code=404, detail="Аватар не найден")

    target_key = key
    if str(variant or "").strip().lower() == "thumb":
        try:
            target_key = _avatar_variant_key(key, "thumb")
        except HTTPException:
            target_key = key

    storage = get_s3_storage()
    try:
        obj = storage.get_object(target_key)
    except ClientError:
        if target_key != key:
            try:
                original_obj = storage.get_object(key)
            except ClientError:
                raise HTTPException(status_code=404, detail="Аватар не найден")
            try:
                source = _read_object_body_or_400(original_obj)
                optimized = _render_avatar_to_webp_or_400(source, max_size_px=AVATAR_THUMB_MAX_SIZE_PX)
                _write_object_bytes_or_500(storage, key=target_key, content=optimized, mime_type="image/webp")
                obj = storage.get_object(target_key)
            except HTTPException:
                obj = original_obj
        else:
            raise HTTPException(status_code=404, detail="Аватар не найден")

    body = obj.get("Body")
    if body is None or not hasattr(body, "iter_chunks"):
        raise HTTPException(status_code=500, detail="Не удалось открыть аватар")
    media_type = str(obj.get("ContentType") or "application/octet-stream")
    content_length = obj.get("ContentLength")
    headers = {}
    if content_length is not None:
        headers["Content-Length"] = str(content_length)
    return StreamingResponse(body.iter_chunks(chunk_size=64 * 1024), media_type=media_type, headers=headers)
