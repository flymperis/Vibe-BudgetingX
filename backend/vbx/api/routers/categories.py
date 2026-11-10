"""Expense categories (/api/categories) and income categories
(/api/income-categories), ported from the old routes/categories.py.

Deleting a category that still has entries or recurring rules is refused with
the old message; the check and the delete share one connection, and get_db
always closes it, so a refused delete can never leave the database locked.
"""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter

from ..deps import DB, User
from ..errors import ApiError
from ..schemas.categories import CategoryIn, CategoryListOut, CategoryOut
from ..schemas.common import OkOut

router = APIRouter(tags=["categories"])

# kind -> (table, recurring entry_type, ledger table, noun, noun_plural)
_KINDS = {
    "expense": ("categories", "expense", "expenses", "expense", "expenses"),
    "income": ("income_categories", "income", "income_entries", "income entry", "income entries"),
}

NOT_FOUND = "Category not found."
NAME_REQUIRED = "Enter a name."
NAME_TAKEN = "A category with that name already exists."


def _count_references(conn, category_id, user_id, *, entry_type):
    """How many rows would be orphaned by deleting this category (old
    routes/categories.py, unchanged): ledger rows carry a real foreign key,
    recurring_entries.category_id has none but is blocked on all the same."""
    ledger_table = "expenses" if entry_type == "expense" else "income_entries"
    ledger = conn.execute(
        f"SELECT COUNT(*) FROM {ledger_table} WHERE category_id = ? AND user_id = ?",
        (category_id, user_id),
    ).fetchone()[0]
    rules = conn.execute(
        "SELECT COUNT(*) FROM recurring_entries WHERE category_id = ? AND user_id = ? AND entry_type = ?",
        (category_id, user_id, entry_type),
    ).fetchone()[0]
    return int(ledger), int(rules)


def _describe_blockers(ledger_count, rule_count, noun, noun_plural):
    parts = []
    if ledger_count:
        parts.append(f"{ledger_count} {noun if ledger_count == 1 else noun_plural}")
    if rule_count:
        parts.append(f"{rule_count} recurring rule{'' if rule_count == 1 else 's'}")
    return " and ".join(parts)


def _list(conn, kind: str, uid: int) -> CategoryListOut:
    table, entry_type, ledger_table, _noun, _plural = _KINDS[kind]
    rows = conn.execute(
        f"""
        SELECT
            c.id,
            c.name,
            (SELECT COUNT(*) FROM {ledger_table} l WHERE l.category_id = c.id AND l.user_id = c.user_id)
                AS entry_count,
            (SELECT COUNT(*) FROM recurring_entries r
             WHERE r.category_id = c.id AND r.user_id = c.user_id AND r.entry_type = ?) AS rule_count
        FROM {table} c
        WHERE c.user_id = ?
        ORDER BY c.name
        """,
        (entry_type, uid),
    ).fetchall()
    return CategoryListOut(items=[_out(r) for r in rows])


def _out(row) -> CategoryOut:
    entries, rules = int(row["entry_count"]), int(row["rule_count"])
    return CategoryOut(
        id=int(row["id"]),
        name=row["name"],
        entry_count=entries,
        rule_count=rules,
        can_delete=not entries and not rules,
    )


def _get(conn, kind: str, category_id: int, uid: int) -> CategoryOut:
    table, entry_type, _ledger, _noun, _plural = _KINDS[kind]
    row = conn.execute(f"SELECT id, name FROM {table} WHERE id = ? AND user_id = ?", (category_id, uid)).fetchone()
    if row is None:
        raise ApiError(404, NOT_FOUND)
    entries, rules = _count_references(conn, category_id, uid, entry_type=entry_type)
    return CategoryOut(
        id=int(row["id"]), name=row["name"], entry_count=entries, rule_count=rules, can_delete=not entries and not rules
    )


def _name(body: CategoryIn) -> str:
    name = (body.name or "").strip()
    if not name:
        # The old form route silently ignored a blank name.
        raise ApiError(400, NAME_REQUIRED)
    return name


def _add(conn, kind: str, body: CategoryIn, uid: int) -> CategoryOut:
    table = _KINDS[kind][0]
    name = _name(body)
    cur = conn.execute(f"INSERT OR IGNORE INTO {table}(user_id, name) VALUES (?, ?)", (uid, name))
    conn.commit()
    if cur.rowcount == 0:
        # INSERT OR IGNORE hit UNIQUE(user_id, name): the old route redirected
        # as if it had worked.
        raise ApiError(400, NAME_TAKEN)
    return _get(conn, kind, int(cur.lastrowid), uid)


def _edit(conn, kind: str, category_id: int, body: CategoryIn, uid: int) -> CategoryOut:
    table = _KINDS[kind][0]
    name = _name(body)
    try:
        cur = conn.execute(
            f"UPDATE {table} SET name = ? WHERE id = ? AND user_id = ?",
            (name, category_id, uid),
        )
    except sqlite3.IntegrityError:
        # Old app: unhandled IntegrityError (500) when renaming onto an existing name.
        conn.rollback()
        raise ApiError(400, NAME_TAKEN) from None
    if cur.rowcount == 0:
        raise ApiError(404, NOT_FOUND)
    conn.commit()
    return _get(conn, kind, category_id, uid)


def _delete(conn, kind: str, category_id: int, uid: int) -> OkOut:
    """The old _delete_category: refuse rather than fail when rows still point at it."""
    table, entry_type, _ledger, noun, noun_plural = _KINDS[kind]
    label = "That category"
    try:
        row = conn.execute(
            f"SELECT name FROM {table} WHERE id = ? AND user_id = ?",
            (category_id, uid),
        ).fetchone()
        if row is None:
            raise ApiError(404, NOT_FOUND)
        label = row["name"]

        ledger_count, rule_count = _count_references(conn, category_id, uid, entry_type=entry_type)
        if ledger_count or rule_count:
            blockers = _describe_blockers(ledger_count, rule_count, noun, noun_plural)
            raise ApiError(
                400,
                f"“{label}” still has {blockers}. "
                f"Reassign or delete {'them' if ledger_count + rule_count > 1 else 'it'} first.",
            )

        cursor = conn.execute(
            f"DELETE FROM {table} WHERE id = ? AND user_id = ?",
            (category_id, uid),
        )
        conn.commit()
        if cursor.rowcount == 0:
            raise ApiError(404, NOT_FOUND)
    except sqlite3.IntegrityError:
        conn.rollback()
        raise ApiError(
            400,
            f"“{label}” is still in use, so it was not deleted. Reassign or delete its entries first.",
        ) from None
    return OkOut()


# --- expense categories -------------------------------------------------------


@router.get("/categories", response_model=CategoryListOut)
def list_categories(user: User, conn: DB):
    return _list(conn, "expense", user.id)


@router.post("/categories", response_model=CategoryOut)
def add_category(body: CategoryIn, user: User, conn: DB):
    return _add(conn, "expense", body, user.id)


@router.put("/categories/{category_id}", response_model=CategoryOut)
def edit_category(category_id: int, body: CategoryIn, user: User, conn: DB):
    return _edit(conn, "expense", category_id, body, user.id)


@router.delete("/categories/{category_id}", response_model=OkOut)
def delete_category(category_id: int, user: User, conn: DB):
    return _delete(conn, "expense", category_id, user.id)


# --- income categories --------------------------------------------------------


@router.get("/income-categories", response_model=CategoryListOut)
def list_income_categories(user: User, conn: DB):
    return _list(conn, "income", user.id)


@router.post("/income-categories", response_model=CategoryOut)
def add_income_category(body: CategoryIn, user: User, conn: DB):
    return _add(conn, "income", body, user.id)


@router.put("/income-categories/{category_id}", response_model=CategoryOut)
def edit_income_category(category_id: int, body: CategoryIn, user: User, conn: DB):
    return _edit(conn, "income", category_id, body, user.id)


@router.delete("/income-categories/{category_id}", response_model=OkOut)
def delete_income_category(category_id: int, user: User, conn: DB):
    return _delete(conn, "income", category_id, user.id)
