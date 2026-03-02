from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.status import Status
from app.models.status_group import StatusGroup


STATUS_GROUP_NAME = "Юридический процесс"
STATUS_GROUP_SORT_ORDER = 10
RESPONSIBLE = "Импорт статусов (prod)"


LEGAL_FLOW_STATUSES = [
    {"code": "PRELIMINARY_CONSULT", "name": "Предварительная консультация", "sort_order": 10, "is_terminal": False},
    {"code": "INVOICE_ISSUANCE", "name": "Выставление счета", "sort_order": 20, "is_terminal": False},
    {"code": "CONTRACT_DISPATCH", "name": "Направление договора", "sort_order": 30, "is_terminal": False},
    {"code": "ADDENDUM_DISPATCH", "name": "Направление допсоглашения", "sort_order": 40, "is_terminal": False},
    {"code": "INVOICE_PAYMENT", "name": "Оплата счета", "sort_order": 50, "is_terminal": False},
    {"code": "LEGAL_STRATEGY", "name": "Разработка юридической стратегии", "sort_order": 60, "is_terminal": False},
    {"code": "NEGOTIATION", "name": "Ведение переговоров", "sort_order": 70, "is_terminal": False},
    {"code": "CLAIM_PREPARATION", "name": "Подготовка претензии", "sort_order": 80, "is_terminal": False},
    {"code": "CLAIM_DISPATCH", "name": "Претензия направлена", "sort_order": 90, "is_terminal": False},
    {"code": "LAWSUIT_PREPARATION", "name": "Подготовка иска", "sort_order": 100, "is_terminal": False},
    {"code": "CONTRACT_PREPARATION", "name": "Разработка договора", "sort_order": 110, "is_terminal": False},
    {"code": "LEGAL_POSITION_PREPARATION", "name": "Разработка правовой позиции", "sort_order": 120, "is_terminal": False},
    {"code": "LAWSUIT_PREPARATION_REPEAT", "name": "Подготовка иска", "sort_order": 130, "is_terminal": False},
    {"code": "STATE_FEE_PAYMENT", "name": "Оплата госпошлины", "sort_order": 140, "is_terminal": False},
    {"code": "LAWSUIT_FILING", "name": "Подача иска", "sort_order": 150, "is_terminal": False},
    {"code": "COURT_HEARING", "name": "Судебное заседание", "sort_order": 160, "is_terminal": False},
    {"code": "EXPERT_EXAM_APPOINTMENT", "name": "Назначение экспертизы", "sort_order": 170, "is_terminal": False},
    {"code": "FIRST_INSTANCE_DECISION", "name": "Вынесение решения суда первая инстанция", "sort_order": 180, "is_terminal": False},
    {
        "code": "APPEAL_BRIEF_PREPARATION",
        "name": "Подготовка апелляционной жалобы/отзыва",
        "sort_order": 190,
        "is_terminal": False,
    },
    {"code": "APPEAL_BRIEF_FILING", "name": "Подача апелляционной жалобы/отзыва", "sort_order": 200, "is_terminal": False},
    {"code": "APPEAL_ACT_DECISION", "name": "Вынесение судебного акта апелляция", "sort_order": 210, "is_terminal": False},
    {
        "code": "CASSATION_BRIEF_PREPARATION",
        "name": "Подготовка кассационной жалобы/отзыва",
        "sort_order": 220,
        "is_terminal": False,
    },
    {"code": "CASSATION_BRIEF_FILING", "name": "Подача кассационной жалобы/отзыва", "sort_order": 230, "is_terminal": False},
    {"code": "CASSATION_ACT_DECISION", "name": "Вынесение судебного акта кассация", "sort_order": 240, "is_terminal": False},
    {"code": "SUPREME_COURT_COMPLAINT_FILING", "name": "Подача жалобы в ВС РФ", "sort_order": 250, "is_terminal": False},
    {"code": "SUPREME_COURT_REVIEW", "name": "Рассмотрение жалобы в ВС РФ", "sort_order": 260, "is_terminal": False},
    {"code": "ENFORCEMENT_PROCEEDINGS", "name": "Исполнительное производство", "sort_order": 270, "is_terminal": False},
    {"code": "FINAL_SETTLEMENT", "name": "Окончательный расчет", "sort_order": 280, "is_terminal": False},
    {"code": "BONUS_PAYMENT", "name": "Премирование", "sort_order": 290, "is_terminal": True},
]


def ensure_status_group(db: Session) -> StatusGroup:
    row = db.query(StatusGroup).filter(StatusGroup.name == STATUS_GROUP_NAME).first()
    if row is None:
        row = StatusGroup(
            name=STATUS_GROUP_NAME,
            sort_order=STATUS_GROUP_SORT_ORDER,
            responsible=RESPONSIBLE,
        )
        db.add(row)
        db.flush()
        return row

    changed = False
    if int(row.sort_order or 0) != STATUS_GROUP_SORT_ORDER:
        row.sort_order = STATUS_GROUP_SORT_ORDER
        changed = True
    if str(row.responsible or "") != RESPONSIBLE:
        row.responsible = RESPONSIBLE
        changed = True
    if changed:
        row.updated_at = datetime.now(timezone.utc)
        db.add(row)
    return row


def upsert_statuses(db: Session) -> tuple[int, int, int]:
    group = ensure_status_group(db)

    created = 0
    updated = 0
    unchanged = 0

    for item in LEGAL_FLOW_STATUSES:
        code = str(item["code"]).strip()
        name = str(item["name"]).strip()
        sort_order = int(item["sort_order"])
        is_terminal = bool(item["is_terminal"])

        row = db.query(Status).filter(Status.code == code).first()
        if row is None:
            db.add(
                Status(
                    code=code,
                    name=name,
                    status_group_id=group.id,
                    enabled=True,
                    sort_order=sort_order,
                    is_terminal=is_terminal,
                    kind="DEFAULT",
                    responsible=RESPONSIBLE,
                )
            )
            created += 1
            continue

        changed = False
        if str(row.name or "") != name:
            row.name = name
            changed = True
        if row.status_group_id != group.id:
            row.status_group_id = group.id
            changed = True
        if not bool(row.enabled):
            row.enabled = True
            changed = True
        if int(row.sort_order or 0) != sort_order:
            row.sort_order = sort_order
            changed = True
        if bool(row.is_terminal) != is_terminal:
            row.is_terminal = is_terminal
            changed = True
        if str(row.kind or "").upper() != "DEFAULT":
            row.kind = "DEFAULT"
            changed = True
        if str(row.responsible or "") != RESPONSIBLE:
            row.responsible = RESPONSIBLE
            changed = True

        if changed:
            row.updated_at = datetime.now(timezone.utc)
            db.add(row)
            updated += 1
        else:
            unchanged += 1

    db.commit()
    return created, updated, unchanged


def main() -> None:
    db = SessionLocal()
    try:
        created, updated, unchanged = upsert_statuses(db)
        total = db.query(Status).count()
    finally:
        db.close()
    print(
        "statuses upsert done: "
        f"created={created}, updated={updated}, unchanged={unchanged}, "
        f"flow_total={len(LEGAL_FLOW_STATUSES)}, total_in_db={total}"
    )


if __name__ == "__main__":
    main()
