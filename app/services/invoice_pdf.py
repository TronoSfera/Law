from __future__ import annotations

from datetime import datetime
from typing import Any
import unicodedata


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
