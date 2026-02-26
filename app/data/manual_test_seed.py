from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Iterable
from uuid import uuid4

from sqlalchemy import or_

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.admin_user import AdminUser
from app.models.admin_user_topic import AdminUserTopic
from app.models.attachment import Attachment
from app.models.audit_log import AuditLog
from app.models.client import Client
from app.models.invoice import Invoice
from app.models.message import Message
from app.models.notification import Notification
from app.models.request import Request
from app.models.request_data_requirement import RequestDataRequirement
from app.models.security_audit_log import SecurityAuditLog
from app.models.status import Status
from app.models.status_group import StatusGroup
from app.models.status_history import StatusHistory
from app.models.topic import Topic
from app.models.topic_data_template import TopicDataTemplate
from app.services.admin_bootstrap import ensure_bootstrap_admin_for_login
from app.services.s3_storage import get_s3_storage


UTC = timezone.utc
NOW = datetime.now(UTC).replace(second=0, microsecond=0)
REQUEST_PREFIX = "TRK-MAN-"
CLIENT_PHONE_PREFIX = "+79001000"
LAWYER_PHONE_PREFIX = "+79002000"
LAWYER_EMAIL_DOMAIN = "example.com"
LAWYER_PASSWORD = "LawyerManual-123!"
PROJECT_ROOT = Path(__file__).resolve().parents[2]
ACCESS_FILE_PATH = PROJECT_ROOT / "context" / "15_manual_test_access.md"


STATUS_GROUPS = [
    ("Новые", 10),
    ("В работе", 20),
    ("Ожидание", 30),
    ("Завершены", 40),
]

STATUSES = [
    {"code": "NEW", "name": "Новая", "group": "Новые", "sort_order": 10, "is_terminal": False},
    {"code": "ASSIGNED", "name": "Назначена", "group": "Новые", "sort_order": 20, "is_terminal": False},
    {"code": "IN_PROGRESS", "name": "В работе", "group": "В работе", "sort_order": 30, "is_terminal": False},
    {"code": "WAITING_CLIENT", "name": "Ожидание клиента", "group": "Ожидание", "sort_order": 40, "is_terminal": False},
    {"code": "WAITING_DOCUMENTS", "name": "Ожидание документов", "group": "Ожидание", "sort_order": 50, "is_terminal": False},
    {"code": "PAUSED", "name": "Пауза", "group": "Ожидание", "sort_order": 60, "is_terminal": False},
    {"code": "RESOLVED", "name": "Решена", "group": "Завершены", "sort_order": 70, "is_terminal": True},
    {"code": "CLOSED", "name": "Закрыта", "group": "Завершены", "sort_order": 80, "is_terminal": True},
]

TOPICS = [
    ("manual-civil", "Гражданские споры", 10),
    ("manual-family", "Семейное право", 20),
    ("manual-labor", "Трудовые споры", 30),
    ("manual-tax", "Налоговые вопросы", 40),
    ("manual-contract", "Договорная работа", 50),
]

LAWYERS = [
    {
        "email": f"lawyer1.manual@{LAWYER_EMAIL_DOMAIN}",
        "name": "Иван Волков",
        "phone": f"{LAWYER_PHONE_PREFIX}01",
        "primary_topic_code": "manual-civil",
        "extra_topics": ["manual-contract"],
        "default_rate": Decimal("5000.00"),
        "salary_percent": Decimal("35.00"),
    },
    {
        "email": f"lawyer2.manual@{LAWYER_EMAIL_DOMAIN}",
        "name": "Мария Егорова",
        "phone": f"{LAWYER_PHONE_PREFIX}02",
        "primary_topic_code": "manual-family",
        "extra_topics": ["manual-labor"],
        "default_rate": Decimal("4500.00"),
        "salary_percent": Decimal("32.00"),
    },
    {
        "email": f"lawyer3.manual@{LAWYER_EMAIL_DOMAIN}",
        "name": "Павел Климов",
        "phone": f"{LAWYER_PHONE_PREFIX}03",
        "primary_topic_code": "manual-tax",
        "extra_topics": ["manual-contract"],
        "default_rate": Decimal("6500.00"),
        "salary_percent": Decimal("40.00"),
    },
    {
        "email": f"lawyer4.manual@{LAWYER_EMAIL_DOMAIN}",
        "name": "Ольга Смирнова",
        "phone": f"{LAWYER_PHONE_PREFIX}04",
        "primary_topic_code": "manual-contract",
        "extra_topics": ["manual-civil", "manual-tax"],
        "default_rate": Decimal("5500.00"),
        "salary_percent": Decimal("38.00"),
    },
]

CLIENTS = [
    ("Ручной Клиент 01", f"{CLIENT_PHONE_PREFIX}01"),
    ("Ручной Клиент 02", f"{CLIENT_PHONE_PREFIX}02"),
    ("Ручной Клиент 03", f"{CLIENT_PHONE_PREFIX}03"),
    ("Ручной Клиент 04", f"{CLIENT_PHONE_PREFIX}04"),
    ("Ручной Клиент 05", f"{CLIENT_PHONE_PREFIX}05"),
    ("Ручной Клиент 06", f"{CLIENT_PHONE_PREFIX}06"),
    ("Ручной Клиент 07", f"{CLIENT_PHONE_PREFIX}07"),
    ("Ручной Клиент 08", f"{CLIENT_PHONE_PREFIX}08"),
    ("Ручной Клиент 09", f"{CLIENT_PHONE_PREFIX}09"),
    ("Ручной Клиент 10", f"{CLIENT_PHONE_PREFIX}10"),
]


@dataclass
class SeedRequestSpec:
    idx: int
    client_phone: str
    topic_code: str
    status_code: str
    assigned_lawyer_email: str | None
    created_days_ago: int
    last_update_hours_ago: int
    important_in_days: int | None
    request_cost: Decimal
    invoice_amount: Decimal | None
    invoice_status: str | None
    paid_days_ago: int | None
    chat_pairs: int
    client_unread: bool
    lawyer_unread: bool
    extra_note: str


REQUEST_SPECS: list[SeedRequestSpec] = [
    SeedRequestSpec(1, CLIENTS[0][1], "manual-civil", "NEW", None, 1, 2, 2, Decimal("15000"), None, None, None, 2, False, False, "Первичная консультация"),
    SeedRequestSpec(2, CLIENTS[0][1], "manual-contract", "IN_PROGRESS", LAWYERS[0]["email"], 9, 4, 1, Decimal("80000"), Decimal("30000"), "PAID", 3, 4, True, False, "Договор и претензия"),
    SeedRequestSpec(3, CLIENTS[0][1], "manual-tax", "WAITING_CLIENT", LAWYERS[2]["email"], 16, 8, -1, Decimal("120000"), Decimal("50000"), "WAITING_PAYMENT", None, 3, False, True, "Запрошены акты"),
    SeedRequestSpec(4, CLIENTS[0][1], "manual-tax", "RESOLVED", LAWYERS[2]["email"], 34, 72, None, Decimal("95000"), Decimal("95000"), "PAID", 10, 2, False, False, "Решено через досудебное"),
    SeedRequestSpec(5, CLIENTS[0][1], "manual-family", "CLOSED", LAWYERS[1]["email"], 64, 240, None, Decimal("60000"), Decimal("60000"), "PAID", 28, 2, False, False, "Завершено мировым соглашением"),
    SeedRequestSpec(6, CLIENTS[1][1], "manual-family", "IN_PROGRESS", LAWYERS[1]["email"], 4, 3, 0, Decimal("45000"), Decimal("20000"), "WAITING_PAYMENT", None, 4, False, True, "Подготовка иска"),
    SeedRequestSpec(7, CLIENTS[1][1], "manual-labor", "WAITING_DOCUMENTS", LAWYERS[1]["email"], 7, 12, 3, Decimal("38000"), None, None, None, 3, True, False, "Ожидаем трудовой договор"),
    SeedRequestSpec(8, CLIENTS[1][1], "manual-labor", "NEW", None, 0, 1, 3, Decimal("25000"), None, None, None, 1, False, False, "Новая заявка без назначения"),
    SeedRequestSpec(9, CLIENTS[1][1], "manual-contract", "ASSIGNED", LAWYERS[3]["email"], 2, 5, 2, Decimal("70000"), None, None, None, 2, True, False, "Назначена, ожидает старта"),
    SeedRequestSpec(10, CLIENTS[2][1], "manual-civil", "IN_PROGRESS", LAWYERS[0]["email"], 11, 6, 4, Decimal("110000"), Decimal("40000"), "PAID", 5, 5, False, True, "Судебное представительство"),
    SeedRequestSpec(11, CLIENTS[2][1], "manual-contract", "WAITING_CLIENT", LAWYERS[3]["email"], 14, 20, 1, Decimal("52000"), Decimal("15000"), "WAITING_PAYMENT", None, 3, False, True, "Дозапрос доверенности"),
    SeedRequestSpec(12, CLIENTS[2][1], "manual-tax", "PAUSED", LAWYERS[2]["email"], 21, 48, 7, Decimal("135000"), None, None, None, 2, True, False, "Пауза до ответа инспекции"),
    SeedRequestSpec(13, CLIENTS[3][1], "manual-civil", "WAITING_DOCUMENTS", LAWYERS[0]["email"], 6, 9, -2, Decimal("50000"), None, None, None, 3, True, False, "Просрочен дедлайн по документам"),
    SeedRequestSpec(14, CLIENTS[3][1], "manual-family", "RESOLVED", LAWYERS[1]["email"], 27, 96, None, Decimal("42000"), Decimal("42000"), "PAID", 12, 2, False, False, "Закрытие по соглашению"),
    SeedRequestSpec(15, CLIENTS[4][1], "manual-tax", "IN_PROGRESS", LAWYERS[2]["email"], 3, 2, 5, Decimal("210000"), Decimal("90000"), "PAID", 1, 4, False, True, "Налоговая проверка"),
    SeedRequestSpec(16, CLIENTS[4][1], "manual-contract", "WAITING_CLIENT", LAWYERS[3]["email"], 5, 10, 2, Decimal("65000"), None, None, None, 3, True, False, "Ждем подписанный акт"),
    SeedRequestSpec(17, CLIENTS[5][1], "manual-labor", "NEW", None, 1, 1, 3, Decimal("18000"), None, None, None, 1, False, False, "Консультация по увольнению"),
    SeedRequestSpec(18, CLIENTS[6][1], "manual-civil", "IN_PROGRESS", LAWYERS[0]["email"], 8, 7, 2, Decimal("92000"), Decimal("30000"), "WAITING_PAYMENT", None, 4, False, True, "Исполнительное производство"),
    SeedRequestSpec(19, CLIENTS[7][1], "manual-family", "ASSIGNED", LAWYERS[1]["email"], 2, 6, 3, Decimal("55000"), None, None, None, 2, True, False, "Раздел имущества"),
    SeedRequestSpec(20, CLIENTS[8][1], "manual-tax", "WAITING_DOCUMENTS", LAWYERS[2]["email"], 10, 18, 1, Decimal("175000"), None, None, None, 3, True, False, "Требуются книги учета"),
    SeedRequestSpec(21, CLIENTS[9][1], "manual-contract", "NEW", None, 0, 0, 3, Decimal("30000"), None, None, None, 1, False, False, "Проверка оферты"),
]


def _money(value: Decimal | None) -> Decimal | None:
    if value is None:
        return None
    return Decimal(value).quantize(Decimal("0.01"))


def _track_number(idx: int) -> str:
    return f"{REQUEST_PREFIX}{idx:04d}"


def _ensure_status_groups(db) -> dict[str, StatusGroup]:
    out: dict[str, StatusGroup] = {}
    for name, sort_order in STATUS_GROUPS:
        row = db.query(StatusGroup).filter(StatusGroup.name == name).first()
        if row is None:
            row = StatusGroup(name=name, sort_order=sort_order, responsible="Сид ручных тестов")
            db.add(row)
            db.flush()
        else:
            row.sort_order = sort_order
            row.responsible = "Сид ручных тестов"
        out[name] = row
    return out


def _ensure_statuses(db, groups: dict[str, StatusGroup]) -> dict[str, Status]:
    out: dict[str, Status] = {}
    for item in STATUSES:
        row = db.query(Status).filter(Status.code == item["code"]).first()
        if row is None:
            row = Status(
                code=item["code"],
                name=item["name"],
                status_group_id=groups[item["group"]].id,
                enabled=True,
                sort_order=int(item["sort_order"]),
                is_terminal=bool(item["is_terminal"]),
                responsible="Сид ручных тестов",
            )
            db.add(row)
        else:
            row.name = str(item["name"])
            row.status_group_id = groups[item["group"]].id
            row.enabled = True
            row.sort_order = int(item["sort_order"])
            row.is_terminal = bool(item["is_terminal"])
            row.responsible = "Сид ручных тестов"
        out[item["code"]] = row
    return out


def _ensure_topics(db) -> dict[str, Topic]:
    out: dict[str, Topic] = {}
    for code, name, sort_order in TOPICS:
        row = db.query(Topic).filter(Topic.code == code).first()
        if row is None:
            row = Topic(code=code, name=name, enabled=True, sort_order=sort_order, responsible="Сид ручных тестов")
            db.add(row)
        else:
            row.name = name
            row.enabled = True
            row.sort_order = sort_order
            row.responsible = "Сид ручных тестов"
        out[code] = row
    return out


def _ensure_bootstrap_admin(db) -> AdminUser:
    admin = ensure_bootstrap_admin_for_login(db, settings.ADMIN_BOOTSTRAP_EMAIL, settings.ADMIN_BOOTSTRAP_PASSWORD)
    if admin is None:
        row = db.query(AdminUser).filter(AdminUser.email == settings.ADMIN_BOOTSTRAP_EMAIL).first()
        if row:
            return row
        raise RuntimeError("Не удалось обеспечить bootstrap-администратора")
    if not str(admin.phone or "").strip():
        admin.phone = "+79009999999"
        admin.responsible = "Сид ручных тестов"
        db.add(admin)
        db.commit()
        db.refresh(admin)
    return admin


def _ensure_lawyers(db) -> dict[str, AdminUser]:
    out: dict[str, AdminUser] = {}
    for idx, item in enumerate(LAWYERS, start=1):
        row = db.query(AdminUser).filter(AdminUser.email == item["email"]).first()
        if row is None:
            row = AdminUser(
                role="LAWYER",
                name=item["name"],
                email=item["email"],
                phone=item["phone"],
                password_hash=hash_password(LAWYER_PASSWORD),
                primary_topic_code=item["primary_topic_code"],
                default_rate=item["default_rate"],
                salary_percent=item["salary_percent"],
                is_active=True,
                responsible="Сид ручных тестов",
            )
            db.add(row)
            db.flush()
        else:
            row.role = "LAWYER"
            row.name = item["name"]
            row.phone = item["phone"]
            row.primary_topic_code = item["primary_topic_code"]
            row.default_rate = item["default_rate"]
            row.salary_percent = item["salary_percent"]
            row.is_active = True
            row.responsible = "Сид ручных тестов"
            if not str(row.password_hash or "").strip():
                row.password_hash = hash_password(LAWYER_PASSWORD)
        out[item["email"]] = row

    db.flush()
    for item in LAWYERS:
        row = out[item["email"]]
        db.query(AdminUserTopic).filter(AdminUserTopic.admin_user_id == row.id).delete(synchronize_session=False)
        for topic_code in item["extra_topics"]:
            db.add(
                AdminUserTopic(
                    admin_user_id=row.id,
                    topic_code=topic_code,
                    responsible="Сид ручных тестов",
                )
            )
    return out


def _ensure_clients(db) -> dict[str, Client]:
    out: dict[str, Client] = {}
    for full_name, phone in CLIENTS:
        row = db.query(Client).filter(Client.phone == phone).first()
        if row is None:
            row = Client(full_name=full_name, phone=phone, responsible="Сид ручных тестов")
            db.add(row)
        else:
            row.full_name = full_name
            row.responsible = "Сид ручных тестов"
        out[phone] = row
    return out


def _seed_request_cleanup(db, request_ids: list, request_tracks: list[str]) -> dict[str, int]:
    counts = {
        "attachments": 0,
        "messages": 0,
        "status_history": 0,
        "invoices": 0,
        "notifications": 0,
        "request_data_requirements": 0,
        "audit_log": 0,
        "security_audit_log": 0,
        "requests": 0,
    }
    if not request_ids:
        return counts

    attachment_rows = db.query(Attachment).filter(Attachment.request_id.in_(request_ids)).all()
    attachment_ids = [row.id for row in attachment_rows]
    try:
        storage = get_s3_storage()
        storage.ensure_bucket()
        for row in attachment_rows:
            try:
                storage.client.delete_object(Bucket=storage.bucket, Key=row.s3_key)
            except Exception:
                pass
    except Exception:
        pass

    counts["notifications"] += db.query(Notification).filter(Notification.request_id.in_(request_ids)).delete(synchronize_session=False) or 0
    counts["request_data_requirements"] += (
        db.query(RequestDataRequirement).filter(RequestDataRequirement.request_id.in_(request_ids)).delete(synchronize_session=False) or 0
    )
    counts["status_history"] += db.query(StatusHistory).filter(StatusHistory.request_id.in_(request_ids)).delete(synchronize_session=False) or 0
    counts["invoices"] += db.query(Invoice).filter(Invoice.request_id.in_(request_ids)).delete(synchronize_session=False) or 0
    counts["messages"] += db.query(Message).filter(Message.request_id.in_(request_ids)).delete(synchronize_session=False) or 0
    counts["attachments"] += db.query(Attachment).filter(Attachment.request_id.in_(request_ids)).delete(synchronize_session=False) or 0
    counts["security_audit_log"] += (
        db.query(SecurityAuditLog).filter(SecurityAuditLog.request_id.in_(request_ids)).delete(synchronize_session=False) or 0
    )
    if attachment_ids:
        counts["security_audit_log"] += (
            db.query(SecurityAuditLog).filter(SecurityAuditLog.attachment_id.in_(attachment_ids)).delete(synchronize_session=False) or 0
        )
    counts["audit_log"] += (
        db.query(AuditLog)
        .filter(AuditLog.entity == "requests", AuditLog.entity_id.in_([str(v) for v in request_ids]))
        .delete(synchronize_session=False)
        or 0
    )
    if request_tracks:
        counts["notifications"] += (
            db.query(Notification)
            .filter(Notification.recipient_track_number.in_(request_tracks))
            .delete(synchronize_session=False)
            or 0
        )
    counts["requests"] += db.query(Request).filter(Request.id.in_(request_ids)).delete(synchronize_session=False) or 0
    return counts


def _rebuild_manual_requests(db, clients_by_phone: dict[str, Client], lawyers_by_email: dict[str, AdminUser]) -> list[Request]:
    manual_existing = db.query(Request).filter(Request.track_number.like(f"{REQUEST_PREFIX}%")).all()
    cleanup_counts = _seed_request_cleanup(
        db,
        [row.id for row in manual_existing],
        [str(row.track_number or "") for row in manual_existing],
    )

    created_requests: list[Request] = []
    for spec in REQUEST_SPECS:
        client = clients_by_phone[spec.client_phone]
        lawyer = lawyers_by_email.get(spec.assigned_lawyer_email or "") if spec.assigned_lawyer_email else None

        created_at = NOW - timedelta(days=spec.created_days_ago)
        updated_at = NOW - timedelta(hours=spec.last_update_hours_ago)
        important_date = None if spec.important_in_days is None else (NOW + timedelta(days=spec.important_in_days))
        status_timeline = _build_status_timeline(spec.status_code, created_at, important_date)

        row = Request(
            track_number=_track_number(spec.idx),
            client_id=client.id,
            client_name=client.full_name,
            client_phone=client.phone,
            topic_code=spec.topic_code,
            status_code=spec.status_code,
            important_date_at=important_date,
            description=(
                f"Тестовая заявка для ручной проверки платформы. {spec.extra_note}. "
                f"Клиент: {client.full_name}. Стадия: {spec.status_code}."
            ),
            extra_fields={
                "номер_договора": f"MAN-{spec.idx:04d}",
                "канал": "manual_seed",
                "приоритет": "средний" if spec.idx % 3 else "высокий",
            },
            assigned_lawyer_id=str(lawyer.id) if lawyer else None,
            effective_rate=_money(lawyer.default_rate if lawyer else Decimal("0.00")) if lawyer else None,
            request_cost=_money(spec.request_cost),
            invoice_amount=_money(spec.invoice_amount),
            paid_at=(NOW - timedelta(days=spec.paid_days_ago)) if spec.paid_days_ago is not None else None,
            paid_by_admin_id=None,
            total_attachments_bytes=0,
            client_has_unread_updates=spec.client_unread,
            client_unread_event_type="MESSAGE" if spec.client_unread else None,
            lawyer_has_unread_updates=spec.lawyer_unread,
            lawyer_unread_event_type="MESSAGE" if spec.lawyer_unread else None,
            responsible=(lawyer.name if lawyer else "Не назначено"),
            created_at=created_at,
            updated_at=updated_at,
        )
        db.add(row)
        db.flush()
        created_requests.append(row)

        _seed_status_history(db, row, status_timeline, lawyers_by_email, lawyer)
        _seed_chat_messages(db, row, lawyer, spec.chat_pairs)
        _seed_notifications(db, row, lawyer, spec.client_unread, spec.lawyer_unread)
        if spec.invoice_status and spec.invoice_amount is not None:
            _seed_invoice(db, row, client, lawyer, spec.invoice_status, spec.invoice_amount, spec.paid_days_ago)

    print(
        "manual seed cleanup:",
        ", ".join(f"{k}={v}" for k, v in cleanup_counts.items() if v),
    )
    return created_requests


def _build_status_timeline(final_status: str, created_at: datetime, important_date: datetime | None):
    chain_by_final = {
        "NEW": ["NEW"],
        "ASSIGNED": ["NEW", "ASSIGNED"],
        "IN_PROGRESS": ["NEW", "ASSIGNED", "IN_PROGRESS"],
        "WAITING_CLIENT": ["NEW", "ASSIGNED", "IN_PROGRESS", "WAITING_CLIENT"],
        "WAITING_DOCUMENTS": ["NEW", "ASSIGNED", "IN_PROGRESS", "WAITING_DOCUMENTS"],
        "PAUSED": ["NEW", "ASSIGNED", "IN_PROGRESS", "PAUSED"],
        "RESOLVED": ["NEW", "ASSIGNED", "IN_PROGRESS", "RESOLVED"],
        "CLOSED": ["NEW", "ASSIGNED", "IN_PROGRESS", "WAITING_CLIENT", "CLOSED"],
    }
    chain = chain_by_final.get(final_status, ["NEW", final_status])
    steps = []
    base = created_at
    for i, status_code in enumerate(chain):
        step_at = base + timedelta(hours=max(1, i * 18))
        if i == len(chain) - 1:
            imp = important_date
        else:
            imp = step_at + timedelta(days=3)
        steps.append({"to_status": status_code, "at": step_at, "important_date_at": imp})
    return steps


def _seed_status_history(db, request: Request, timeline: list[dict], lawyers_by_email: dict[str, AdminUser], assigned_lawyer: AdminUser | None):
    actor = assigned_lawyer
    for idx, item in enumerate(timeline):
        from_status = timeline[idx - 1]["to_status"] if idx > 0 else None
        db.add(
            StatusHistory(
                request_id=request.id,
                from_status=from_status,
                to_status=item["to_status"],
                changed_by_admin_id=actor.id if actor else None,
                comment=(
                    "Создание заявки" if idx == 0 else f"Переход в статус {item['to_status']} (сценарий ручного теста)"
                ),
                important_date_at=item["important_date_at"],
                responsible=(actor.name if actor else "Сид ручных тестов"),
                created_at=item["at"],
                updated_at=item["at"],
            )
        )


def _seed_chat_messages(db, request: Request, lawyer: AdminUser | None, chat_pairs: int):
    start_time = (request.created_at or NOW) + timedelta(hours=2)
    for i in range(chat_pairs):
        client_time = start_time + timedelta(hours=i * 8)
        db.add(
            Message(
                request_id=request.id,
                author_type="CLIENT",
                author_name=request.client_name,
                body=f"Клиент: сообщение #{i + 1} по заявке {request.track_number}",
                immutable=False,
                responsible="Клиент",
                created_at=client_time,
                updated_at=client_time,
            )
        )
        if lawyer:
            lawyer_time = client_time + timedelta(hours=1)
            db.add(
                Message(
                    request_id=request.id,
                    author_type="LAWYER",
                    author_name=lawyer.name,
                    body=f"Юрист: ответ #{i + 1} по заявке {request.track_number}",
                    immutable=False,
                    responsible=lawyer.name,
                    created_at=lawyer_time,
                    updated_at=lawyer_time,
                )
            )


def _seed_notifications(db, request: Request, lawyer: AdminUser | None, client_unread: bool, lawyer_unread: bool):
    base_payload = {
        "request_id": str(request.id),
        "track_number": request.track_number,
        "status_code": request.status_code,
        "topic_code": request.topic_code,
    }
    if client_unread:
        db.add(
            Notification(
                request_id=request.id,
                recipient_type="CLIENT",
                recipient_track_number=request.track_number,
                event_type="MESSAGE",
                title=f"Новое сообщение по заявке {request.track_number}",
                body="Есть непрочитанный ответ юриста",
                payload=base_payload,
                is_read=False,
                responsible="Сид ручных тестов",
                dedupe_key=f"manual-seed:client:{request.track_number}",
                created_at=(request.updated_at or NOW) - timedelta(minutes=5),
                updated_at=(request.updated_at or NOW) - timedelta(minutes=5),
            )
        )
    if lawyer_unread and lawyer:
        db.add(
            Notification(
                request_id=request.id,
                recipient_type="ADMIN_USER",
                recipient_admin_user_id=lawyer.id,
                event_type="MESSAGE",
                title=f"Новое сообщение по заявке {request.track_number}",
                body="Есть непрочитанное сообщение клиента",
                payload=base_payload,
                is_read=False,
                responsible="Сид ручных тестов",
                dedupe_key=f"manual-seed:lawyer:{lawyer.id}:{request.track_number}",
                created_at=(request.updated_at or NOW) - timedelta(minutes=4),
                updated_at=(request.updated_at or NOW) - timedelta(minutes=4),
            )
        )


def _seed_invoice(
    db,
    request: Request,
    client: Client,
    lawyer: AdminUser | None,
    status: str,
    amount: Decimal,
    paid_days_ago: int | None,
):
    issued_at = (request.created_at or NOW) + timedelta(days=1)
    paid_at = (NOW - timedelta(days=paid_days_ago)) if (status == "PAID" and paid_days_ago is not None) else None
    db.add(
        Invoice(
            request_id=request.id,
            client_id=client.id,
            invoice_number=f"INV-MAN-{request.track_number[-4:]}",
            status=status,
            amount=_money(amount) or Decimal("0.00"),
            currency="RUB",
            payer_display_name=client.full_name,
            payer_details_encrypted=None,
            issued_by_admin_user_id=lawyer.id if lawyer else None,
            issued_by_role=("LAWYER" if lawyer else "ADMIN"),
            issued_at=issued_at,
            paid_at=paid_at,
            responsible=(lawyer.name if lawyer else "Администратор системы"),
            created_at=issued_at,
            updated_at=(paid_at or issued_at),
        )
    )


def _write_access_file(
    admin: AdminUser,
    lawyers_by_email: dict[str, AdminUser],
    clients_by_phone: dict[str, Client],
    requests: list[Request],
) -> None:
    requests_by_phone: dict[str, list[Request]] = {}
    for row in requests:
        requests_by_phone.setdefault(str(row.client_phone), []).append(row)
    for rows in requests_by_phone.values():
        rows.sort(key=lambda r: str(r.track_number))

    topic_name_by_code = {code: name for code, name, _ in TOPICS}
    lawyer_by_id = {str(row.id): row for row in lawyers_by_email.values()}

    lines: list[str] = []
    lines.append("# Тестовые доступы для ручной проверки")
    lines.append("")
    lines.append("Сид: `app/data/manual_test_seed.py` (идемпотентный, пересоздает заявки `TRK-MAN-*`).")
    lines.append(f"Обновлено: `{datetime.now(UTC).strftime('%Y-%m-%d %H:%M:%S %Z')}`")
    lines.append("")
    lines.append("## Администратор")
    lines.append(f"- Email: `{admin.email}`")
    lines.append(f"- Пароль: `{settings.ADMIN_BOOTSTRAP_PASSWORD}`")
    lines.append(f"- Телефон: `{admin.phone or '-'}`")
    lines.append("")
    lines.append("## Юристы (4)")
    for item in LAWYERS:
        row = lawyers_by_email[item["email"]]
        lines.append(
            f"- {row.name}: `{row.email}` / `{LAWYER_PASSWORD}` | тел.: `{row.phone or '-'}` | "
            f"основная тема: `{topic_name_by_code.get(str(row.primary_topic_code or ''), row.primary_topic_code or '-')}`"
        )
    lines.append("")
    lines.append("## Клиенты (10) и заявки")
    lines.append("Для клиента вход через OTP (код выводится в backend-консоль в mock-режиме).")
    for full_name, phone in CLIENTS:
        client_rows = requests_by_phone.get(phone, [])
        lines.append(f"- {full_name} | тел.: `{phone}` | заявок: `{len(client_rows)}`")
        for req in client_rows:
            lawyer_name = "-"
            if req.assigned_lawyer_id and str(req.assigned_lawyer_id) in lawyer_by_id:
                lawyer_name = lawyer_by_id[str(req.assigned_lawyer_id)].name
            important = req.important_date_at.astimezone(UTC).strftime("%d.%m.%y %H:%M") if req.important_date_at else "-"
            lines.append(
                f"  - `{req.track_number}` | статус: `{req.status_code}` | тема: `{topic_name_by_code.get(str(req.topic_code or ''), req.topic_code or '-')}` "
                f"| юрист: `{lawyer_name}` | важная дата: `{important}`"
            )
    lines.append("")
    lines.append("## Примечания")
    lines.append("- В выборке есть неназначенные заявки, активные, ожидающие и терминальные статусы.")
    lines.append("- Есть заявки с оплаченными и ожидающими оплату счетами для проверки dashboard/финансов.")
    lines.append("- В активных заявках есть переписка и непрочитанные уведомления.")
    ACCESS_FILE_PATH.parent.mkdir(parents=True, exist_ok=True)
    ACCESS_FILE_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def seed_manual_test_data() -> dict[str, int]:
    db = SessionLocal()
    try:
        _ensure_bootstrap_admin(db)
        _ensure_topics(db)
        groups = _ensure_status_groups(db)
        _ensure_statuses(db, groups)
        lawyers_by_email = _ensure_lawyers(db)
        clients_by_phone = _ensure_clients(db)
        db.flush()

        created_requests = _rebuild_manual_requests(db, clients_by_phone, lawyers_by_email)
        db.commit()

        admin = db.query(AdminUser).filter(AdminUser.email == settings.ADMIN_BOOTSTRAP_EMAIL).first()
        if admin is None:
            raise RuntimeError("Bootstrap admin not found after seed")

        # refresh rows for final access file output
        final_requests = (
            db.query(Request)
            .filter(Request.track_number.like(f"{REQUEST_PREFIX}%"))
            .order_by(Request.track_number.asc())
            .all()
        )
        _write_access_file(admin, lawyers_by_email, clients_by_phone, final_requests)

        summary = {
            "clients": db.query(Client).filter(Client.phone.like(f"{CLIENT_PHONE_PREFIX}%")).count(),
            "lawyers": db.query(AdminUser).filter(AdminUser.email.like("lawyer%.manual@%")).count(),
            "requests": len(final_requests),
            "messages": db.query(Message).join(Request, Message.request_id == Request.id).filter(Request.track_number.like(f"{REQUEST_PREFIX}%")).count(),
            "status_history": db.query(StatusHistory).join(Request, StatusHistory.request_id == Request.id).filter(Request.track_number.like(f"{REQUEST_PREFIX}%")).count(),
            "invoices": db.query(Invoice).join(Request, Invoice.request_id == Request.id).filter(Request.track_number.like(f"{REQUEST_PREFIX}%")).count(),
            "notifications": db.query(Notification).join(Request, Notification.request_id == Request.id).filter(Request.track_number.like(f"{REQUEST_PREFIX}%")).count(),
        }
        print("manual seed summary:", summary)
        print("manual access file:", str(ACCESS_FILE_PATH))
        return summary
    finally:
        db.close()


if __name__ == "__main__":
    seed_manual_test_data()
