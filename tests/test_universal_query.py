import unittest
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import Boolean, Date, DateTime, Float, Integer, Numeric, String, create_engine
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

from app.schemas.universal import FilterClause, Page, UniversalQuery
from app.services.universal_query import _coerce_filter_value, apply_universal_query


class _Base(DeclarativeBase):
    pass


class _QueryTestModel(_Base):
    __tablename__ = "_uq_test_model"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bool_col: Mapped[bool] = mapped_column(Boolean)
    int_col: Mapped[int] = mapped_column(Integer)
    float_col: Mapped[float] = mapped_column(Float)
    numeric_col: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    date_col: Mapped[date] = mapped_column(Date)
    dt_col: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    uuid_col: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True))
    text_col: Mapped[str] = mapped_column(String(50))


class _ApplyBase(DeclarativeBase):
    pass


class _ApplyQueryModel(_ApplyBase):
    __tablename__ = "_uq_apply_test_model"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False))


class UniversalQueryCoercionTests(unittest.TestCase):
    def test_boolean_accepts_string_values(self):
        self.assertTrue(_coerce_filter_value(_QueryTestModel.bool_col, "true"))
        self.assertTrue(_coerce_filter_value(_QueryTestModel.bool_col, "Да"))
        self.assertFalse(_coerce_filter_value(_QueryTestModel.bool_col, "0"))
        self.assertFalse(_coerce_filter_value(_QueryTestModel.bool_col, "нет"))

    def test_boolean_invalid_value_raises_400(self):
        with self.assertRaises(HTTPException) as ctx:
            _coerce_filter_value(_QueryTestModel.bool_col, "maybe")
        self.assertEqual(ctx.exception.status_code, 400)

    def test_numbers_accept_string_values(self):
        self.assertEqual(_coerce_filter_value(_QueryTestModel.int_col, "42"), 42)
        self.assertAlmostEqual(_coerce_filter_value(_QueryTestModel.float_col, "3.14"), 3.14)
        self.assertAlmostEqual(_coerce_filter_value(_QueryTestModel.float_col, "3,14"), 3.14)
        self.assertEqual(_coerce_filter_value(_QueryTestModel.numeric_col, "99.50"), Decimal("99.50"))

    def test_dates_accept_iso_date_and_datetime(self):
        self.assertEqual(_coerce_filter_value(_QueryTestModel.date_col, "2026-02-26"), date(2026, 2, 26))
        self.assertEqual(
            _coerce_filter_value(_QueryTestModel.date_col, "2026-02-26T13:45:00+03:00"),
            date(2026, 2, 26),
        )

    def test_datetime_accepts_date_only_and_makes_it_timezone_aware(self):
        value = _coerce_filter_value(_QueryTestModel.dt_col, "2026-02-26")
        self.assertIsInstance(value, datetime)
        self.assertEqual(value.date(), date(2026, 2, 26))
        self.assertIsNotNone(value.tzinfo)
        self.assertEqual(value.tzinfo, timezone.utc)

    def test_datetime_accepts_iso_datetime(self):
        value = _coerce_filter_value(_QueryTestModel.dt_col, "2026-02-26T10:15:00+03:00")
        self.assertIsInstance(value, datetime)
        self.assertEqual(value.year, 2026)
        self.assertIsNotNone(value.tzinfo)

    def test_uuid_accepts_string(self):
        uid = uuid.uuid4()
        self.assertEqual(_coerce_filter_value(_QueryTestModel.uuid_col, str(uid)), uid)

    def test_uuid_invalid_raises_400(self):
        with self.assertRaises(HTTPException) as ctx:
            _coerce_filter_value(_QueryTestModel.uuid_col, "not-a-uuid")
        self.assertEqual(ctx.exception.status_code, 400)

    def test_text_is_left_as_is(self):
        self.assertEqual(_coerce_filter_value(_QueryTestModel.text_col, "abc"), "abc")


class UniversalQueryApplyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine("sqlite+pysqlite:///:memory:")
        _ApplyBase.metadata.create_all(cls.engine)
        with Session(cls.engine) as session:
            session.add_all(
                [
                    _ApplyQueryModel(id=1, title="prev-day", created_at=datetime(2026, 2, 25, 23, 59, 59)),
                    _ApplyQueryModel(id=2, title="same-day-morning", created_at=datetime(2026, 2, 26, 9, 30, 0)),
                    _ApplyQueryModel(id=3, title="same-day-evening", created_at=datetime(2026, 2, 26, 23, 59, 59)),
                    _ApplyQueryModel(id=4, title="next-day", created_at=datetime(2026, 2, 27, 0, 0, 0)),
                ]
            )
            session.commit()

    @classmethod
    def tearDownClass(cls):
        cls.engine.dispose()

    def test_datetime_equal_date_uses_day_range(self):
        with Session(self.engine) as session:
            uq = UniversalQuery(
                filters=[FilterClause(field="created_at", op="=", value="2026-02-26")],
                sort=[],
                page=Page(limit=50, offset=0),
            )
            q = apply_universal_query(session.query(_ApplyQueryModel), _ApplyQueryModel, uq)
            rows = q.order_by(_ApplyQueryModel.id.asc()).all()
        self.assertEqual([row.id for row in rows], [2, 3])

    def test_datetime_not_equal_date_excludes_whole_day(self):
        with Session(self.engine) as session:
            uq = UniversalQuery(
                filters=[FilterClause(field="created_at", op="!=", value="2026-02-26")],
                sort=[],
                page=Page(limit=50, offset=0),
            )
            q = apply_universal_query(session.query(_ApplyQueryModel), _ApplyQueryModel, uq)
            rows = q.order_by(_ApplyQueryModel.id.asc()).all()
        self.assertEqual([row.id for row in rows], [1, 4])

    def test_datetime_equal_full_timestamp_stays_exact(self):
        with Session(self.engine) as session:
            uq = UniversalQuery(
                filters=[FilterClause(field="created_at", op="=", value="2026-02-26T09:30:00")],
                sort=[],
                page=Page(limit=50, offset=0),
            )
            q = apply_universal_query(session.query(_ApplyQueryModel), _ApplyQueryModel, uq)
            rows = q.order_by(_ApplyQueryModel.id.asc()).all()
        self.assertEqual([row.id for row in rows], [2])


if __name__ == "__main__":
    unittest.main()
