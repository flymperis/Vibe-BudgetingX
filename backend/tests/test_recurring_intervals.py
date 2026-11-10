"""Recurring rules that repeat every N weeks/months/years from a first date
(old tests/test_recurring_intervals.py).

Before intervals existed every rule posted once a calendar month, counted from
the month it was created and never on a date before its creation day. Rules
made back then must keep doing exactly that after the migration.

The old app posted due entries on every dashboard load (GET /); the API does
it on GET /api/bootstrap.
"""

import calendar
import io
from datetime import date, datetime, timedelta

from fastapi.testclient import TestClient
from openpyxl import load_workbook

from vbx.core import db
from vbx.core.finance import recurring_occurrences

from .conftest import get_connection, register_and_login


def _ids_for(username):
    conn = get_connection()
    uid = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()["id"]
    account_id = conn.execute("SELECT id FROM accounts WHERE user_id = ? ORDER BY id LIMIT 1", (uid,)).fetchone()["id"]
    category_id = conn.execute("SELECT id FROM categories WHERE user_id = ? ORDER BY id LIMIT 1", (uid,)).fetchone()[
        "id"
    ]
    conn.close()
    return uid, account_id, category_id


def _months_back(d, n, day=None):
    idx = d.year * 12 + d.month - 1 - n
    y, m = idx // 12, idx % 12 + 1
    return date(y, m, min(day or d.day, calendar.monthrange(y, m)[1]))


def _posted_dates(uid, note):
    conn = get_connection()
    rows = conn.execute(
        "SELECT spent_at FROM expenses WHERE user_id = ? AND notes = ? ORDER BY spent_at",
        (uid, f"[Recurring] {note}"),
    ).fetchall()
    conn.close()
    return [str(r["spent_at"])[:10] for r in rows]


def _add_rule(api, category_id, account_id, note, **fields):
    data = {
        "category_choice": f"e-{category_id}",
        "amount": "10",
        "account_id": str(account_id),
        "indefinitely": "1",
        "notes": note,
    }
    data.update(fields)
    return api.post("/api/recurring", json=data)


def _rule(note):
    conn = get_connection()
    row = conn.execute("SELECT * FROM recurring_entries WHERE notes = ?", (note,)).fetchone()
    conn.close()
    return row


def _load(api):
    """The old client.get("/"): posts every due recurring entry."""
    resp = api.get("/api/bootstrap")
    assert resp.status_code == 200
    return resp.json()


# --- the schedule itself -------------------------------------------------------


def test_weekly_occurrences_step_by_whole_weeks():
    start = date(2026, 1, 5)
    got = list(recurring_occurrences("week", 2, start, 5, date(2026, 2, 3)))
    assert got == [
        (date(2026, 1, 5), "2026-01-05"),
        (date(2026, 1, 19), "2026-01-19"),
        (date(2026, 2, 2), "2026-02-02"),
    ]


def test_monthly_occurrences_clamp_to_short_months():
    got = list(recurring_occurrences("month", 1, date(2026, 1, 31), 31, date(2026, 4, 30)))
    assert [d.isoformat() for d, _ in got] == ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]
    assert [k for _, k in got] == ["2026-01", "2026-02", "2026-03", "2026-04"]


def test_every_three_months_and_times_cap():
    got = list(recurring_occurrences("month", 3, date(2026, 11, 15), 15, date(2028, 1, 1), times=3))
    assert [d.isoformat() for d, _ in got] == ["2026-11-15", "2027-02-15", "2027-05-15"]


def test_yearly_on_leap_day_falls_back_to_feb_28():
    got = list(recurring_occurrences("year", 1, date(2024, 2, 29), 29, date(2028, 3, 1)))
    assert [d.isoformat() for d, _ in got] == ["2024-02-29", "2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]


# --- posting through the app ---------------------------------------------------


def test_weekly_rule_catches_up_from_a_past_first_date_once(client):
    api = register_and_login(client, "rec-weekly")
    uid, account_id, category_id = _ids_for("rec-weekly")
    today = date.today()
    start = today - timedelta(days=20)
    resp = _add_rule(
        api,
        category_id,
        account_id,
        "weekly gym",
        interval_unit="week",
        interval_count="1",
        start_date=start.isoformat(),
    )
    assert resp.status_code == 200
    assert resp.json()["message"] == "Recurring rule added."

    rule = _rule("weekly gym")
    assert (rule["interval_unit"], rule["interval_count"]) == ("week", 1)
    assert rule["start_date"] == start.isoformat()
    assert rule["day_of_month"] == start.day
    assert rule["not_before"] is None

    assert _load(api)["posted_recurring"] == 3
    expected = [(start + timedelta(days=d)).isoformat() for d in (0, 7, 14)]
    assert _posted_dates(uid, "weekly gym") == expected
    assert _load(api)["posted_recurring"] == 0
    assert _posted_dates(uid, "weekly gym") == expected


def test_every_two_weeks_and_every_three_months(client):
    api = register_and_login(client, "rec-multi")
    uid, account_id, category_id = _ids_for("rec-multi")
    today = date.today()
    start_w = today - timedelta(days=20)
    _add_rule(
        api,
        category_id,
        account_id,
        "fortnightly",
        interval_unit="week",
        interval_count="2",
        start_date=start_w.isoformat(),
    )
    start_m = _months_back(today, 7, day=1)
    _add_rule(
        api,
        category_id,
        account_id,
        "quarterly",
        interval_unit="month",
        interval_count="3",
        start_date=start_m.isoformat(),
    )
    start_y = _months_back(today, 24, day=min(today.day, 28))
    _add_rule(
        api,
        category_id,
        account_id,
        "yearly twice",
        interval_unit="year",
        interval_count="1",
        start_date=start_y.isoformat(),
        indefinitely="",
        months_to_run="2",
    )

    _load(api)
    assert _posted_dates(uid, "fortnightly") == [start_w.isoformat(), (start_w + timedelta(days=14)).isoformat()]
    assert _posted_dates(uid, "quarterly") == [_months_back(today, n, day=1).isoformat() for n in (7, 4, 1)]
    assert _posted_dates(uid, "yearly twice") == [
        start_y.isoformat(),
        _months_back(today, 12, day=start_y.day).isoformat(),
    ]


def test_future_first_date_posts_nothing_yet(client):
    api = register_and_login(client, "rec-future")
    uid, account_id, category_id = _ids_for("rec-future")
    start = date.today() + timedelta(days=3)
    _add_rule(
        api, category_id, account_id, "later", interval_unit="month", interval_count="1", start_date=start.isoformat()
    )
    _load(api)
    assert _posted_dates(uid, "later") == []


def test_invalid_interval_is_rejected(client):
    api = register_and_login(client, "rec-invalid")
    _, account_id, category_id = _ids_for("rec-invalid")
    for fields, message in (
        ({"interval_unit": "day", "interval_count": "1"}, "Repeat unit must be weeks, months or years."),
        ({"interval_unit": "week", "interval_count": "0"}, "Repeat every must be between 1 and 99."),
        ({"interval_unit": "week", "interval_count": "abc"}, "Repeat every must be a whole number."),
        ({"interval_unit": "week", "interval_count": "1", "start_date": ""}, "Choose the date of the first entry."),
    ):
        fields.setdefault("start_date", date.today().isoformat())
        resp = _add_rule(api, category_id, account_id, "bad rule", **fields)
        assert resp.status_code == 400, fields
        assert resp.json()["detail"] == message
        assert _rule("bad rule") is None, fields


def test_form_without_first_date_keeps_the_old_monthly_behaviour(client):
    """A client that only posts day_of_month gets today's month on that day,
    never back-dated before today — exactly the pre-interval rule."""
    api = register_and_login(client, "rec-noform")
    _, account_id, category_id = _ids_for("rec-noform")
    today = date.today()
    _add_rule(api, category_id, account_id, "old client", day_of_month="1")
    rule = _rule("old client")
    assert rule["interval_unit"] == "month" and rule["interval_count"] == 1
    assert rule["start_date"] == today.replace(day=1).isoformat()
    assert rule["not_before"] == today.isoformat()


# --- pre-interval rules after the migration -------------------------------------


def _legacy_due_dates(created_d, dom, months_to_run, today):
    """The posting loop as it was before intervals existed."""
    out = []
    y, m = created_d.year, created_d.month
    while (y, m) <= (today.year, today.month):
        month_index = (y - created_d.year) * 12 + (m - created_d.month) + 1
        if months_to_run is not None and month_index > months_to_run:
            break
        due = date(y, m, min(dom, calendar.monthrange(y, m)[1]))
        if created_d <= due <= today:
            out.append(due.isoformat())
        m += 1
        if m > 12:
            y, m = y + 1, 1
    return out


def test_migrated_monthly_rules_post_exactly_as_before(client):
    api = register_and_login(client, "rec-legacy")
    uid, account_id, category_id = _ids_for("rec-legacy")
    today = date.today()
    cases = []
    for back in (0, 1, 15, 40, 100, 400):
        for dom in sorted({1, 5, 15, 28, 31, today.day}):
            for months in (None, 1, 2, 3, 12):
                cases.append((today - timedelta(days=back), dom, months))

    conn = get_connection()
    for i, (created_d, dom, months) in enumerate(cases):
        # The columns default as they would for a row that predates them.
        conn.execute(
            """
            INSERT INTO recurring_entries
                (user_id, entry_type, amount, category_id, account_id, day_of_month,
                 months_to_run, notes, enabled, created_at)
            VALUES (?, 'expense', 5, ?, ?, ?, ?, ?, 1, ?)
            """,
            (uid, category_id, account_id, dom, months, f"legacy-{i}", f"{created_d.isoformat()} 13:45:00"),
        )
    db.backfill_recurring_start_dates(conn)
    conn.commit()
    conn.close()

    _load(api)
    for i, (created_d, dom, months) in enumerate(cases):
        assert _posted_dates(uid, f"legacy-{i}") == _legacy_due_dates(created_d, dom, months, today), (
            created_d,
            dom,
            months,
        )


def test_backfill_leaves_rules_with_a_start_date_alone(client):
    register_and_login(client, "rec-backfill")
    uid, acc, cat = _ids_for("rec-backfill")
    conn = get_connection()
    cur = conn.execute(
        """
        INSERT INTO recurring_entries
            (user_id, entry_type, amount, category_id, account_id, day_of_month,
             interval_unit, interval_count, start_date, notes, enabled)
        VALUES (?, 'expense', 5, ?, ?, 9, 'week', 3, '2025-01-09', 'untouched', 0)
        """,
        (uid, cat, acc),
    )
    db.backfill_recurring_start_dates(conn)
    row = conn.execute("SELECT start_date, not_before FROM recurring_entries WHERE id = ?", (cur.lastrowid,)).fetchone()
    conn.rollback()
    conn.close()
    assert (row["start_date"], row["not_before"]) == ("2025-01-09", None)


# --- editing ------------------------------------------------------------------


def _edit(api, rule_id, category_id, account_id, note, **fields):
    data = {
        "category_choice": f"e-{category_id}",
        "amount": "10",
        "account_id": str(account_id),
        "indefinitely": "1",
        "enabled": "1",
        "notes": note,
    }
    data.update(fields)
    resp = api.put(f"/api/recurring/{rule_id}", json=data)
    assert resp.status_code == 200, resp.text
    return resp


def test_switching_monthly_to_weekly_does_not_repost_the_past(client):
    api = register_and_login(client, "rec-switch")
    uid, account_id, category_id = _ids_for("rec-switch")
    today = date.today()
    start = _months_back(today, 3, day=1)
    _add_rule(
        api,
        category_id,
        account_id,
        "switcher",
        interval_unit="month",
        interval_count="1",
        start_date=start.isoformat(),
    )
    _load(api)
    monthly = _posted_dates(uid, "switcher")
    assert monthly == [_months_back(today, n, day=1).isoformat() for n in (3, 2, 1, 0)]

    rule = _rule("switcher")
    # Same first date, now weekly: the weeks the months already covered stay covered.
    _edit(
        api,
        rule["id"],
        category_id,
        account_id,
        "switcher",
        interval_unit="week",
        interval_count="1",
        start_date=start.isoformat(),
    )
    last_monthly = date.fromisoformat(monthly[-1])
    assert _rule("switcher")["not_before"] == (last_monthly + timedelta(days=1)).isoformat()

    _load(api)
    weekly_after = [
        (start + timedelta(weeks=k)).isoformat()
        for k in range(0, 30)
        if last_monthly < start + timedelta(weeks=k) <= today
    ]
    assert _posted_dates(uid, "switcher") == sorted(monthly + weekly_after)


def test_editing_only_the_amount_keeps_the_schedule(client):
    api = register_and_login(client, "rec-amount")
    uid, account_id, category_id = _ids_for("rec-amount")
    start = _months_back(date.today(), 2, day=1)
    _add_rule(
        api,
        category_id,
        account_id,
        "amount only",
        interval_unit="month",
        interval_count="2",
        start_date=start.isoformat(),
    )
    _load(api)
    before = _posted_dates(uid, "amount only")
    rule = _rule("amount only")
    resp = _edit(
        api,
        rule["id"],
        category_id,
        account_id,
        "amount only",
        amount="12",
        interval_unit="month",
        interval_count="2",
        start_date=start.isoformat(),
    )
    assert resp.json()["message"] == "Recurring rule updated."
    assert resp.json()["rule"]["amount"] == 12.0
    after = _rule("amount only")
    assert after["amount"] == 12.0
    assert after["not_before"] is None
    _load(api)
    assert _posted_dates(uid, "amount only") == before


def test_unchanged_first_date_keeps_a_day_past_the_month_end(client):
    """A pre-interval rule on the 31st created in February starts on the 28th;
    saving it unchanged must not move it to the 28th of every month."""
    api = register_and_login(client, "rec-dom31")
    uid, account_id, category_id = _ids_for("rec-dom31")
    conn = get_connection()
    conn.execute(
        """
        INSERT INTO recurring_entries
            (user_id, entry_type, amount, category_id, account_id, day_of_month, notes, enabled, created_at)
        VALUES (?, 'expense', 5, ?, ?, 31, 'end of month', 1, '2026-02-10 08:00:00')
        """,
        (uid, category_id, account_id),
    )
    db.backfill_recurring_start_dates(conn)
    conn.commit()
    conn.close()
    rule = _rule("end of month")
    assert rule["start_date"] == "2026-02-28"
    _edit(
        api,
        rule["id"],
        category_id,
        account_id,
        "end of month",
        interval_unit="month",
        interval_count="1",
        start_date="2026-02-28",
    )
    assert _rule("end of month")["day_of_month"] == 31


# --- export / import -------------------------------------------------------------

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _import(api, workbook_bytes):
    return api.post(
        "/api/import/excel",
        files={"file": ("budget-export.xlsx", workbook_bytes, XLSX)},
        data={"replace_movements": "1", "sync_opening_balances": "1"},
    )


def _expense_count(uid):
    conn = get_connection()
    n = conn.execute("SELECT COUNT(*) FROM expenses WHERE user_id = ?", (uid,)).fetchone()[0]
    conn.close()
    return n


def test_interval_round_trips_through_export_and_import(client, app):
    api = register_and_login(client, "rec-export-src")
    src_uid, account_id, category_id = _ids_for("rec-export-src")
    start = date.today() - timedelta(days=30)
    _add_rule(
        api,
        category_id,
        account_id,
        "biweekly",
        interval_unit="week",
        interval_count="2",
        start_date=start.isoformat(),
        indefinitely="",
        months_to_run="10",
    )
    _load(api)
    src_rule = _rule("biweekly")
    workbook_bytes = api.get("/api/export/excel").content

    other = register_and_login(TestClient(app), "rec-export-dst")
    dst_uid, _, _ = _ids_for("rec-export-dst")
    resp = _import(other, workbook_bytes)
    assert resp.status_code == 200, resp.text
    conn = get_connection()
    dst_rule = conn.execute(
        "SELECT * FROM recurring_entries WHERE user_id = ? AND notes = 'biweekly'", (dst_uid,)
    ).fetchone()
    applied = sorted(
        r["ym"] for r in conn.execute("SELECT ym FROM recurring_applied WHERE recurring_id = ?", (dst_rule["id"],))
    )
    conn.close()
    for col in ("interval_unit", "interval_count", "start_date", "not_before", "months_to_run", "day_of_month"):
        assert dst_rule[col] == src_rule[col], col
    assert applied == _posted_dates(src_uid, "biweekly")  # weekly keys are full dates

    count = _expense_count(dst_uid)
    _load(other)
    assert _expense_count(dst_uid) == count


def test_workbook_without_interval_columns_imports_as_monthly(client, app):
    api = register_and_login(client, "rec-v3-src")
    _, account_id, category_id = _ids_for("rec-v3-src")
    _add_rule(
        api,
        category_id,
        account_id,
        "v3 rent",
        interval_unit="month",
        interval_count="1",
        start_date=_months_back(date.today(), 2, day=1).isoformat(),
    )
    _load(api)
    wb = load_workbook(io.BytesIO(api.get("/api/export/excel").content))
    ws = wb["Recurring"]
    headers = [c.value for c in ws[1]]
    first_new = headers.index("interval_unit") + 1
    ws.delete_cols(first_new, len(headers) - first_new + 1)
    # A v3 export: created_at is when the rule was made, applied months as before.
    created_col = headers.index("created_at") + 1
    created = datetime(date.today().year, date.today().month, 1) - timedelta(days=70)
    ws.cell(row=2, column=created_col, value=created.strftime("%Y-%m-%d %H:%M:%S"))
    buf = io.BytesIO()
    wb.save(buf)

    other = register_and_login(TestClient(app), "rec-v3-dst")
    dst_uid, _, _ = _ids_for("rec-v3-dst")
    resp = _import(other, buf.getvalue())
    assert resp.status_code == 200, resp.text
    conn = get_connection()
    rule = conn.execute(
        "SELECT * FROM recurring_entries WHERE user_id = ? AND notes = 'v3 rent'", (dst_uid,)
    ).fetchone()
    conn.close()
    assert (rule["interval_unit"], rule["interval_count"]) == ("month", 1)
    expected_start, expected_floor = db.legacy_recurring_start(created.date(), rule["day_of_month"])
    assert (rule["start_date"], rule["not_before"]) == (expected_start, expected_floor)
