from __future__ import annotations

import argparse

from app.db.session import SessionLocal
from app.services.test_data_cleanup import CleanupSpec, cleanup_test_data


def main() -> None:
    parser = argparse.ArgumentParser(description="Cleanup E2E / test artifacts from development DB")
    parser.add_argument("--track", action="append", dest="tracks", default=[], help="Track number to cleanup (repeatable)")
    parser.add_argument("--phone", action="append", dest="phones", default=[], help="Phone to cleanup (repeatable)")
    parser.add_argument("--email", action="append", dest="emails", default=[], help="Email to cleanup (repeatable)")
    parser.add_argument(
        "--no-default-patterns",
        action="store_true",
        help="Disable cleanup by default E2E patterns (use only explicit track/phone/email values)",
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        result = cleanup_test_data(
            db,
            CleanupSpec(
                track_numbers=args.tracks,
                phones=args.phones,
                emails=args.emails,
                include_default_e2e_patterns=not bool(args.no_default_patterns),
            ),
        )
        print(result)
    finally:
        db.close()


if __name__ == "__main__":
    main()
