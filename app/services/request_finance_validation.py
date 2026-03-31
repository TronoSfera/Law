from __future__ import annotations

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any

from fastapi import HTTPException

_REQUEST_MONEY_SPECS: dict[str, tuple[str, int]] = {
    "effective_rate": ("Ставка (фикс.)", 10),
    "request_cost": ("Стоимость заявки", 12),
    "invoice_amount": ("Сумма счета", 12),
}
_MONEY_STEP = Decimal("0.01")


def normalize_request_financial_payload_or_400(payload: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(payload)
    for field_name, (label, max_integer_digits) in _REQUEST_MONEY_SPECS.items():
        if field_name not in normalized:
            continue
        normalized[field_name] = _normalize_money_value_or_400(
            normalized.get(field_name),
            label=label,
            max_integer_digits=max_integer_digits,
        )
    return normalized


def request_financial_data_error_or_400() -> HTTPException:
    return HTTPException(
        status_code=400,
        detail="Изменения не сохранены: проверьте числовые поля заявки. Сумма или ставка слишком большие либо имеют некорректный формат.",
    )


def _normalize_money_value_or_400(raw: Any, *, label: str, max_integer_digits: int) -> float | None:
    if raw is None or raw == "":
        return None
    try:
        value = Decimal(str(raw).strip())
    except (InvalidOperation, ValueError):
        raise HTTPException(status_code=400, detail=f'Поле "{label}" должно быть числом')
    if not value.is_finite():
        raise HTTPException(status_code=400, detail=f'Поле "{label}" должно быть числом')
    if value < 0:
        raise HTTPException(status_code=400, detail=f'Поле "{label}" не может быть отрицательным')

    text = format(value.copy_abs(), "f")
    integer_part, _, fraction_part = text.partition(".")
    significant_integer = integer_part.lstrip("0") or "0"
    if len(significant_integer) > max_integer_digits:
        raise HTTPException(
            status_code=400,
            detail=f'Поле "{label}" слишком большое. Допустимо не более {max_integer_digits} цифр до запятой и 2 после.',
        )
    if len(fraction_part.rstrip("0")) > 2:
        raise HTTPException(status_code=400, detail=f'Поле "{label}" должно содержать не более 2 знаков после запятой')

    return float(value.quantize(_MONEY_STEP, rounding=ROUND_HALF_UP))
