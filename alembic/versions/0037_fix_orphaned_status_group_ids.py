"""fix orphaned status_group_id references in statuses table

When a StatusGroup is deleted while statuses still reference it,
the status ends up with a status_group_id pointing to a non-existent row.
This causes the Kanban to render a phantom UUID column instead of a named group.

This migration reassigns any such orphaned statuses to the most appropriate
existing group using the same heuristic as fallback_group_for_status().

Revision ID: 0037_fix_orphaned_status_group_ids
Revises: 0036_message_author_admin_id
Create Date: 2026-04-06
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0037_fix_status_groups"
down_revision = "0036_message_author_admin_id"
branch_labels = None
depends_on = None

# Priority-ordered list of group names to use as fallback.
# The migration tries each in order and uses the first one found in the DB.
_WORK_GROUP_CANDIDATES = [
    "Юридический процесс",
    "В работе",
    "In Progress",
]
_NEW_GROUP_CANDIDATES = [
    "Новые",
    "New",
    "Входящие",
]
_DONE_GROUP_CANDIDATES = [
    "Завершены",
    "Closed",
    "Done",
]


def _first_group_id(conn, candidates):
    """Return the id of the first found StatusGroup whose name is in candidates."""
    for name in candidates:
        row = conn.execute(
            sa.text("SELECT id FROM status_groups WHERE name = :n LIMIT 1"),
            {"n": name},
        ).fetchone()
        if row:
            return str(row[0])
    return None


def upgrade() -> None:
    conn = op.get_bind()

    # Count orphaned statuses before fix
    orphaned = conn.execute(sa.text("""
        SELECT COUNT(*) FROM statuses
        WHERE status_group_id IS NOT NULL
          AND status_group_id NOT IN (SELECT id FROM status_groups)
    """)).scalar() or 0

    if orphaned == 0:
        return  # nothing to fix

    # Prefer the "В работе / Юридический процесс" group as the universal fallback
    work_id = _first_group_id(conn, _WORK_GROUP_CANDIDATES)
    if not work_id:
        # Last resort: use any existing group
        row = conn.execute(
            sa.text("SELECT id FROM status_groups ORDER BY sort_order ASC LIMIT 1")
        ).fetchone()
        work_id = str(row[0]) if row else None

    if not work_id:
        # No status groups at all — skip (shouldn't happen on a live system)
        return

    result = conn.execute(
        sa.text("""
            UPDATE statuses
            SET status_group_id = :gid
            WHERE status_group_id IS NOT NULL
              AND status_group_id NOT IN (SELECT id FROM status_groups)
        """),
        {"gid": work_id},
    )
    fixed = result.rowcount
    if fixed:
        print(f"\n[0037] Fixed {fixed} status(es) with orphaned status_group_id → reassigned to group {work_id}")


def downgrade() -> None:
    # Intentionally a no-op: we cannot restore the original deleted group ids.
    pass
