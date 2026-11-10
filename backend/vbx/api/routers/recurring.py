"""Recurring rules, ported from the old routes/recurring.py (writes) and the
recurring list of routes/dashboard.py::index.

Like the old app, due entries are posted on the next dashboard load, which in
the API is GET /api/bootstrap (finance.apply_recurring_entries)."""

from __future__ import annotations

from datetime import date, datetime, timedelta

from fastapi import APIRouter

from vbx.core.db import legacy_recurring_start
from vbx.core.finance import last_posted_recurring_date
from vbx.core.helpers import (
    _parse_category_choice,
    _parse_recurring_duration,
    _parse_recurring_schedule,
    _recurring_category_ok,
    normalize_day_of_month,
)

from ..deps import DB, User
from ..errors import ApiError
from ..schemas.common import OkOut
from ..schemas.recurring import RecurringIn, RecurringListOut, RecurringOut, RecurringSavedOut

router = APIRouter(prefix="/recurring", tags=["recurring"])

NOT_FOUND = "Rule not found."

_SELECT = """
    SELECT
        r.id,
        r.entry_type,
        r.amount,
        r.category_id,
        r.account_id,
        r.day_of_month,
        r.months_to_run,
        r.interval_unit,
        r.interval_count,
        r.start_date,
        r.notes,
        r.enabled,
        r.created_at,
        a.name AS account_name,
        COALESCE(c.name, ic.name) AS category_name
    FROM recurring_entries r
    JOIN accounts a ON a.id = r.account_id
    LEFT JOIN categories c ON r.entry_type = 'expense' AND c.id = r.category_id
    LEFT JOIN income_categories ic ON r.entry_type = 'income' AND ic.id = r.category_id
"""


def _out(row) -> RecurringOut:
    data = dict(row)
    data["category_choice"] = f"{'e' if data['entry_type'] == 'expense' else 'i'}-{data['category_id']}"
    data["enabled"] = bool(data["enabled"])
    data["created_at"] = None if data["created_at"] is None else str(data["created_at"])
    data["notes"] = data["notes"] or ""
    return RecurringOut(**data)


def _get(conn, rule_id: int, uid: int) -> RecurringOut:
    row = conn.execute(f"{_SELECT} WHERE r.id = ? AND r.user_id = ?", (rule_id, uid)).fetchone()
    if row is None:
        raise ApiError(404, NOT_FOUND)
    return _out(row)


def _form(body: RecurringIn) -> dict:
    """The JSON body as the old form mapping. Keys that were not sent (or are
    null) are missing, so "start_date" not in form keeps its old meaning;
    booleans become the checkbox value "1" (true) or "" (false)."""
    form = {}
    for key, value in body.model_dump(exclude_unset=True).items():
        if value is None:
            continue
        if isinstance(value, bool):
            value = "1" if value else ""
        form[key] = str(value)
    return form


def _read_rule_form(conn, uid, form):
    """Validated fields shared by add and edit, or raise ValueError with the
    message (old routes/recurring.py, with request.form -> form)."""
    entry_type, category_id = _parse_category_choice(form.get("category_choice"))
    amount_raw = form.get("amount", "").strip()
    account_raw = form.get("account_id", "").strip()
    if not entry_type or category_id is None or not account_raw:
        raise ValueError("Choose type, category, and account.")
    if not _recurring_category_ok(conn, entry_type, category_id, uid):
        raise ValueError("Invalid category for that type.")
    try:
        account_id = int(account_raw)
        amt = abs(float(amount_raw))
    except (TypeError, ValueError):
        raise ValueError("Invalid amount or account.") from None
    if not conn.execute(
        "SELECT 1 FROM accounts WHERE id = ? AND user_id = ?",
        (account_id, uid),
    ).fetchone():
        raise ValueError("Invalid account.")
    months_to_run = _parse_recurring_duration(form)
    unit, count, start_date = _parse_recurring_schedule(form)
    if amt <= 0:
        raise ValueError("Amount must be positive.")
    return {
        "entry_type": entry_type,
        "category_id": category_id,
        "account_id": account_id,
        "amount": amt,
        "months_to_run": months_to_run,
        "interval_unit": unit,
        "interval_count": count,
        "start_date": start_date,
        "notes": form.get("notes", "").strip(),
    }


def _validated(conn, uid, form) -> dict:
    try:
        return _read_rule_form(conn, uid, form)
    except ValueError as exc:
        raise ApiError(400, str(exc)) from None


@router.get("", response_model=RecurringListOut)
def list_recurring(user: User, conn: DB):
    rows = conn.execute(f"{_SELECT} WHERE r.user_id = ? ORDER BY r.day_of_month, r.id", (user.id,)).fetchall()
    return RecurringListOut(items=[_out(r) for r in rows])


@router.post("", response_model=RecurringSavedOut)
def add_recurring(body: RecurringIn, user: User, conn: DB):
    uid = user.id
    form = _form(body)
    rule = _validated(conn, uid, form)

    if rule["start_date"] is None:
        # No first-date field: the original behaviour — from this month on the
        # chosen day, never back-dated before today.
        dom = normalize_day_of_month(form.get("day_of_month", "1"))
        start_date, not_before = legacy_recurring_start(datetime.now().date(), dom)
    else:
        # The first date is the first entry; a past date catches up from there.
        start_date, not_before = rule["start_date"], None
        dom = date.fromisoformat(start_date).day

    cur = conn.execute(
        """
        INSERT INTO recurring_entries (
            user_id, entry_type, amount, category_id, account_id, day_of_month, months_to_run,
            interval_unit, interval_count, start_date, not_before, notes, enabled
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        """,
        (
            uid,
            rule["entry_type"],
            rule["amount"],
            rule["category_id"],
            rule["account_id"],
            dom,
            rule["months_to_run"],
            rule["interval_unit"],
            rule["interval_count"],
            start_date,
            not_before,
            rule["notes"],
        ),
    )
    conn.commit()
    return RecurringSavedOut(rule=_get(conn, int(cur.lastrowid), uid), message="Recurring rule added.")


@router.put("/{recurring_id}", response_model=RecurringSavedOut)
def edit_recurring(recurring_id: int, body: RecurringIn, user: User, conn: DB):
    uid = user.id
    form = _form(body)
    enabled = 1 if form.get("enabled") == "1" else 0
    existing = conn.execute(
        """
        SELECT day_of_month, interval_unit, interval_count, start_date, not_before
        FROM recurring_entries WHERE id = ? AND user_id = ?
        """,
        (recurring_id, uid),
    ).fetchone()
    if existing is None:
        raise ApiError(404, NOT_FOUND)
    rule = _validated(conn, uid, form)

    if rule["start_date"] is None:
        start_date = existing["start_date"]
        dom = normalize_day_of_month(form.get("day_of_month", existing["day_of_month"]))
    elif rule["start_date"] == existing["start_date"]:
        # Unchanged first date: keep the stored day, which can be later than
        # the first date's (a rule on the 31st that started in February).
        start_date, dom = existing["start_date"], existing["day_of_month"]
    else:
        start_date = rule["start_date"]
        dom = date.fromisoformat(start_date).day

    not_before = existing["not_before"]
    schedule_changed = (rule["interval_unit"], rule["interval_count"], start_date, dom) != (
        existing["interval_unit"],
        existing["interval_count"],
        existing["start_date"],
        existing["day_of_month"],
    )
    if schedule_changed:
        # The new schedule's past dates are not in recurring_applied, so
        # without a floor the next load would re-post everything the old
        # schedule already covered. Only post what falls after its last entry.
        last = last_posted_recurring_date(conn, recurring_id, existing["day_of_month"])
        if last is not None:
            floor = (last + timedelta(days=1)).isoformat()
            not_before = max(not_before or floor, floor)

    conn.execute(
        """
        UPDATE recurring_entries
        SET entry_type = ?, amount = ?, category_id = ?, account_id = ?, day_of_month = ?, months_to_run = ?,
            interval_unit = ?, interval_count = ?, start_date = ?, not_before = ?, notes = ?, enabled = ?
        WHERE id = ? AND user_id = ?
        """,
        (
            rule["entry_type"],
            rule["amount"],
            rule["category_id"],
            rule["account_id"],
            dom,
            rule["months_to_run"],
            rule["interval_unit"],
            rule["interval_count"],
            start_date,
            not_before,
            rule["notes"],
            enabled,
            recurring_id,
            uid,
        ),
    )
    conn.commit()
    return RecurringSavedOut(rule=_get(conn, recurring_id, uid), message="Recurring rule updated.")


@router.delete("/{recurring_id}", response_model=OkOut)
def delete_recurring(recurring_id: int, user: User, conn: DB):
    cur = conn.execute(
        "DELETE FROM recurring_entries WHERE id = ? AND user_id = ?",
        (recurring_id, user.id),
    )
    if cur.rowcount == 0:
        raise ApiError(404, NOT_FOUND)
    conn.commit()
    return OkOut(message="Recurring rule removed.")
