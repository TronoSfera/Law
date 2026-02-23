from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.data.quotes_justice_seed import JUSTICE_QUOTES
from app.db.session import SessionLocal
from app.models.quote import Quote


def upsert_quotes(db: Session, quotes: list[dict]) -> tuple[int, int]:
    created = 0
    updated = 0

    for index, item in enumerate(quotes, start=1):
        author = str(item["author"]).strip()
        text = str(item["text"]).strip()
        source = str(item.get("source") or "").strip() or None
        sort_order = int(item.get("sort_order") or index)
        is_active = bool(item.get("is_active", True))

        row = db.query(Quote).filter(Quote.author == author, Quote.text == text).first()
        if row is None:
            db.add(
                Quote(
                    author=author,
                    text=text,
                    source=source,
                    sort_order=sort_order,
                    is_active=is_active,
                )
            )
            created += 1
            continue

        changed = False
        if row.source != source:
            row.source = source
            changed = True
        if row.sort_order != sort_order:
            row.sort_order = sort_order
            changed = True
        if row.is_active != is_active:
            row.is_active = is_active
            changed = True

        if changed:
            row.updated_at = datetime.now(timezone.utc)
            db.add(row)
            updated += 1

    db.commit()
    return created, updated


def main() -> None:
    db = SessionLocal()
    try:
        created, updated = upsert_quotes(db, JUSTICE_QUOTES)
        total = db.query(Quote).count()
    finally:
        db.close()
    print(f"quotes upsert done: created={created}, updated={updated}, total={total}")


if __name__ == "__main__":
    main()
