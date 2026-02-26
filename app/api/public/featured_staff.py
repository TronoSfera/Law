from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.admin_user import AdminUser
from app.models.landing_featured_staff import LandingFeaturedStaff
from app.models.topic import Topic

router = APIRouter()


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
            AdminUser.role.in_(("ADMIN", "LAWYER")),
            AdminUser.avatar_url.is_not(None),
            and_(AdminUser.avatar_url != ""),
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
        role_label = "Администратор" if role_code == "ADMIN" else "Юрист"
        primary_topic_code = str(user.primary_topic_code or "").strip() or None
        result.append(
            {
                "id": str(slot.id),
                "admin_user_id": str(user.id),
                "name": user.name,
                "role": role_code,
                "role_label": role_label,
                "avatar_url": user.avatar_url,
                "caption": str(slot.caption or "").strip() or None,
                "pinned": bool(slot.pinned),
                "sort_order": int(slot.sort_order or 0),
                "primary_topic_code": primary_topic_code,
                "primary_topic_name": topic_names.get(primary_topic_code or "", primary_topic_code),
            }
        )
    return {"items": result, "total": len(result)}
