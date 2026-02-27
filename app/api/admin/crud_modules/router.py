from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import get_current_admin
from app.db.session import get_db
from app.schemas.universal import UniversalQuery

from .service import (
    create_row_service,
    delete_row_service,
    get_row_service,
    list_available_tables_service,
    list_tables_meta_service,
    query_table_service,
    update_available_table_service,
    update_row_service,
)

router = APIRouter()


class TableAvailabilityUpdatePayload(BaseModel):
    is_active: bool


@router.get("/meta/tables")
def list_tables_meta(db: Session = Depends(get_db), admin: dict = Depends(get_current_admin)):
    return list_tables_meta_service(db, admin)


@router.get("/meta/available-tables")
def list_available_tables(db: Session = Depends(get_db), admin: dict = Depends(get_current_admin)):
    return list_available_tables_service(db, admin)


@router.patch("/meta/available-tables/{table_name}")
def update_available_table(
    table_name: str,
    payload: TableAvailabilityUpdatePayload,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    return update_available_table_service(table_name, payload.is_active, db, admin)


@router.post("/{table_name}/query")
def query_table(
    table_name: str,
    uq: UniversalQuery,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    return query_table_service(table_name, uq, db, admin)


@router.get("/{table_name}/{row_id}")
def get_row(
    table_name: str,
    row_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    return get_row_service(table_name, row_id, db, admin)


@router.post("/{table_name}", status_code=201)
def create_row(
    table_name: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    return create_row_service(table_name, payload, db, admin)


@router.patch("/{table_name}/{row_id}")
def update_row(
    table_name: str,
    row_id: str,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    return update_row_service(table_name, row_id, payload, db, admin)


@router.delete("/{table_name}/{row_id}")
def delete_row(
    table_name: str,
    row_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    return delete_row_service(table_name, row_id, db, admin)
