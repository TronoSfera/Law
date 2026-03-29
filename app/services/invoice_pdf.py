from __future__ import annotations

import io
import os
import unicodedata
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Any


REPORTLAB_AVAILABLE = True
try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.utils import ImageReader, simpleSplit
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.pdfgen import canvas
    from reportlab.platypus import Table, TableStyle
except Exception:
    REPORTLAB_AVAILABLE = False


_DEFAULT_ISSUER = 'ООО "Аудиторы корпоративной безопасности"'
_DEFAULT_ISSUER_ADDRESS = "г. Ярославль, ул. Богдановича, 6А"
_DEFAULT_ISSUER_PHONE = "+7 (977) 268-94-06"
_DEFAULT_ISSUER_INN = "7604226740"
_DEFAULT_ISSUER_KPP = "760401001"
_DEFAULT_ISSUER_OGRN = "1127604008806"
_DEFAULT_BANK_NAME = 'АО "АЛЬФА-БАНК"'
_DEFAULT_BANK_BIK = "044525593"
_DEFAULT_BANK_ACCOUNT = "40702810501860000582"
_DEFAULT_BANK_CORR_ACCOUNT = "30101810200000000593"
_DEFAULT_SIGNATURE_STAMP_IMAGE = "invoice_signature_stamp.png"
_DEFAULT_DIRECTOR_NAME = "Андрианова С.С."

_RU_MONTHS = [
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
]

_FONT_CANDIDATES: list[tuple[str, str | None]] = [
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    ("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"),
    ("/usr/share/fonts/truetype/freefont/FreeSans.ttf", "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf"),
    ("/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
    ("/System/Library/Fonts/Supplemental/Arial Unicode.ttf", None),
    ("/Library/Fonts/Arial.ttf", "/Library/Fonts/Arial Bold.ttf"),
    ("/Library/Fonts/Arial Unicode.ttf", None),
]
_FONT_CACHE: tuple[str, str] | None = None

_UNITS_MALE = ("", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять")
_UNITS_FEMALE = ("", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять")
_TEENS = (
    "десять",
    "одиннадцать",
    "двенадцать",
    "тринадцать",
    "четырнадцать",
    "пятнадцать",
    "шестнадцать",
    "семнадцать",
    "восемнадцать",
    "девятнадцать",
)
_TENS = ("", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто")
_HUNDREDS = ("", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот")
_SCALES = [
    ("", "", "", False),
    ("тысяча", "тысячи", "тысяч", True),
    ("миллион", "миллиона", "миллионов", False),
    ("миллиард", "миллиарда", "миллиардов", False),
]


def _ascii_text(value: Any) -> str:
    text = str(value or "")
    normalized = unicodedata.normalize("NFKD", text)
    return normalized.encode("ascii", "ignore").decode("ascii")


def _escape_pdf_text(value: str) -> str:
    return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _build_content_stream(lines: list[str]) -> bytes:
    safe_lines = [_escape_pdf_text(_ascii_text(line)) for line in lines]
    if not safe_lines:
        safe_lines = ["Invoice"]
    parts = ["BT", "/F1 11 Tf", "50 800 Td"]
    for index, line in enumerate(safe_lines):
        if index == 0:
            parts.append(f"({line}) Tj")
        else:
            parts.append("T*")
            parts.append(f"({line}) Tj")
    parts.append("ET")
    return "\n".join(parts).encode("latin-1", errors="ignore")


def _build_legacy_invoice_pdf_bytes(lines: list[str]) -> bytes:
    stream = _build_content_stream(lines)
    objects = [
        b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
        b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n",
        b"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n",
        b"4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
        f"5 0 obj << /Length {len(stream)} >> stream\n".encode("latin-1") + stream + b"\nendstream endobj\n",
    ]
    body = b"%PDF-1.4\n"
    offsets = [0]
    for obj in objects:
        offsets.append(len(body))
        body += obj
    xref_offset = len(body)
    body += f"xref\n0 {len(objects)+1}\n".encode("latin-1")
    body += b"0000000000 65535 f \n"
    for offset in offsets[1:]:
        body += f"{offset:010d} 00000 n \n".encode("latin-1")
    body += f"trailer << /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode("latin-1")
    return body


def _first_non_empty(source: dict[str, Any], *keys: str, default: str = "") -> str:
    for key in keys:
        value = source.get(key)
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return default


def _format_amount(value: float) -> str:
    amount = Decimal(str(value or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return f"{amount:.2f}"


def _format_amount_ru(value: float) -> str:
    amount = Decimal(str(value or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    integer_part = int(amount)
    fraction = int((amount - Decimal(integer_part)) * 100)
    grouped = f"{integer_part:,}".replace(",", " ")
    if fraction == 0:
        return grouped
    return f"{grouped},{fraction:02d}"


def _plural_ru(value: int, forms: tuple[str, str, str]) -> str:
    n = abs(int(value)) % 100
    if 11 <= n <= 19:
        return forms[2]
    n = n % 10
    if n == 1:
        return forms[0]
    if 2 <= n <= 4:
        return forms[1]
    return forms[2]


def _triplet_to_words(value: int, *, female: bool) -> list[str]:
    n = int(value) % 1000
    if n == 0:
        return []
    words: list[str] = []
    words.append(_HUNDREDS[n // 100])
    n = n % 100
    if 10 <= n <= 19:
        words.append(_TEENS[n - 10])
    else:
        words.append(_TENS[n // 10])
        unit_map = _UNITS_FEMALE if female else _UNITS_MALE
        words.append(unit_map[n % 10])
    return [word for word in words if word]


def _integer_to_words_ru(value: int) -> str:
    number = int(value)
    if number == 0:
        return "ноль"
    parts: list[str] = []
    scale_index = 0
    while number > 0:
        triplet = number % 1000
        if triplet:
            one, two, five, female = _SCALES[min(scale_index, len(_SCALES) - 1)]
            segment = _triplet_to_words(triplet, female=female)
            if scale_index > 0:
                segment.append(_plural_ru(triplet, (one, two, five)))
            parts.append(" ".join(segment))
        number //= 1000
        scale_index += 1
    return " ".join(reversed(parts)).strip()


def _amount_words_ru(amount: float) -> str:
    dec = Decimal(str(amount or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    rub = int(dec)
    kop = int((dec - Decimal(rub)) * 100)
    words = _integer_to_words_ru(rub)
    rub_label = _plural_ru(rub, ("рубль", "рубля", "рублей"))
    kop_label = _plural_ru(kop, ("копейка", "копейки", "копеек"))
    return f"{words} {rub_label} {kop:02d} {kop_label}".strip()


def _capitalize_first(text: str) -> str:
    value = str(text or "").strip()
    if not value:
        return ""
    return value[0].upper() + value[1:]


def _format_invoice_date(value: datetime | None) -> str:
    dt = value or datetime.now()
    month = _RU_MONTHS[max(0, min(11, dt.month - 1))]
    return f"{dt.day:02d} {month} {dt.year} г."


def _resolve_reportlab_fonts() -> tuple[str, str]:
    global _FONT_CACHE
    if _FONT_CACHE is not None:
        return _FONT_CACHE

    regular_name = "Helvetica"
    bold_name = "Helvetica-Bold"
    for regular_path, bold_path in _FONT_CANDIDATES:
        if not os.path.exists(regular_path):
            continue
        try:
            regular_name = "InvoiceSans"
            pdfmetrics.registerFont(TTFont(regular_name, regular_path))
            if bold_path and os.path.exists(bold_path):
                bold_name = "InvoiceSansBold"
                pdfmetrics.registerFont(TTFont(bold_name, bold_path))
            else:
                bold_name = regular_name
            _FONT_CACHE = (regular_name, bold_name)
            return _FONT_CACHE
        except Exception:
            regular_name = "Helvetica"
            bold_name = "Helvetica-Bold"

    _FONT_CACHE = (regular_name, bold_name)
    return _FONT_CACHE


def _resolve_signature_stamp_image_path(req: dict[str, Any]) -> str:
    provided = _first_non_empty(
        req,
        "signature_stamp_image_path",
        "signature_stamp_path",
        "signature_image_path",
        default="",
    )
    local_default = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets", _DEFAULT_SIGNATURE_STAMP_IMAGE)
    candidates = [provided, local_default, f"/app/app/assets/{_DEFAULT_SIGNATURE_STAMP_IMAGE}"]
    for path in candidates:
        candidate = str(path or "").strip()
        if candidate and os.path.exists(candidate):
            return candidate
    return ""


def _display_invoice_number(raw_number: str, issued_at: datetime | None) -> str:
    value = str(raw_number or "").strip()
    if not value:
        return (issued_at or datetime.now()).strftime("%Y%m%d")
    upper = value.upper()
    if upper.startswith("INV-"):
        tail = value[4:]
        if len(tail) >= 8 and tail[:8].isdigit():
            date_part = tail[:8]
            remainder = tail[8:]
            if not remainder:
                return date_part
            if remainder.startswith("-"):
                suffix = remainder[1:]
                if suffix.isdigit():
                    return f"{date_part}-{suffix}"
                return date_part
            return date_part
    return value


def _draw_wrapped_line(pdf: Any, *, text: str, x: float, y: float, width: float, font: str, size: int, leading: float) -> float:
    lines = simpleSplit(str(text or ""), font, size, width) or [""]
    pdf.setFont(font, size)
    cursor = y
    for line in lines:
        pdf.drawString(x, cursor, line)
        cursor -= leading
    return cursor


def _build_reportlab_invoice_pdf_bytes(
    *,
    invoice_number: str,
    amount: float,
    currency: str,
    status: str,
    issued_at: datetime | None,
    paid_at: datetime | None,
    payer_display_name: str,
    request_track_number: str,
    issued_by_name: str | None,
    requisites: dict[str, Any] | None,
) -> bytes:
    regular_font, bold_font = _resolve_reportlab_fonts()
    req = dict(requisites or {})

    issuer_name = _first_non_empty(req, "issuer_name", "beneficiary_name", "recipient_name", default=_DEFAULT_ISSUER)
    issuer_address = _first_non_empty(req, "issuer_address", "address", default=_DEFAULT_ISSUER_ADDRESS)
    issuer_phone = _first_non_empty(req, "issuer_phone", "phone", default=_DEFAULT_ISSUER_PHONE)
    issuer_inn = _first_non_empty(req, "issuer_inn", "inn", default=_DEFAULT_ISSUER_INN)
    issuer_kpp = _first_non_empty(req, "issuer_kpp", "kpp", default=_DEFAULT_ISSUER_KPP)
    issuer_ogrn = _first_non_empty(req, "issuer_ogrn", "ogrn", default=_DEFAULT_ISSUER_OGRN)
    bank_name = _first_non_empty(req, "bank_name", "bank", default=_DEFAULT_BANK_NAME)
    bank_bik = _first_non_empty(req, "bank_bik", "bik", default=_DEFAULT_BANK_BIK)
    bank_account = _first_non_empty(req, "bank_account", "account", default=_DEFAULT_BANK_ACCOUNT)
    bank_corr_account = _first_non_empty(req, "bank_corr_account", "corr_account", default=_DEFAULT_BANK_CORR_ACCOUNT)
    service_description = _first_non_empty(req, "service_description", "service", "template_rendered", default="Юридические услуги")
    vat_note = _first_non_empty(req, "vat_note", default="без НДС")
    director_name = _DEFAULT_DIRECTOR_NAME
    signature_stamp_image_path = _resolve_signature_stamp_image_path(req)

    amount_text = _format_amount_ru(amount)
    amount_words = _capitalize_first(_amount_words_ru(amount))
    issue_date = issued_at or datetime.now()
    invoice_number_display = _display_invoice_number(invoice_number, issue_date)
    issue_date_compact = issue_date.strftime("%d.%m.%Y")

    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    page_width, page_height = A4
    left = 15 * mm
    content_width = page_width - 30 * mm
    cursor_y = page_height - 13 * mm

    # Header block close to the supplied invoice sample.
    pdf.setFillColorRGB(0.17, 0.35, 0.40)
    pdf.setFont(bold_font, 18)
    pdf.drawCentredString(page_width / 2, cursor_y, "АУДИТОРЫ КОРПОРАТИВНОЙ БЕЗОПАСНОСТИ")
    cursor_y -= 6.5 * mm
    pdf.setFillColorRGB(0, 0, 0)
    pdf.setFont(bold_font, 7)
    pdf.drawCentredString(page_width / 2, cursor_y, "О Б Щ Е С Т В О  С  О Г Р А Н И Ч Е Н Н О Й  О Т В Е Т С Т В Е Н Н О С Т Ь Ю")
    cursor_y -= 4.6 * mm
    pdf.setFont(regular_font, 8)
    pdf.drawCentredString(page_width / 2, cursor_y, "Россия, 150014, Ярославль, ул. Богдановича, 6А")
    cursor_y -= 2.2 * mm
    pdf.line(left, cursor_y, page_width - left, cursor_y)
    cursor_y -= 6.2 * mm

    pdf.setFont(bold_font, 10)
    pdf.drawString(left + 1 * mm, cursor_y, "Образец заполнения платежного поручения")
    cursor_y -= 2.2 * mm

    bank_table = Table(
        [
            [f"ИНН {issuer_inn}", f"КПП {issuer_kpp}", "", "Сч. №", bank_account],
            [f"Получатель\n{issuer_name}", "", "", "", ""],
            [f"Банк получателя\n{bank_name}", "", "", "БИК", bank_bik],
            ["", "", "", "Сч. №", bank_corr_account],
        ],
        colWidths=[37 * mm, 34 * mm, 39 * mm, 25 * mm, 50 * mm],
    )
    bank_table.setStyle(
        TableStyle(
            [
                ("FONT", (0, 0), (-1, -1), regular_font, 9),
                ("FONT", (0, 0), (2, 0), bold_font, 8),
                ("GRID", (0, 0), (-1, -1), 0.7, colors.black),
                ("SPAN", (1, 0), (2, 0)),
                ("SPAN", (0, 1), (2, 1)),
                ("SPAN", (0, 2), (2, 3)),
                ("SPAN", (3, 0), (3, 1)),
                ("SPAN", (4, 0), (4, 1)),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ALIGN", (3, 0), (3, -1), "CENTER"),
                ("ALIGN", (4, 0), (4, -1), "LEFT"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    _, bank_table_height = bank_table.wrap(content_width, cursor_y)
    bank_table.drawOn(pdf, left, cursor_y - bank_table_height)
    cursor_y -= bank_table_height + 5.5 * mm

    pdf.setFont(bold_font, 13)
    pdf.drawCentredString(page_width / 2, cursor_y, f"СЧЕТ № {invoice_number_display} от {issue_date_compact} года")
    cursor_y -= 6.2 * mm

    details_table = Table(
        [
            ["Исполнитель", issuer_name],
            ["Адрес", issuer_address],
            ["Телефон", issuer_phone],
            ["Расчетный счет", bank_account],
            ["Банк", bank_name],
            ["БИК", bank_bik],
            ["Корр. счет", bank_corr_account],
            ["ИНН", issuer_inn],
            ["КПП", issuer_kpp],
            ["ОГРН", issuer_ogrn],
        ],
        colWidths=[30 * mm, content_width - 30 * mm],
    )
    details_table.setStyle(
        TableStyle(
            [
                ("FONT", (0, 0), (-1, -1), regular_font, 9),
                ("GRID", (0, 0), (-1, -1), 0.7, colors.black),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    _, details_table_height = details_table.wrap(content_width, cursor_y)
    details_table.drawOn(pdf, left, cursor_y - details_table_height)
    cursor_y -= details_table_height + 5 * mm

    pdf.line(left, cursor_y, page_width - left, cursor_y)
    cursor_y -= 2.4 * mm

    item_name_width = 95 * mm - 8
    wrapped_service = "\n".join(simpleSplit(service_description, regular_font, 9, item_name_width) or [service_description])

    item_table = Table(
        [
            ["№\nПП", "Наименование", "Кол-во", "Цена\n(за единицу)", "ВСЕГО"],
            ["1", wrapped_service, "1", amount_text, amount_text],
            ["ВСЕГО", "", "", "", amount_text],
        ],
        colWidths=[13 * mm, 95 * mm, 18 * mm, 27 * mm, 28 * mm],
    )
    item_table.setStyle(
        TableStyle(
            [
                ("FONT", (0, 0), (-1, -1), regular_font, 9),
                ("FONT", (0, 0), (-1, 0), bold_font, 9),
                ("FONT", (0, 2), (4, 2), bold_font, 9),
                ("GRID", (0, 0), (-1, -1), 0.7, colors.black),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ALIGN", (0, 0), (0, -1), "CENTER"),
                ("ALIGN", (2, 0), (4, -1), "CENTER"),
                ("ALIGN", (3, 1), (4, -1), "RIGHT"),
                ("SPAN", (0, 2), (3, 2)),
                ("ALIGN", (0, 2), (3, 2), "LEFT"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    _, item_table_height = item_table.wrap(content_width, cursor_y)
    item_table.drawOn(pdf, left, cursor_y - item_table_height)
    cursor_y -= item_table_height + 5.5 * mm

    pdf.setFont(regular_font, 9)
    prefix = "Сумма прописью: "
    pdf.drawString(left, cursor_y, prefix)
    prefix_width = pdfmetrics.stringWidth(prefix, regular_font, 9)
    pdf.setFont(bold_font, 10)
    pdf.drawString(left + prefix_width, cursor_y, f"{amount_words} ({vat_note}).")
    cursor_y -= 10 * mm

    block_width = min(155 * mm, content_width)
    block_left = left + (content_width - block_width) / 2
    block_center_x = block_left + block_width / 2
    block_top = cursor_y
    signature_name = director_name or _DEFAULT_DIRECTOR_NAME

    pdf.setFont(regular_font, 11)
    pdf.drawString(block_left + 2 * mm, block_top, "С уважением,")
    pdf.drawString(block_left + 2 * mm, block_top - 13 * mm, "Генеральный директор")
    pdf.drawString(block_left + 2 * mm, block_top - 19 * mm, "ООО «АКБ»")
    pdf.drawString(block_left + block_width - 35 * mm, block_top - 19 * mm, signature_name)

    if signature_stamp_image_path:
        try:
            stamp_image = ImageReader(signature_stamp_image_path)
            img_w, img_h = stamp_image.getSize()
            target_h = 40 * mm
            target_w = target_h * (float(img_w) / max(float(img_h), 1.0))
            x = block_center_x - target_w / 2
            y = max(12 * mm, block_top - 43 * mm)
            pdf.drawImage(stamp_image, x, y, width=target_w, height=target_h, mask="auto")
            pdf.setFont(regular_font, 11)
            pdf.drawString(x + target_w + 3 * mm, y + 6 * mm, "МП")
        except Exception:
            pdf.drawString(block_center_x + 28 * mm, block_top - 19 * mm, "МП")
    else:
        pdf.drawString(block_center_x + 28 * mm, block_top - 19 * mm, "МП")

    pdf.showPage()
    pdf.save()
    return buffer.getvalue()


def build_invoice_pdf_bytes(
    *,
    invoice_number: str,
    amount: float,
    currency: str,
    status: str,
    issued_at: datetime | None,
    paid_at: datetime | None,
    payer_display_name: str,
    request_track_number: str,
    issued_by_name: str | None,
    requisites: dict[str, Any] | None,
) -> bytes:
    if REPORTLAB_AVAILABLE:
        try:
            return _build_reportlab_invoice_pdf_bytes(
                invoice_number=invoice_number,
                amount=amount,
                currency=currency,
                status=status,
                issued_at=issued_at,
                paid_at=paid_at,
                payer_display_name=payer_display_name,
                request_track_number=request_track_number,
                issued_by_name=issued_by_name,
                requisites=requisites,
            )
        except Exception:
            # Safety fallback for environments without fonts/reportlab internals.
            pass

    lines = [
        f"Invoice: {invoice_number}",
        f"Request: {request_track_number}",
        f"Payer: {payer_display_name}",
        f"Amount: {amount:.2f} {currency}",
        f"Status: {status}",
        f"Issued at: {issued_at.isoformat() if issued_at else '-'}",
        f"Paid at: {paid_at.isoformat() if paid_at else '-'}",
        f"Issued by: {issued_by_name or '-'}",
        "Requisites:",
    ]
    req = dict(requisites or {})
    if req:
        for key in sorted(req.keys()):
            lines.append(f"{key}: {req.get(key)}")
    else:
        lines.append("-")
    return _build_legacy_invoice_pdf_bytes(lines)
