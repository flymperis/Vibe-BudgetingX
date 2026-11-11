"""Excel export / template / import API: the old routes/data_io.py rules
(validation messages, error preview, all-or-nothing import, merge vs replace).
No old counterpart; these cover every branch of the ported route."""

import io
import re

from fastapi.testclient import TestClient
from openpyxl import load_workbook

from vbx.core import config
from vbx.core.excel_io import _build_migration_template_workbook

from .conftest import ApiClient, csrf_token, first_ids, get_connection, register_and_login, user_id

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _template():
    """The migration template, a valid importable workbook (one account
    "Main", categories "General", no movement rows)."""
    return _build_migration_template_workbook()


def _bytes(wb) -> bytes:
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _import(api, content, filename="data.xlsx", **form):
    return api.post("/api/import/excel", files={"file": (filename, content, XLSX)}, data=form)


def _count(sql, *params):
    conn = get_connection()
    try:
        return conn.execute(sql, params).fetchone()[0]
    finally:
        conn.close()


def test_export_and_template_are_attachments_and_need_login(client):
    assert client.get("/api/export/excel").status_code == 401
    assert client.get("/api/export/migration-template").status_code == 401
    api = register_and_login(client, "io-headers")
    resp = api.get("/api/export/excel")
    assert resp.headers["content-type"] == XLSX
    assert re.fullmatch(r'attachment; filename="budget-export-\d{8}-\d{4}\.xlsx"', resp.headers["content-disposition"])
    assert resp.headers["cache-control"] == "no-cache, max-age=0"
    resp = api.get("/api/export/migration-template")
    assert resp.headers["content-disposition"] == 'attachment; filename="budget-migration-template.xlsx"'
    wb = load_workbook(io.BytesIO(resp.content))
    assert config.SHEET_ACCOUNTS in wb.sheetnames and config.SHEET_RECURRING in wb.sheetnames


def test_export_only_contains_the_users_own_rows(client):
    api = register_and_login(client, "io-mine")
    cat, _inc, acc = first_ids("io-mine")
    api.post("/api/expenses", json={"notes": "mine-only", "amount": "-5", "category_id": cat, "account_id": acc})
    other = register_and_login(TestClient(client.app), "io-theirs")
    wb = load_workbook(io.BytesIO(other.get("/api/export/excel").content))
    values = [c for row in wb[config.SHEET_EXPENSES].iter_rows(values_only=True) for c in row]
    assert "mine-only" not in values


def test_import_needs_a_file(client):
    api = register_and_login(client, "io-nofile")
    resp = api.post("/api/import/excel", data={"replace_movements": "1"})
    assert resp.status_code == 400 and resp.json() == {"detail": "Choose an Excel file (.xlsx)."}
    resp = api.post("/api/import/excel", files={"file": ("   ", b"PK", XLSX)})
    assert resp.status_code == 400 and resp.json() == {"detail": "Choose an Excel file (.xlsx)."}
    # What a browser sends when no file is chosen: an empty text field named "file".
    resp = api.post("/api/import/excel", data={"file": ""})
    assert resp.status_code == 400 and resp.json() == {"detail": "Choose an Excel file (.xlsx)."}


def test_import_rejects_an_empty_or_unreadable_file(client):
    api = register_and_login(client, "io-badfile")
    resp = _import(api, b"")
    assert resp.status_code == 400 and resp.json() == {"detail": "The uploaded file is empty."}
    resp = _import(api, b"this is not a workbook")
    assert resp.status_code == 400
    assert resp.json()["detail"].startswith("Could not read the Excel file: ")


def test_import_reports_missing_sheets(client):
    api = register_and_login(client, "io-sheets")
    wb = _template()
    del wb[config.SHEET_INCOME]
    resp = _import(api, _bytes(wb))
    assert resp.status_code == 400
    assert resp.json() == {"detail": f"Import failed. Missing sheets: {config.SHEET_INCOME}"}


def test_import_errors_preview_the_first_eight(client):
    api = register_and_login(client, "io-many")
    wb = _template()
    for i in range(10):
        wb[config.SHEET_EXPENSES].append([f"row{i}", -1, None, "Main", "2026-01-05", None])
    resp = _import(api, _bytes(wb))
    assert resp.status_code == 400
    detail = resp.json()["detail"]
    assert detail.startswith(f"Import failed. {config.SHEET_EXPENSES} row 2: missing category_name; ")
    assert detail.endswith(f"{config.SHEET_EXPENSES} row 9: missing category_name (+2 more)")
    assert detail.count("missing category_name") == 8
    assert _count("SELECT COUNT(*) FROM expenses WHERE user_id = ?", user_id("io-many")) == 0


def test_a_failing_import_writes_nothing(client):
    """Errors found inside the transaction (accounts sheet) roll back what was
    already inserted for the same file."""
    api = register_and_login(client, "io-atomic")
    wb = _template()
    wb[config.SHEET_ACCOUNTS].append(["Brand new", 10, "bank", None, None, None])
    wb[config.SHEET_ACCOUNTS].append(["Broken", "abc", "bank", None, None, None])
    wb[config.SHEET_EXPENSES].append(["x", -3, "General", "Main", "2026-01-05", None])
    resp = _import(api, _bytes(wb))
    assert resp.status_code == 400
    assert resp.json()["detail"] == f"Import failed. {config.SHEET_ACCOUNTS} row 4: invalid opening_balance"
    uid = user_id("io-atomic")
    assert _count("SELECT COUNT(*) FROM accounts WHERE user_id = ? AND name = 'Brand new'", uid) == 0
    assert _count("SELECT COUNT(*) FROM expenses WHERE user_id = ?", uid) == 0


def test_merge_keeps_existing_rows_and_replace_swaps_them(client):
    api = register_and_login(client, "io-modes")
    uid = user_id("io-modes")
    cat, _inc, acc = first_ids("io-modes")
    api.post("/api/expenses", json={"notes": "existing", "amount": "-7", "category_id": cat, "account_id": acc})
    wb = _template()
    wb[config.SHEET_EXPENSES].append(["from file", -3, "General", "Main", "2026-01-05", None])
    wb[config.SHEET_ACCOUNTS].append(["Imported", 42, "bank", None, None, None])
    content = _bytes(wb)

    resp = _import(api, content)
    assert resp.status_code == 200
    assert resp.json() == {
        "ok": True,
        "message": "Import completed. Accounts/categories from the file were merged (new names added)."
        " Movement rows from the file were added (existing rows kept).",
    }
    notes = sorted(r[0] for r in _rows("SELECT notes FROM expenses WHERE user_id = ?", uid))
    assert notes == ["existing", "from file"]

    resp = _import(api, content, replace_movements="1")
    assert resp.status_code == 200
    assert resp.json()["message"] == (
        "Import completed. Accounts/categories from the file were merged (new names added)."
        " Existing expense and income rows were replaced by the file."
    )
    assert [r[0] for r in _rows("SELECT notes FROM expenses WHERE user_id = ?", uid)] == ["from file"]


def test_sync_opening_balances_only_when_asked(client):
    api = register_and_login(client, "io-sync")
    uid = user_id("io-sync")
    wb = _template()
    wb[config.SHEET_ACCOUNTS]["B2"] = 123.45  # Main's opening balance in the file
    content = _bytes(wb)
    assert _import(api, content, sync_opening_balances="0").status_code == 200
    assert _count("SELECT opening_balance FROM accounts WHERE user_id = ? AND name = 'Main'", uid) == 0
    assert _import(api, content, sync_opening_balances="1").status_code == 200
    assert _count("SELECT opening_balance FROM accounts WHERE user_id = ? AND name = 'Main'", uid) == 123.45


def test_import_needs_login_and_csrf(client):
    resp = client.post("/api/import/excel", files={"file": ("a.xlsx", b"PK", XLSX)})
    assert resp.status_code == 403  # CSRF is checked first, as for every non-GET
    anon = ApiClient(client, csrf_token(client))
    assert anon.post("/api/import/excel", files={"file": ("a.xlsx", b"PK", XLSX)}).status_code == 401
    api = register_and_login(client, "io-csrf")
    resp = client.post("/api/import/excel", files={"file": ("a.xlsx", b"PK", XLSX)})
    assert resp.status_code == 403
    assert api.post("/api/import/excel", files={"file": ("a.xlsx", b"", XLSX)}).status_code == 400


def _rows(sql, *params):
    conn = get_connection()
    try:
        return conn.execute(sql, params).fetchall()
    finally:
        conn.close()
