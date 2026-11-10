"""Export -> import round trip, through GET /api/export/excel and
POST /api/import/excel. Ported from the old tests/test_export_import_roundtrip.py.

Version 1 of the export only covered accounts, categories, expenses and income,
so transfers, investments and recurring rules were silently dropped by a
backup/restore cycle - and because transfers move money between accounts, the
restored balances were wrong too. Version 2 adds those sheets.

The old test seeded through the web forms; here the same rows are written with
the SQL those routes ran (other domains' APIs are not this file's subject), and
"loading the dashboard" is finance.apply_recurring_entries + commit, which is
what the old dashboard did on every load.
"""

import io
from datetime import datetime

from fastapi.testclient import TestClient
from openpyxl import Workbook, load_workbook

from vbx.core import config, excel_io
from vbx.core.db import legacy_recurring_start
from vbx.core.finance import apply_recurring_entries

from .conftest import get_connection, register_and_login

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _ids_for(username):
    conn = get_connection()
    uid = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()["id"]
    account_id = conn.execute("SELECT id FROM accounts WHERE user_id = ? ORDER BY id LIMIT 1", (uid,)).fetchone()["id"]
    category_id = conn.execute("SELECT id FROM categories WHERE user_id = ? ORDER BY id LIMIT 1", (uid,)).fetchone()[
        "id"
    ]
    conn.close()
    return uid, account_id, category_id


def _load_dashboard(uid):
    """What the old GET / did first: post due recurring entries."""
    conn = get_connection()
    try:
        if apply_recurring_entries(conn, uid) > 0:
            conn.commit()
    finally:
        conn.close()


def _seed_everything(username):
    """One row of every kind the app stores (same values the old test posted)."""
    uid, account_id, category_id = _ids_for(username)
    today = datetime.now().date()
    conn = get_connection()
    try:
        conn.execute("INSERT INTO accounts (user_id, name, opening_balance) VALUES (?, 'Savings', 250.0)", (uid,))
        savings_id = conn.execute("SELECT id FROM accounts WHERE user_id = ? AND name = 'Savings'", (uid,)).fetchone()[
            "id"
        ]
        income_cat_id = conn.execute(
            "SELECT id FROM income_categories WHERE user_id = ? ORDER BY id LIMIT 1", (uid,)
        ).fetchone()["id"]
        conn.execute(
            "INSERT INTO expenses (user_id, notes, amount, category_id, account_id, spent_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (uid, "groceries", -42.5, category_id, account_id, today.isoformat()),
        )
        conn.execute(
            "INSERT INTO income_entries (user_id, notes, amount, category_id, account_id, received_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (uid, "paycheck", 2000.0, income_cat_id, account_id, today.isoformat()),
        )
        conn.execute(
            "INSERT INTO account_transfers (user_id, from_account_id, to_account_id, amount, transferred_at, notes) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (uid, account_id, savings_id, 300.0, "2026-05-04", "to savings"),
        )
        conn.execute(
            """INSERT INTO stock_transactions
               (user_id, symbol, ticker, instrument_name, tx_type, quantity, price_per_unit, fee, broker,
                transacted_at, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                uid,
                "VUAA.DE",
                "VUAA",
                "Vanguard S&P 500",
                "buy",
                4.0,
                92.15,
                1.2,
                "Freedom24",
                "2026-02-11",
                "monthly buy",
            ),
        )
        conn.execute(
            """INSERT INTO crypto_transactions
               (user_id, coin_id, coin_symbol, coin_name, tx_type, quantity, price_per_unit, fee, exchange,
                transacted_at, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (uid, "bitcoin", "BTC", "Bitcoin", "buy", 0.125, 41000.0, 5.0, "Kraken", "2026-03-09", "dca"),
        )
        # Due today: a rule only posts for months where created_at <= due <=
        # today, so any other day of the month would leave applied_months empty.
        dom = today.day
        start_date, not_before = legacy_recurring_start(today, dom)
        conn.execute(
            """INSERT INTO recurring_entries (
                   user_id, entry_type, amount, category_id, account_id, day_of_month, months_to_run,
                   interval_unit, interval_count, start_date, not_before, notes, enabled)
               VALUES (?, 'expense', 800.0, ?, ?, ?, NULL, 'month', 1, ?, ?, 'rent', 1)""",
            (uid, category_id, account_id, dom, start_date, not_before),
        )
        conn.commit()
    finally:
        conn.close()
    # Loading the dashboard posts the recurring rule for the due months, which
    # is what fills recurring_applied.
    _load_dashboard(uid)


def _snapshot(uid):
    conn = get_connection()
    out = {
        "accounts": [
            (r["name"], r["opening_balance"])
            for r in conn.execute("SELECT name, opening_balance FROM accounts WHERE user_id = ? ORDER BY name", (uid,))
        ],
        "transfers": [
            (r["amount"], r["transferred_at"], r["notes"])
            for r in conn.execute(
                "SELECT amount, transferred_at, notes FROM account_transfers WHERE user_id = ? ORDER BY id",
                (uid,),
            )
        ],
        "stocks": [
            (r["symbol"], r["tx_type"], r["quantity"], r["price_per_unit"], r["fee"], r["broker"])
            for r in conn.execute(
                "SELECT symbol, tx_type, quantity, price_per_unit, fee, broker FROM stock_transactions "
                "WHERE user_id = ? ORDER BY id",
                (uid,),
            )
        ],
        "crypto": [
            (r["coin_id"], r["tx_type"], r["quantity"], r["price_per_unit"], r["exchange"])
            for r in conn.execute(
                "SELECT coin_id, tx_type, quantity, price_per_unit, exchange FROM crypto_transactions "
                "WHERE user_id = ? ORDER BY id",
                (uid,),
            )
        ],
        "recurring": [
            (r["entry_type"], r["amount"], r["day_of_month"], r["notes"], r["enabled"])
            for r in conn.execute(
                "SELECT entry_type, amount, day_of_month, notes, enabled FROM recurring_entries "
                "WHERE user_id = ? ORDER BY id",
                (uid,),
            )
        ],
        "applied_months": sorted(
            r["ym"]
            for r in conn.execute(
                """
                SELECT ra.ym FROM recurring_applied ra
                JOIN recurring_entries r ON r.id = ra.recurring_id
                WHERE r.user_id = ?
                """,
                (uid,),
            )
        ),
        "expense_count": conn.execute("SELECT COUNT(*) n FROM expenses WHERE user_id = ?", (uid,)).fetchone()["n"],
    }
    conn.close()
    return out


def _import(api, content, filename="budget-export.xlsx", **form):
    return api.post("/api/import/excel", files={"file": (filename, content, XLSX)}, data=form)


def test_export_covers_every_sheet(client):
    api = register_and_login(client, "exportall")
    _seed_everything("exportall")

    wb = load_workbook(io.BytesIO(api.get("/api/export/excel").content))
    for sheet in (
        config.SHEET_ACCOUNTS,
        config.SHEET_EXPENSE_CATEGORIES,
        config.SHEET_INCOME_CATEGORIES,
        config.SHEET_EXPENSES,
        config.SHEET_INCOME,
        config.SHEET_TRANSFERS,
        config.SHEET_STOCKS,
        config.SHEET_CRYPTO,
        config.SHEET_RECURRING,
        config.SHEET_BUDGETS,
    ):
        assert sheet in wb.sheetnames, f"export is missing the {sheet} sheet"

    # every added sheet actually carries its row, not just a header
    for sheet in (config.SHEET_TRANSFERS, config.SHEET_STOCKS, config.SHEET_CRYPTO, config.SHEET_RECURRING):
        assert wb[sheet].max_row >= 2, f"{sheet} exported no rows"

    applied = wb[config.SHEET_RECURRING].cell(row=2, column=len(excel_io.RECURRING_COLUMNS)).value
    assert applied, "recurring rule exported without its applied_months history"


def test_export_import_round_trip_preserves_everything(client, app):
    api = register_and_login(client, "roundtripsrc")
    _seed_everything("roundtripsrc")
    src_uid, _, _ = _ids_for("roundtripsrc")
    before = _snapshot(src_uid)
    workbook_bytes = api.get("/api/export/excel").content

    other = register_and_login(TestClient(app), "roundtripdst")
    dst_uid, _, _ = _ids_for("roundtripdst")

    resp = _import(other, workbook_bytes, replace_movements="1", sync_opening_balances="1")
    assert resp.status_code == 200, resp.text
    assert "Import failed" not in resp.text

    after = _snapshot(dst_uid)
    for key in ("accounts", "transfers", "stocks", "crypto", "recurring", "applied_months"):
        assert after[key] == before[key], f"{key} did not survive the round trip"


def test_restored_recurring_rule_does_not_repost(client, app):
    """The applied-month history has to come across, or the next dashboard load
    re-posts every month back to the rule's creation date."""
    api = register_and_login(client, "repostsrc")
    _seed_everything("repostsrc")
    workbook_bytes = api.get("/api/export/excel").content

    other = register_and_login(TestClient(app), "repostdst")
    dst_uid, _, _ = _ids_for("repostdst")
    _import(other, workbook_bytes, replace_movements="1", sync_opening_balances="1")
    right_after_import = _snapshot(dst_uid)["expense_count"]

    _load_dashboard(dst_uid)  # triggers apply_recurring_entries
    assert _snapshot(dst_uid)["expense_count"] == right_after_import


def test_version_1_workbook_still_imports(client):
    """Older exports have none of the sheets added in version 2."""
    api = register_and_login(client, "v1import")
    uid, _, _ = _ids_for("v1import")

    wb = Workbook()
    meta = wb.active
    meta.title = config.SHEET_META
    meta.append(["key", "value"])
    meta.append(["format_version", 1])
    wb.create_sheet(config.SHEET_ACCOUNTS).append(["name", "opening_balance"])
    wb[config.SHEET_ACCOUNTS].append(["Main", 0])
    wb.create_sheet(config.SHEET_EXPENSE_CATEGORIES).append(["name"])
    wb[config.SHEET_EXPENSE_CATEGORIES].append(["General"])
    wb.create_sheet(config.SHEET_INCOME_CATEGORIES).append(["name"])
    wb[config.SHEET_INCOME_CATEGORIES].append(["General"])
    wb.create_sheet(config.SHEET_EXPENSES).append(
        ["notes", "amount", "category_name", "account_name", "spent_at", "created_at"]
    )
    wb[config.SHEET_EXPENSES].append(["old expense", -10.0, "General", "Main", "2026-01-05", None])
    wb.create_sheet(config.SHEET_INCOME).append(
        ["notes", "amount", "category_name", "account_name", "received_at", "created_at"]
    )

    buf = io.BytesIO()
    wb.save(buf)
    resp = _import(api, buf.getvalue(), filename="old-export.xlsx")
    assert resp.status_code == 200, resp.text
    assert "Import failed" not in resp.text

    conn = get_connection()
    row = conn.execute("SELECT amount FROM expenses WHERE user_id = ? AND notes = 'old expense'", (uid,)).fetchone()
    conn.close()
    assert row is not None and row["amount"] == -10.0
