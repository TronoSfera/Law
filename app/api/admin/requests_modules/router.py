from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import require_role
from app.db.session import get_db
from app.schemas.admin import (
    RequestAdminCreate,
    RequestAdminPatch,
    RequestDataRequirementCreate,
    RequestDataRequirementPatch,
    RequestReassign,
    RequestServiceRequestPatch,
    RequestStatusChange,
)
from app.schemas.universal import UniversalQuery

from .data_templates import (
    create_request_data_requirement_service,
    delete_request_data_requirement_service,
    get_request_data_template_service,
    sync_request_data_template_from_topic_service,
    update_request_data_requirement_service,
)
from .kanban import get_requests_kanban_service
from .service import (
    claim_request_service,
    create_request_service,
    delete_request_service,
    get_request_service,
    query_requests_service,
    reassign_request_service,
    update_request_service,
)
from .service_requests import (
    list_request_service_requests_service,
    mark_service_request_read_service,
    update_service_request_status_service,
)
from .status_flow import change_request_status_service, get_request_status_route_service

router = APIRouter()


@router.post("/query")
def query_requests(uq: UniversalQuery, db: Session = Depends(get_db), admin=Depends(require_role("ADMIN", "LAWYER", "CURATOR"))):
    return query_requests_service(uq, db, admin)


@router.get("/kanban")
def get_requests_kanban(
    db: Session = Depends(get_db),
    admin=Depends(require_role("ADMIN", "LAWYER")),
    limit: int = Query(default=400, ge=1, le=1000),
    filters: str | None = Query(default=None),
    sort_mode: str = Query(default="created_newest"),
):
    return get_requests_kanban_service(db, admin, limit=limit, filters=filters, sort_mode=sort_mode)


@router.post("", status_code=201)
def create_request(payload: RequestAdminCreate, db: Session = Depends(get_db), admin=Depends(require_role("ADMIN", "LAWYER"))):
    return create_request_service(payload, db, admin)


@router.patch("/{request_id}")
def update_request(
    request_id: str,
    payload: RequestAdminPatch,
    db: Session = Depends(get_db),
    admin=Depends(require_role("ADMIN", "LAWYER")),
):
    return update_request_service(request_id, payload, db, admin)


@router.delete("/{request_id}")
def delete_request(request_id: str, db: Session = Depends(get_db), admin=Depends(require_role("ADMIN", "LAWYER"))):
    return delete_request_service(request_id, db, admin)


@router.get("/{request_id}")
def get_request(request_id: str, db: Session = Depends(get_db), admin=Depends(require_role("ADMIN", "LAWYER", "CURATOR"))):
    return get_request_service(request_id, db, admin)


@router.post("/{request_id}/status-change")
def change_request_status(
    request_id: str,
    payload: RequestStatusChange,
    db: Session = Depends(get_db),
    admin=Depends(require_role("ADMIN", "LAWYER")),
):
    return change_request_status_service(request_id, payload, db, admin)


@router.get("/{request_id}/status-route")
def get_request_status_route(
    request_id: str,
    db: Session = Depends(get_db),
    admin=Depends(require_role("ADMIN", "LAWYER", "CURATOR")),
):
    return get_request_status_route_service(request_id, db, admin)


@router.post("/{request_id}/claim")
def claim_request(request_id: str, db: Session = Depends(get_db), admin=Depends(require_role("LAWYER"))):
    return claim_request_service(request_id, db, admin)


@router.post("/{request_id}/reassign")
def reassign_request(
    request_id: str,
    payload: RequestReassign,
    db: Session = Depends(get_db),
    admin=Depends(require_role("ADMIN")),
):
    return reassign_request_service(request_id, payload.lawyer_id, db, admin)


@router.get("/{request_id}/data-template")
def get_request_data_template(
    request_id: str,
    db: Session = Depends(get_db),
    admin=Depends(require_role("ADMIN", "LAWYER", "CURATOR")),
):
    return get_request_data_template_service(request_id, db, admin)


@router.get("/{request_id}/service-requests")
def list_request_service_requests(
    request_id: str,
    db: Session = Depends(get_db),
    admin=Depends(require_role("ADMIN", "LAWYER", "CURATOR")),
):
    return list_request_service_requests_service(request_id, db, admin)


@router.post("/service-requests/{service_request_id}/read")
def mark_service_request_read(
    service_request_id: str,
    db: Session = Depends(get_db),
    admin=Depends(require_role("ADMIN", "LAWYER", "CURATOR")),
):
    return mark_service_request_read_service(service_request_id, db, admin)


@router.patch("/service-requests/{service_request_id}")
def update_service_request_status(
    service_request_id: str,
    payload: RequestServiceRequestPatch,
    db: Session = Depends(get_db),
    admin=Depends(require_role("ADMIN", "CURATOR")),
):
    return update_service_request_status_service(service_request_id, payload, db, admin)


@router.post("/{request_id}/data-template/sync")
def sync_request_data_template_from_topic(
    request_id: str,
    db: Session = Depends(get_db),
    admin=Depends(require_role("ADMIN", "LAWYER")),
):
    return sync_request_data_template_from_topic_service(request_id, db, admin)


@router.post("/{request_id}/data-template/items", status_code=201)
def create_request_data_requirement(
    request_id: str,
    payload: RequestDataRequirementCreate,
    db: Session = Depends(get_db),
    admin=Depends(require_role("ADMIN", "LAWYER")),
):
    return create_request_data_requirement_service(request_id, payload, db, admin)


@router.patch("/{request_id}/data-template/items/{item_id}")
def update_request_data_requirement(
    request_id: str,
    item_id: str,
    payload: RequestDataRequirementPatch,
    db: Session = Depends(get_db),
    admin=Depends(require_role("ADMIN", "LAWYER")),
):
    return update_request_data_requirement_service(request_id, item_id, payload, db, admin)


@router.delete("/{request_id}/data-template/items/{item_id}")
def delete_request_data_requirement(
    request_id: str,
    item_id: str,
    db: Session = Depends(get_db),
    admin=Depends(require_role("ADMIN", "LAWYER")),
):
    return delete_request_data_requirement_service(request_id, item_id, db, admin)
