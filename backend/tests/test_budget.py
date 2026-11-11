"""Per-category monthly budgets: defaults, one-month overrides, and where they
show up (old tests/test_budget.py, through /api/budget, /api/home, /api/summary).

Other domains' routes the old tests used (categories add/delete, Excel export/
import) are replaced by direct SQL / vbx.core.excel_io calls (tests/helpers_budget.py)."""

import io
from datetime import date

from fastapi.testclient import TestClient
from openpyxl import load_workbook

from vbx.core import budget
from vbx.core.excel_io import _build_migration_template_workbook

from .conftest import get_connection, register_and_login
from .helpers_budget import (
    add_category,
    call,
    core_summary,
    delete_category,
    export_bytes,
    import_bytes,
    refund,
    spend,
    user,
    workbook_bytes,
)

# ---------------------------------------------------------------------------
# API helpers
# ---------------------------------------------------------------------------


def _toggle(api, enabled):
    resp = api.post("/api/budget/toggle", json={"enabled": enabled})
    assert resp.status_code == 200, resp.text
    return resp


def _defaults(api, amounts=None, fixed=None, **extra):
    body = {"amounts": {str(k): v for k, v in (amounts or {}).items()}}
    if fixed:
        body["fixed"] = {str(k): v for k, v in fixed.items()}
    body.update(extra)
    return api.post("/api/budget/defaults", json=body)


def _override(api, category_id, month, amount=None, clear=None):
    body = {"category_id": category_id, "month": month}
    if amount is not None:
        body["amount"] = amount
    if clear is not None:
        body["clear"] = clear
    return api.post("/api/budget/override", json=body)


def _clear(api, month):
    return api.post("/api/budget/clear-month", json={"month": month})


def _panel(api, month):
    resp = api.get("/api/budget", params={"month": month})
    assert resp.status_code == 200, resp.text
    return resp.json()


def _row(summary, category_id):
    return next((r for r in summary["rows"] if r["category_id"] == category_id), None)


def _scalar(sql, params=()):
    conn = get_connection()
    try:
        return conn.execute(sql, params).fetchone()
    finally:
        conn.close()


def _history(uid, ym, **kwargs):
    return call(budget.spending_history, uid, ym, **kwargs)


def _load(data):
    return load_workbook(io.BytesIO(data))


# ---------------------------------------------------------------------------
# Toggle, defaults, overrides
# ---------------------------------------------------------------------------


def test_toggle_enables_and_disables(client):
    api = register_and_login(client, "budgettoggle")
    uid, _, _ = user("budgettoggle")

    panel = _panel(api, "2026-05")
    # Disabled: the old panel only offered "Enable budgeting".
    assert panel["enabled"] is False and panel["summary"] is None and panel["form_rows"] == []

    assert _toggle(api, True).json() == {"ok": True, "message": "Budgeting enabled."}
    assert call(budget.is_enabled, uid)
    panel = _panel(api, "2026-05")
    assert panel["enabled"] is True and panel["summary"] is not None  # "Monthly budgets" shown

    assert _toggle(api, False).json() == {"ok": True, "message": "Budgeting disabled."}
    assert not call(budget.is_enabled, uid)


def test_toggle_accepts_the_old_form_value_and_anything_else_disables(client):
    api = register_and_login(client, "budgettoggle-values")
    uid, _, _ = user("budgettoggle-values")
    for value, expected in (("1", True), (0, False), (1, True), ("yes", False), (True, True), (None, False)):
        _toggle(api, value)
        assert call(budget.is_enabled, uid) is expected, value
    api.post("/api/budget/toggle", json={})  # field omitted: disables, like the old form
    assert not call(budget.is_enabled, uid)


def test_default_and_override_drive_the_month(client):
    api = register_and_login(client, "budgetmath")
    uid, cats, account_id = user("budgetmath")
    general, other = cats["General"], cats["Other"]
    _toggle(api, True)
    resp = _defaults(api, {general: "100", other: ""})
    assert resp.json() == {"ok": True, "message": "Monthly budgets saved."}

    spend(uid, general, account_id, 85, "2026-03-10")
    spend(uid, general, account_id, 30, "2026-04-02")
    spend(uid, other, account_id, 12, "2026-03-11")

    march = _panel(api, "2026-03")["summary"]
    row = _row(march, general)
    assert row["budget"] == 100 and row["spent"] == 85 and row["remaining"] == 15
    assert row["status"] == "warn"
    # Other has no budget: listed separately and kept out of the totals.
    assert _row(march, other) is None
    assert [r["name"] for r in march["unbudgeted"]] == ["Other"]
    assert march["total_budget"] == 100 and march["total_spent"] == 85

    _override(api, general, "2026-03", "80")
    march = _panel(api, "2026-03")["summary"]
    assert _row(march, general)["budget"] == 80
    assert (_row(march, general)["override"], _row(march, general)["default"]) == (80, 100)
    assert _row(march, general)["status"] == "over"
    # The override is for March only.
    april = _panel(api, "2026-04")["summary"]
    assert _row(april, general)["budget"] == 100
    assert _row(april, general)["status"] == "ok"

    resp = _override(api, general, "2026-03", clear="1")
    assert resp.json()["message"] == "Budget for this month reset to the default."
    assert _row(_panel(api, "2026-03")["summary"], general)["budget"] == 100

    # Blank default removes the budget.
    _defaults(api, {general: ""})
    assert _panel(api, "2026-04")["summary"]["rows"] == []
    assert core_summary(uid, "2026-04")["rows"] == []


def test_negative_amount_is_rejected_without_partial_save(client):
    api = register_and_login(client, "budgetbad")
    uid, cats, _ = user("budgetbad")
    _toggle(api, True)
    resp = _defaults(api, {cats["General"]: "50", cats["Other"]: "-5"})
    assert resp.status_code == 400
    assert resp.json() == {"detail": "Budget amounts must be numbers of zero or more."}
    assert call(budget.default_budgets, uid) == {}


def test_cannot_budget_someone_elses_category(client, app):
    register_and_login(client, "budgetowner")
    _, owner_cats, _ = user("budgetowner")

    intruder = register_and_login(TestClient(app), "budgetintruder")
    intruder_uid, _, _ = user("budgetintruder")
    resp = _override(intruder, owner_cats["General"], "2026-03", "5")
    assert resp.status_code == 404 and resp.json() == {"detail": "Category not found."}
    resp = _defaults(intruder, {owner_cats["General"]: "5"})
    assert resp.status_code == 200  # silently ignored, like the old form

    assert not _scalar("SELECT 1 FROM category_budget_overrides WHERE category_id = ?", (owner_cats["General"],))
    assert not _scalar("SELECT 1 FROM category_budgets WHERE category_id = ?", (owner_cats["General"],))
    assert call(budget.default_budgets, intruder_uid) == {}


def test_deleting_a_category_drops_its_budgets(client):
    api = register_and_login(client, "budgetcascade")
    uid, _, _ = user("budgetcascade")
    travel = add_category(uid, "Travel")
    _defaults(api, {travel: "200"})
    _override(api, travel, "2026-08", "900")
    assert _scalar("SELECT 1 FROM category_budgets WHERE category_id = ?", (travel,))

    delete_category(uid, travel)

    assert not _scalar("SELECT 1 FROM categories WHERE id = ?", (travel,))
    assert not _scalar("SELECT 1 FROM category_budgets WHERE category_id = ?", (travel,))
    assert not _scalar("SELECT 1 FROM category_budget_overrides WHERE category_id = ?", (travel,))


def test_home_and_consolidated_show_budget_when_enabled(client):
    api = register_and_login(client, "budgetviews")
    uid, cats, account_id = user("budgetviews")
    general = cats["General"]
    _defaults(api, {general: "50"})
    spend(uid, general, account_id, 70, "2026-02-03")

    # Amounts are kept while budgeting is off, but nothing is shown.
    home = api.get("/api/home", params={"month": "2026-02"}).json()
    assert home["budget_enabled"] is False and home["budget_card"] is None
    summary = api.get("/api/summary", params={"month": "2026-02"}).json()
    assert summary["budget"] is None
    assert summary["expense_breakdown"] == [{"category_name": "General", "total_amount": 70.0}]

    _toggle(api, True)
    home = api.get("/api/home", params={"month": "2026-02"}).json()
    card = home["budget_card"]
    assert card is not None
    assert card["over"] == ["General"]  # "Over budget: General"
    assert (card["total_spent"], card["total_budget"], card["total_remaining"]) == (70.0, 50.0, -20.0)
    assert card["total_status"] == "over" and card["total_pct"] == 140.0

    summary = api.get("/api/summary", params={"month": "2026-02"}).json()
    # The Budget / Left columns.
    assert summary["budget_enabled"] is True
    row = summary["budget"]["rows"][0]
    assert (row["name"], row["spent"], row["budget"], row["remaining"]) == ("General", 70.0, 50.0, -20.0)


def test_budgets_survive_export_import(client, app):
    api = register_and_login(client, "budgetexport")
    uid, _, _ = user("budgetexport")
    groceries = add_category(uid, "Groceries")
    _toggle(api, True)
    _defaults(api, {groceries: "300"})
    _override(api, groceries, "2026-12", "450")
    data = export_bytes(uid)

    register_and_login(TestClient(app), "budgetimport")
    dst_uid, _, _ = user("budgetimport")
    assert import_bytes(dst_uid, data, replace_movements=True) == []

    _, dst_cats, _ = user("budgetimport")
    assert call(budget.is_enabled, dst_uid)
    assert call(budget.default_budgets, dst_uid) == {dst_cats["Groceries"]: 300.0}
    assert core_summary(dst_uid, "2026-12")["by_category"][dst_cats["Groceries"]]["budget"] == 450


# ---------------------------------------------------------------------------
# spending_history (core; also checked through the panel's form rows)
# ---------------------------------------------------------------------------


def test_spending_history_average_window_and_refunds(client):
    api = register_and_login(client, "histwindow")
    uid, cats, account_id = user("histwindow")
    general = cats["General"]

    spend(uid, general, account_id, 999, "2026-05-15")  # selected month: ignored
    spend(uid, general, account_id, 90, "2026-02-10")
    spend(uid, general, account_id, 60, "2026-03-10")
    spend(uid, general, account_id, 30, "2026-04-10")
    spend(uid, general, account_id, 1000, "2026-01-10")  # 4 months back: ignored

    row = _history(uid, "2026-05")[general]
    assert row["avg"] == 60.0
    assert row["suggested"] == 60.0

    _toggle(api, True)
    form_row = next(r for r in _panel(api, "2026-05")["form_rows"] if r["id"] == general)
    assert form_row["avg"] == 60.0 and form_row["active"] is True


def test_spending_history_refunds_reduce_average_and_clamp_at_zero(client):
    register_and_login(client, "histrefund")
    uid, cats, account_id = user("histrefund")
    general = cats["General"]

    spend(uid, general, account_id, 90, "2026-02-10")
    refund(uid, general, account_id, 200, "2026-03-10")
    spend(uid, general, account_id, 30, "2026-04-10")

    row = _history(uid, "2026-05")[general]
    assert row["avg"] == 0.0
    assert row["suggested"] == 0.0


def test_spending_history_new_user_divides_by_months_actually_lived(client):
    register_and_login(client, "histnew")
    uid, cats, account_id = user("histnew")
    general = cats["General"]
    spend(uid, general, account_id, 100, "2026-04-15")

    row = _history(uid, "2026-05")[general]
    assert row["avg"] == 100.0
    assert row["suggested"] == 100.0


def test_spending_history_suggested_rounds_up_to_multiple_of_five(client):
    register_and_login(client, "histround")
    uid, cats, account_id = user("histround")
    general = cats["General"]

    spend(uid, cats["Other"], account_id, 0.01, "2026-01-05")  # anchor the first expense
    spend(uid, general, account_id, 633, "2026-04-01")  # avg 211 -> suggest 215

    row = _history(uid, "2026-05")[general]
    assert row["avg"] == 211.0
    assert row["suggested"] == 215.0

    other = add_category(uid, "Round215")
    spend(uid, other, account_id, 645, "2026-04-01")
    history = _history(uid, "2026-05")
    assert history[other]["avg"] == 215.0
    assert history[other]["suggested"] == 215.0

    untouched_id = add_category(uid, "Untouched")
    history = _history(uid, "2026-05")
    assert history[untouched_id]["avg"] == 0.0
    assert history[untouched_id]["suggested"] == 0.0


def test_spending_history_active_flags(client, app):
    register_and_login(client, "histactive")
    uid, cats, account_id = user("histactive")
    general, other = cats["General"], cats["Other"]

    spend(uid, general, account_id, 50, "2025-10-05")  # 7 months before May: inactive
    call(budget.set_default, uid, other, 20)

    history = _history(uid, "2026-05")
    assert history[general]["active"] is False
    assert history[other]["active"] is True

    call(budget.set_override, uid, general, "2026-05", 15)
    assert _history(uid, "2026-05")[general]["active"] is True

    register_and_login(TestClient(app), "histactive2")
    uid2, cats2, account_id2 = user("histactive2")
    general2 = cats2["General"]
    spend(uid2, general2, account_id2, 10, "2025-12-01")
    assert _history(uid2, "2026-05")[general2]["active"] is True


# ---------------------------------------------------------------------------
# other_amount
# ---------------------------------------------------------------------------


def test_other_amount_set_reflected_in_totals_and_over(client):
    api = register_and_login(client, "otherbasic")
    uid, cats, account_id = user("otherbasic")
    general, other = cats["General"], cats["Other"]
    _toggle(api, True)
    _defaults(api, {general: "100"}, other_amount="30")

    spend(uid, other, account_id, 40, "2026-05-05")

    summary = _panel(api, "2026-05")["summary"]
    assert summary["other"]["budget"] == 30
    assert summary["other"]["spent"] == 40
    assert summary["other"]["status"] == "over"
    assert summary["other"]["name"] == "Everything else" and summary["other"]["category_id"] is None
    assert summary["total_budget"] == 130
    assert summary["total_spent"] == 40
    assert summary["other"] in summary["over"]


def test_other_amount_cleared_by_blank(client):
    api = register_and_login(client, "otherclear")
    uid, _, _ = user("otherclear")
    _toggle(api, True)
    _defaults(api, other_amount="30")
    assert call(budget.get_other_amount, uid) == 30.0

    _defaults(api, other_amount="")
    assert call(budget.get_other_amount, uid) is None
    assert _panel(api, "2026-05")["summary"]["other"] is None

    # A request without the key leaves it alone; null clears it like blank.
    _defaults(api, other_amount="12")
    _defaults(api)
    assert call(budget.get_other_amount, uid) == 12.0
    _defaults(api, other_amount=None)
    assert call(budget.get_other_amount, uid) is None


def test_other_amount_negative_rejected_without_partial_save(client):
    api = register_and_login(client, "otherneg")
    uid, cats, _ = user("otherneg")
    general = cats["General"]
    _toggle(api, True)
    _defaults(api, other_amount="20")

    resp = _defaults(api, {general: "50"}, other_amount="-5")
    assert resp.status_code == 400
    assert "zero or more" in resp.json()["detail"]

    assert call(budget.default_budgets, uid) == {}
    assert call(budget.get_other_amount, uid) == 20.0


def test_other_amount_works_without_prior_budget_settings_row(client):
    api = register_and_login(client, "othernorow")
    uid, _, _ = user("othernorow")
    assert _scalar("SELECT 1 FROM budget_settings WHERE user_id = ?", (uid,)) is None

    _defaults(api, other_amount="25")

    assert call(budget.get_other_amount, uid) == 25.0
    assert not call(budget.is_enabled, uid)


# ---------------------------------------------------------------------------
# Budget panel data
# ---------------------------------------------------------------------------


def test_dashboard_budget_panel_renders_form_controls_and_order(client):
    api = register_and_login(client, "dashbudget")
    uid, cats, account_id = user("dashbudget")
    general, other_cat = cats["General"], cats["Other"]
    _toggle(api, True)

    spend(uid, general, account_id, 50, "2026-04-10")  # active
    spend(uid, other_cat, account_id, 20, "2025-01-10")  # inactive

    panel = _panel(api, "2026-05")
    # The "Everything else" field is always part of the form.
    assert "other_amount" in panel and panel["other_amount"] is None
    rows = panel["form_rows"]
    assert [r["id"] for r in rows] == [general, other_cat]  # active first
    assert [r["active"] for r in rows] == [True, False]
    assert rows[0]["avg"] == round(50 / 3, 2)
    # Nothing saved yet: the old form opened itself.
    assert panel["has_any_default"] is False and panel["defaults_total"] == 0.0


def test_budget_panel_full_shape_and_template_values(client):
    api = register_and_login(client, "budgetpanelshape")
    uid, cats, account_id = user("budgetpanelshape")
    general, other_cat = cats["General"], cats["Other"]
    _toggle(api, True)
    _defaults(api, {general: "100", other_cat: ""}, other_amount="20.5")
    _override(api, general, "2026-03", "120")
    spend(uid, general, account_id, 30, "2026-05-02")

    panel = _panel(api, "2026-05")
    assert panel["month"] == "2026-05"
    assert panel["has_any_default"] is True
    assert panel["defaults_total"] == 120.5
    assert panel["other_amount"] == 20.5
    assert panel["can_clear_month"] is True
    assert panel["cleared_total_spent"] is None
    assert panel["month_snapshots"] == [{"ym": "2026-03", "amounts": {str(general): 120.0}}]
    s = panel["summary"]
    assert s["ym"] == "2026-05" and s["cleared"] is False
    assert s["rows"][0] == {
        "category_id": general,
        "name": "General",
        "default": 100.0,
        "override": None,
        "budget": 100.0,
        "spent": 30.0,
        "remaining": 70.0,
        "pct": 30.0,
        "status": "ok",
    }
    assert (s["total_budget"], s["total_spent"], s["total_remaining"], s["total_status"]) == (120.5, 30.0, 90.5, "ok")
    assert s["over"] == [] and s["unbudgeted"] == [] and s["unbudgeted_spent"] == 0.0

    # cal_year/cal_month select the month too; junk falls back to the current month.
    assert api.get("/api/budget", params={"cal_year": "2026", "cal_month": "3"}).json()["month"] == "2026-03"
    this_month = date.today().strftime("%Y-%m")
    assert api.get("/api/budget", params={"month": "junk"}).json()["month"] == this_month
    assert api.get("/api/budget").json()["month"] == this_month


def test_budget_endpoints_require_login_and_csrf(client):
    for path in ("/api/budget", "/api/home", "/api/summary", "/api/yearly"):
        assert client.get(path).status_code == 401, path
    api = register_and_login(client, "budgetcsrf")
    uid, _, _ = user("budgetcsrf")
    for path in ("toggle", "defaults", "override", "clear-month", "restore-month"):
        resp = client.post(f"/api/budget/{path}", json={"enabled": True, "month": "2026-05"})  # no CSRF header
        assert resp.status_code == 403, path
    assert not call(budget.is_enabled, uid)
    assert not call(budget.is_month_cleared, uid, "2026-05")
    assert api.post("/api/budget/toggle", json={"enabled": True}).status_code == 200


# ---------------------------------------------------------------------------
# Export / import round trip for other_amount (core excel_io, as the old routes)
# ---------------------------------------------------------------------------


def test_other_amount_survives_export_import_round_trip(client, app):
    api = register_and_login(client, "otherexport")
    uid, _, _ = user("otherexport")
    _toggle(api, True)
    _defaults(api, other_amount="42")
    data = export_bytes(uid)

    register_and_login(TestClient(app), "otherimport")
    dst_uid, _, _ = user("otherimport")
    assert import_bytes(dst_uid, data, replace_movements=True) == []
    assert call(budget.get_other_amount, dst_uid) == 42.0


def test_old_workbook_without_other_amount_meta_key_does_not_clear_it(client):
    api = register_and_login(client, "otherkeep")
    uid, _, _ = user("otherkeep")
    _toggle(api, True)
    _defaults(api, other_amount="60")

    wb = _load(export_bytes(uid))
    ws_meta = wb["_meta"]
    for row_idx in range(ws_meta.max_row, 1, -1):
        if str(ws_meta.cell(row=row_idx, column=1).value or "").strip() == "budget_other_amount":
            ws_meta.delete_rows(row_idx)

    assert import_bytes(uid, workbook_bytes(wb), replace_movements=True) == []
    assert call(budget.get_other_amount, uid) == 60.0


# ---------------------------------------------------------------------------
# Regression tests for code-review fixes
# ---------------------------------------------------------------------------


def test_spending_history_active_when_only_spending_is_in_selected_month(client):
    register_and_login(client, "histcurmonth")
    uid, cats, account_id = user("histcurmonth")
    general = cats["General"]
    spend(uid, general, account_id, 40, "2026-05-05")

    row = _history(uid, "2026-05")[general]
    assert row["active"] is True
    assert row["avg"] == 0.0
    assert row["suggested"] == 0.0


def test_budget_for_month_float_rounding_avoids_false_over(client):
    api = register_and_login(client, "floatround")
    uid, cats, account_id = user("floatround")
    general = cats["General"]
    _toggle(api, True)
    _defaults(api, {general: "0.30"})

    spend(uid, general, account_id, 0.10, "2026-05-01")
    spend(uid, general, account_id, 0.20, "2026-05-02")

    summary = _panel(api, "2026-05")["summary"]
    row = _row(summary, general)
    assert row["spent"] == 0.30
    assert row["status"] == "warn"
    assert row["remaining"] == 0.0
    assert summary["total_budget"] == 0.30
    assert summary["total_spent"] == 0.30
    assert summary["total_remaining"] == 0.0


def test_parse_amount_rejects_non_finite_and_over_ceiling():
    for junk in ("inf", "Infinity", "-inf", "1e999", "nan"):
        try:
            budget.parse_amount(junk)
            raise AssertionError(f"expected ValueError for {junk!r}")
        except ValueError:
            pass
    try:
        budget.parse_amount(str(budget.MAX_AMOUNT + 1))
        raise AssertionError("expected ValueError above MAX_AMOUNT")
    except ValueError:
        pass
    # Exactly at the ceiling is fine.
    assert budget.parse_amount(str(budget.MAX_AMOUNT)) == budget.MAX_AMOUNT


def test_defaults_route_rejects_junk_amounts_without_partial_write(client):
    api = register_and_login(client, "junkdefaults")
    uid, cats, _ = user("junkdefaults")
    general, other_cat = cats["General"], cats["Other"]
    _toggle(api, True)

    for junk in ("inf", "Infinity", "1e999", "nan", str(budget.MAX_AMOUNT + 1), "abc"):
        resp = _defaults(api, {general: "50", other_cat: junk})
        assert resp.status_code == 400, junk
        assert resp.json() == {"detail": "Budget amounts must be numbers of zero or more."}
        assert call(budget.default_budgets, uid) == {}, f"partial write for {junk!r}"


def test_defaults_accept_numbers_commas_and_ignore_unknown_keys(client):
    api = register_and_login(client, "defaultsformats")
    uid, cats, _ = user("defaultsformats")
    general, other_cat = cats["General"], cats["Other"]
    resp = _defaults(api, {general: 12.345, other_cat: "7,5", "999999": "1", "abc": "x"})
    assert resp.status_code == 200
    assert call(budget.default_budgets, uid) == {general: 12.35, other_cat: 7.5}


def test_override_route_rejects_junk_amounts(client):
    api = register_and_login(client, "junkoverride")
    uid, cats, _ = user("junkoverride")
    general = cats["General"]
    _toggle(api, True)

    for junk in ("inf", "Infinity", "1e999", "nan", str(budget.MAX_AMOUNT + 1), "-1", "abc"):
        resp = _override(api, general, "2026-05", junk)
        assert resp.status_code == 400
        assert resp.json() == {"detail": "Invalid budget amount."}
        assert (
            _scalar("SELECT 1 FROM category_budget_overrides WHERE user_id = ? AND category_id = ?", (uid, general))
            is None
        )


def test_override_route_rejects_bad_category_id(client):
    api = register_and_login(client, "overridebadcat")
    uid, _, _ = user("overridebadcat")
    for bad in ("", None, "abc", "1.5"):
        resp = api.post("/api/budget/override", json={"category_id": bad, "month": "2026-05", "amount": "5"})
        assert resp.status_code == 400, bad
        assert resp.json() == {"detail": "Invalid budget amount."}
    resp = _override(api, 987654, "2026-05", "5")
    assert resp.status_code == 404 and resp.json() == {"detail": "Category not found."}
    assert _scalar("SELECT 1 FROM category_budget_overrides WHERE user_id = ?", (uid,)) is None


def test_override_blank_amount_drops_the_override_like_the_old_form(client):
    api = register_and_login(client, "overrideblank")
    uid, cats, _ = user("overrideblank")
    general = cats["General"]
    assert _override(api, general, "2026-05", "30").json()["message"] == "Budget for this month saved."
    resp = _override(api, general, "2026-05", "")
    assert resp.json()["message"] == "Budget for this month reset to the default."
    assert _scalar("SELECT 1 FROM category_budget_overrides WHERE user_id = ?", (uid,)) is None


def test_import_without_budgets_sheet_keeps_existing_budgets(client):
    api = register_and_login(client, "importnosheet")
    uid, cats, _ = user("importnosheet")
    _toggle(api, True)
    _defaults(api, {cats["General"]: "77"})
    _override(api, cats["General"], "2026-05", "88")

    wb = _load(export_bytes(uid))
    del wb["Budgets"]
    assert import_bytes(uid, workbook_bytes(wb), replace_movements=True) == []

    assert call(budget.default_budgets, uid) == {cats["General"]: 77.0}
    row = _scalar(
        "SELECT amount FROM category_budget_overrides WHERE user_id = ? AND category_id = ? AND ym = ?",
        (uid, cats["General"], "2026-05"),
    )
    assert row["amount"] == 88.0


def test_import_with_budgets_sheet_replaces_existing_budgets(client):
    api = register_and_login(client, "importwithsheet")
    uid, cats, _ = user("importwithsheet")
    _toggle(api, True)
    _defaults(api, {cats["General"]: "77"})
    data = export_bytes(uid)
    _defaults(api, {cats["General"]: "999"})

    assert import_bytes(uid, data, replace_movements=True) == []
    assert call(budget.default_budgets, uid) == {cats["General"]: 77.0}


def test_spending_history_today_param_limits_window_to_past_months(client):
    register_and_login(client, "historytoday")
    uid, cats, account_id = user("historytoday")
    general = cats["General"]
    spend(uid, general, account_id, 100, "2026-04-10")
    spend(uid, general, account_id, 50, "2026-05-10")

    row = _history(uid, "2026-07", today=date(2026, 5, 15))[general]
    assert row["avg"] == 75.0  # (100+50)/2, not /3


def test_total_pct_is_100_when_all_budgets_zero_and_spending_exists(client):
    api = register_and_login(client, "zerobudget")
    uid, cats, account_id = user("zerobudget")
    general = cats["General"]
    _toggle(api, True)
    _defaults(api, {general: "0"})
    spend(uid, general, account_id, 50, "2026-05-05")

    summary = _panel(api, "2026-05")["summary"]
    assert summary["total_budget"] == 0.0
    assert summary["total_spent"] == 50.0
    assert summary["total_pct"] == 100.0


def test_override_route_rejects_invalid_month(client):
    api = register_and_login(client, "invalidmonthoverride")
    uid, cats, _ = user("invalidmonthoverride")
    general = cats["General"]
    _toggle(api, True)

    for bad_month in ("2026-13", "abc", "", None, "2026-5", "2026-05x"):
        resp = _override(api, general, bad_month, "10")
        assert resp.status_code == 400
        assert resp.json() == {"detail": "Invalid month."}

    assert _scalar("SELECT 1 FROM category_budget_overrides WHERE user_id = ?", (uid,)) is None


def test_home_card_renders_with_only_other_amount_set(client):
    api = register_and_login(client, "homeotheronly")
    _toggle(api, True)
    _defaults(api, other_amount="40")

    card = api.get("/api/home", params={"month": "2026-05"}).json()["budget_card"]
    assert card is not None
    assert (card["total_budget"], card["over"]) == (40.0, [])


def test_home_card_hidden_when_enabled_but_no_budget_rows(client):
    api = register_and_login(client, "homenobudget")
    _toggle(api, True)
    home = api.get("/api/home", params={"month": "2026-05"}).json()
    assert home["budget_enabled"] is True and home["budget_card"] is None


# ---------------------------------------------------------------------------
# "Fixed" per-category flag
# ---------------------------------------------------------------------------


def _flag_rows_for_category(category_id):
    conn = get_connection()
    rows = conn.execute(
        "SELECT user_id, fixed FROM category_budget_flags WHERE category_id = ?",
        (category_id,),
    ).fetchall()
    conn.close()
    return rows


def test_fixed_flag_persists_clears_and_is_untouched_when_amount_field_absent(client):
    api = register_and_login(client, "fixedbasic")
    uid, cats, _ = user("fixedbasic")
    general, other_cat = cats["General"], cats["Other"]
    _toggle(api, True)

    # Checking the box persists the flag even with a blank amount.
    _defaults(api, {general: ""}, fixed={general: "1"})
    assert call(budget.fixed_categories, uid) == {general}
    assert call(budget.default_budgets, uid) == {}

    # Sending the row's amount without the flag clears it.
    _defaults(api, {general: ""})
    assert call(budget.fixed_categories, uid) == set()

    # A request that omits amounts[general] leaves general's flag alone.
    _defaults(api, {general: ""}, fixed={general: True})
    _defaults(api, {other_cat: "20"})
    assert call(budget.fixed_categories, uid) == {general}

    # fixed without the amount key does nothing (the old form always sent both).
    _defaults(api, {}, fixed={other_cat: "1"})
    assert call(budget.fixed_categories, uid) == {general}


def test_fixed_flag_all_or_nothing_on_invalid_amount(client):
    api = register_and_login(client, "fixedallnone")
    uid, cats, _ = user("fixedallnone")
    general, other_cat = cats["General"], cats["Other"]
    _toggle(api, True)

    resp = _defaults(api, {general: "50", other_cat: "not-a-number"}, fixed={general: "1"})
    assert resp.status_code == 400
    assert "zero or more" in resp.json()["detail"]

    assert call(budget.fixed_categories, uid) == set()
    assert call(budget.default_budgets, uid) == {}


def test_fixed_flag_ignores_other_users_category(client, app):
    register_and_login(client, "fixedowner")
    _, owner_cats, _ = user("fixedowner")
    owner_general = owner_cats["General"]

    intruder = register_and_login(TestClient(app), "fixedintruder")
    _toggle(intruder, True)
    _defaults(intruder, {owner_general: "10"}, fixed={owner_general: "1"})

    assert _flag_rows_for_category(owner_general) == []


def test_deleting_category_cascades_fixed_flag(client):
    api = register_and_login(client, "fixedcascade")
    uid, _, _ = user("fixedcascade")
    travel = add_category(uid, "Travel")
    _toggle(api, True)
    _defaults(api, {travel: ""}, fixed={travel: "1"})
    assert call(budget.fixed_categories, uid) == {travel}

    delete_category(uid, travel)

    assert not _scalar("SELECT 1 FROM category_budget_flags WHERE category_id = ?", (travel,))


def test_budget_form_rows_expose_fixed_and_checkbox_is_checked(client):
    api = register_and_login(client, "fixedform")
    uid, cats, account_id = user("fixedform")
    general, other_cat = cats["General"], cats["Other"]
    _toggle(api, True)
    spend(uid, general, account_id, 10, "2026-04-10")
    _defaults(api, {general: "50"}, fixed={general: "1"})

    rows = {r["id"]: r for r in _panel(api, "2026-05")["form_rows"]}
    assert rows[general]["fixed"] is True and rows[general]["default"] == 50.0
    assert rows[other_cat]["fixed"] is False and rows[other_cat]["default"] is None


def test_excel_round_trip_preserves_fixed_flag_with_no_default_amount(client, app):
    api = register_and_login(client, "fixedexport")
    uid, cats, _ = user("fixedexport")
    general = cats["General"]
    _toggle(api, True)
    _defaults(api, {general: ""}, fixed={general: "1"})
    data = export_bytes(uid)

    register_and_login(TestClient(app), "fixedimport")
    dst_uid, dst_cats, _ = user("fixedimport")
    assert import_bytes(dst_uid, data, replace_movements=True) == []
    assert call(budget.fixed_categories, dst_uid) == {dst_cats["General"]}
    assert call(budget.default_budgets, dst_uid) == {}


def test_import_replace_mode_with_budgets_sheet_replaces_fixed_flag(client):
    api = register_and_login(client, "fixedreplace")
    uid, cats, _ = user("fixedreplace")
    general = cats["General"]
    _toggle(api, True)
    _defaults(api, {general: "50"}, fixed={general: "1"})
    data = export_bytes(uid)

    _defaults(api, {general: "50"})
    assert call(budget.fixed_categories, uid) == set()

    assert import_bytes(uid, data, replace_movements=True) == []
    assert call(budget.fixed_categories, uid) == {general}


def test_import_merge_mode_budgets_sheet_without_fixed_column_leaves_existing_flags(client):
    api = register_and_login(client, "fixedmerge")
    uid, cats, _ = user("fixedmerge")
    general = cats["General"]
    _toggle(api, True)
    _defaults(api, {general: "50"}, fixed={general: "1"})

    wb = _load(export_bytes(uid))
    ws_bud = wb["Budgets"]
    for col in range(1, ws_bud.max_column + 1):
        if str(ws_bud.cell(row=1, column=col).value or "").strip().lower() == "fixed":
            ws_bud.cell(row=1, column=col).value = None
    for row_idx in range(2, ws_bud.max_row + 1):
        if str(ws_bud.cell(row=row_idx, column=1).value or "").strip() == "General":
            ws_bud.cell(row=row_idx, column=3).value = 999  # amount column

    assert import_bytes(uid, workbook_bytes(wb)) == []
    assert call(budget.fixed_categories, uid) == {general}
    assert call(budget.default_budgets, uid) == {general: 999.0}


def test_import_blank_amount_default_row_with_fixed_zero_is_an_error(client):
    register_and_login(client, "fixedbadrow")
    uid, _, _ = user("fixedbadrow")

    wb = _build_migration_template_workbook()
    wb["Budgets"].append(["General", "", "", 0])
    errors = import_bytes(uid, workbook_bytes(wb))
    assert errors  # "Import failed. ..."
    assert any("missing amount" in e for e in errors)


# ---------------------------------------------------------------------------
# month_budget_snapshots (core; also exposed as month_snapshots in the panel)
# ---------------------------------------------------------------------------


def test_month_budget_snapshots_newest_first_and_effective_amounts(client):
    api = register_and_login(client, "snapbasic")
    uid, cats, _ = user("snapbasic")
    general, other = cats["General"], cats["Other"]

    conn = get_connection()
    budget.set_default(conn, uid, general, 100)
    budget.set_override(conn, uid, general, "2026-03", 80)
    budget.set_default(conn, uid, other, 20)
    budget.set_override(conn, uid, other, "2026-04", 25)
    conn.commit()
    conn.close()

    snapshots = call(budget.month_budget_snapshots, uid)
    assert [s["ym"] for s in snapshots] == ["2026-04", "2026-03"]
    april = next(s for s in snapshots if s["ym"] == "2026-04")
    assert april["amounts"][general] == 100.0
    assert april["amounts"][other] == 25.0
    march = next(s for s in snapshots if s["ym"] == "2026-03")
    assert march["amounts"][general] == 80.0
    assert march["amounts"][other] == 20.0

    _toggle(api, True)
    assert _panel(api, "2026-05")["month_snapshots"] == [
        {"ym": "2026-04", "amounts": {str(general): 100.0, str(other): 25.0}},
        {"ym": "2026-03", "amounts": {str(general): 80.0, str(other): 20.0}},
    ]


def test_month_budget_snapshots_omits_categories_with_neither(client):
    register_and_login(client, "snapomit")
    uid, cats, _ = user("snapomit")
    general, other = cats["General"], cats["Other"]
    call(budget.set_override, uid, general, "2026-05", 40)

    snapshots = call(budget.month_budget_snapshots, uid)
    assert len(snapshots) == 1
    assert snapshots[0]["ym"] == "2026-05"
    assert snapshots[0]["amounts"] == {general: 40.0}
    assert other not in snapshots[0]["amounts"]


def test_month_budget_snapshots_only_months_with_an_override_are_listed(client):
    api = register_and_login(client, "snapdefaultonly")
    uid, cats, _ = user("snapdefaultonly")
    call(budget.set_default, uid, cats["General"], 100)
    assert call(budget.month_budget_snapshots, uid) == []
    _toggle(api, True)
    assert _panel(api, "2026-05")["month_snapshots"] == []


def test_month_budget_snapshots_isolates_other_users(client, app):
    register_and_login(client, "snapowner")
    uid, cats, _ = user("snapowner")
    general = cats["General"]
    register_and_login(TestClient(app), "snapintruder")
    other_uid, other_cats, _ = user("snapintruder")

    call(budget.set_override, uid, general, "2026-06", 70)
    call(budget.set_override, other_uid, other_cats["General"], "2026-06", 999)

    snapshots = call(budget.month_budget_snapshots, uid)
    assert len(snapshots) == 1
    assert snapshots[0]["amounts"] == {general: 70.0}


def test_month_budget_snapshots_respects_limit(client):
    register_and_login(client, "snaplimit")
    uid, cats, _ = user("snaplimit")
    for month_num in range(1, 6):
        call(budget.set_override, uid, cats["General"], f"2026-{month_num:02d}", 10 * month_num)
    snapshots = call(budget.month_budget_snapshots, uid, limit=2)
    assert [s["ym"] for s in snapshots] == ["2026-05", "2026-04"]


# ---------------------------------------------------------------------------
# Clear / restore a month's budget
# ---------------------------------------------------------------------------


def test_clear_month_hides_defaults_and_other_for_that_month_only(client):
    api = register_and_login(client, "clearbasic")
    uid, cats, account_id = user("clearbasic")
    general, other_cat = cats["General"], cats["Other"]
    _toggle(api, True)
    _defaults(api, {general: "100"}, other_amount="30")
    spend(uid, general, account_id, 40, "2026-05-10")
    spend(uid, other_cat, account_id, 10, "2026-05-11")
    spend(uid, general, account_id, 40, "2026-06-10")

    resp = _clear(api, "2026-05")
    assert resp.json() == {"ok": True, "message": "Cleared the budget for May 2026."}

    panel = _panel(api, "2026-05")
    may = panel["summary"]
    assert may["cleared"] is True
    assert may["rows"] == []
    assert may["other"] is None
    assert may["total_budget"] == 0
    assert may["total_spent"] == 0
    assert {u["name"] for u in may["unbudgeted"]} == {"General", "Other"}
    # The "No budget for May 2026 · Spent" hero, and no "Clear" button.
    assert panel["cleared_total_spent"] == 50.0
    assert panel["can_clear_month"] is False

    june = _panel(api, "2026-06")["summary"]
    assert june["cleared"] is False
    assert _row(june, general)["budget"] == 100.0


def test_clear_month_deletes_that_months_existing_overrides(client):
    api = register_and_login(client, "clearoverrides")
    uid, cats, _ = user("clearoverrides")
    general = cats["General"]
    _toggle(api, True)
    _defaults(api, {general: "100"})
    _override(api, general, "2026-05", "80")

    _clear(api, "2026-05")

    assert (
        _scalar(
            "SELECT 1 FROM category_budget_overrides WHERE user_id = ? AND category_id = ? AND ym = ?",
            (uid, general, "2026-05"),
        )
        is None
    )


def test_override_after_clear_budgets_only_that_category(client):
    api = register_and_login(client, "clearthenoverride")
    uid, cats, _ = user("clearthenoverride")
    general, other_cat = cats["General"], cats["Other"]
    _toggle(api, True)
    _defaults(api, {general: "100", other_cat: "50"})
    _clear(api, "2026-05")

    resp = _override(api, general, "2026-05", "25")
    assert resp.json()["message"] == "Budget for this month saved."

    panel = _panel(api, "2026-05")
    may = panel["summary"]
    assert may["cleared"] is True
    assert _row(may, general)["budget"] == 25.0
    assert _row(may, general)["default"] is None  # defaults do not apply this month
    assert _row(may, other_cat) is None
    # The old template shows the "spent" hero only when a cleared month has no rows.
    assert panel["can_clear_month"] is True and panel["cleared_total_spent"] is None


def test_reset_to_default_on_cleared_month_removes_the_budget(client):
    api = register_and_login(client, "clearreset")
    uid, cats, account_id = user("clearreset")
    general = cats["General"]
    _toggle(api, True)
    _defaults(api, {general: "100"})
    _clear(api, "2026-05")
    _override(api, general, "2026-05", "25")
    spend(uid, general, account_id, 25, "2026-05-01")

    resp = _override(api, general, "2026-05", clear="1")
    assert resp.json()["message"] == "Budget for this month removed."

    may = _panel(api, "2026-05")["summary"]
    assert _row(may, general) is None
    assert [u["name"] for u in may["unbudgeted"]] == ["General"]


def test_restore_month_brings_back_defaults_and_keeps_post_clear_overrides(client):
    api = register_and_login(client, "clearrestore")
    uid, cats, _ = user("clearrestore")
    general, other_cat = cats["General"], cats["Other"]
    _toggle(api, True)
    _defaults(api, {general: "100", other_cat: "50"})
    _clear(api, "2026-05")
    _override(api, general, "2026-05", "25")

    resp = api.post("/api/budget/restore-month", json={"month": "2026-05"})
    assert resp.json() == {"ok": True, "message": "Restored the monthly budgets for May 2026."}

    may = _panel(api, "2026-05")["summary"]
    assert may["cleared"] is False
    assert _row(may, general)["budget"] == 25.0
    assert _row(may, other_cat)["budget"] == 50.0


def test_clear_and_restore_month_reject_invalid_month_without_write(client):
    api = register_and_login(client, "clearinvalid")
    uid, _, _ = user("clearinvalid")
    _toggle(api, True)

    for bad_month in ("2026-13", "abc", "", None):
        for path in ("/api/budget/clear-month", "/api/budget/restore-month"):
            resp = api.post(path, json={"month": bad_month})
            assert resp.status_code == 400
            assert resp.json() == {"detail": "Invalid month."}
    assert api.post("/api/budget/clear-month", json={}).json() == {"detail": "Invalid month."}

    assert _scalar("SELECT 1 FROM budget_month_cleared WHERE user_id = ?", (uid,)) is None


def test_clear_month_isolated_per_user(client, app):
    register_and_login(client, "clearowner")
    uid, _, _ = user("clearowner")
    intruder = register_and_login(TestClient(app), "clearintruder")
    intruder_uid, _, _ = user("clearintruder")

    _clear(intruder, "2026-05")

    assert call(budget.is_month_cleared, intruder_uid, "2026-05") is True
    assert call(budget.is_month_cleared, uid, "2026-05") is False


def test_deleting_category_does_not_break_a_cleared_month(client):
    api = register_and_login(client, "cleardeletecat")
    uid, _, _ = user("cleardeletecat")
    travel = add_category(uid, "Travel")
    _toggle(api, True)
    _defaults(api, {travel: "200"})
    _clear(api, "2026-05")
    _override(api, travel, "2026-05", "75")

    delete_category(uid, travel)

    assert call(budget.is_month_cleared, uid, "2026-05") is True
    may = _panel(api, "2026-05")["summary"]
    assert may["cleared"] is True
    assert may["rows"] == []


def test_month_budget_snapshots_for_cleared_month_ignores_defaults(client):
    api = register_and_login(client, "clearsnap")
    uid, cats, _ = user("clearsnap")
    general, other_cat = cats["General"], cats["Other"]
    call(budget.set_default, uid, general, 100)
    call(budget.set_default, uid, other_cat, 50)

    _toggle(api, True)
    _clear(api, "2026-05")
    _override(api, general, "2026-05", "20")

    snapshots = call(budget.month_budget_snapshots, uid)
    may = next(s for s in snapshots if s["ym"] == "2026-05")
    assert may["amounts"] == {general: 20.0}


def test_month_budget_snapshots_skips_cleared_month_with_no_overrides_left(client):
    api = register_and_login(client, "clearsnapempty")
    uid, cats, _ = user("clearsnapempty")
    _toggle(api, True)
    _override(api, cats["General"], "2026-05", "20")
    _clear(api, "2026-05")  # wipes the override too

    snapshots = call(budget.month_budget_snapshots, uid)
    assert all(s["ym"] != "2026-05" for s in snapshots)


def test_clear_month_survives_export_import_round_trip(client, app):
    api = register_and_login(client, "clearexport")
    uid, cats, _ = user("clearexport")
    general = cats["General"]
    _toggle(api, True)
    _defaults(api, {general: "100"})
    _clear(api, "2026-05")
    _override(api, general, "2026-05", "25")
    data = export_bytes(uid)

    register_and_login(TestClient(app), "clearimport")
    dst_uid, _, _ = user("clearimport")
    assert import_bytes(dst_uid, data, replace_movements=True) == []

    _, dst_cats, _ = user("clearimport")
    assert call(budget.is_month_cleared, dst_uid, "2026-05") is True
    dst_summary = core_summary(dst_uid, "2026-05")
    assert dst_summary["cleared"] is True
    assert dst_summary["by_category"][dst_cats["General"]]["budget"] == 25.0


def test_old_workbook_without_budget_cleared_months_key_does_not_clear_anything(client):
    api = register_and_login(client, "clearkeep")
    uid, _, _ = user("clearkeep")
    _toggle(api, True)
    _clear(api, "2026-05")

    wb = _load(export_bytes(uid))
    ws_meta = wb["_meta"]
    for row_idx in range(ws_meta.max_row, 1, -1):
        if str(ws_meta.cell(row=row_idx, column=1).value or "").strip() == "budget_cleared_months":
            ws_meta.delete_rows(row_idx)

    assert import_bytes(uid, workbook_bytes(wb), replace_movements=True) == []
    assert call(budget.is_month_cleared, uid, "2026-05") is True


def test_import_rejects_junk_in_budget_cleared_months(client):
    api = register_and_login(client, "clearjunk")
    uid, _, _ = user("clearjunk")
    _toggle(api, True)

    wb = _load(export_bytes(uid))
    ws_meta = wb["_meta"]
    for row_idx in range(1, ws_meta.max_row + 1):
        if str(ws_meta.cell(row=row_idx, column=1).value or "").strip() == "budget_cleared_months":
            ws_meta.cell(row=row_idx, column=2).value = "2026-05,not-a-month"
            break

    errors = import_bytes(uid, workbook_bytes(wb))
    assert errors
    assert any("budget_cleared_months" in e for e in errors)


# ---------------------------------------------------------------------------
# Regression: saving the manual-budgets form on a cleared month must not
# wipe other_amount for every other month
# ---------------------------------------------------------------------------


def test_defaults_form_on_cleared_month_preserves_other_amount(client):
    api = register_and_login(client, "clearotherpreserve")
    uid, cats, _ = user("clearotherpreserve")
    general = cats["General"]
    _toggle(api, True)
    _defaults(api, {general: "100"}, other_amount="100")
    _clear(api, "2026-05")

    # summary.other is None for a cleared month, but the form gets the saved value.
    panel = _panel(api, "2026-05")
    assert panel["summary"]["other"] is None
    assert panel["other_amount"] == 100.0

    resp = _defaults(api, {general: "100"}, other_amount="100", month="2026-05")
    assert resp.json()["message"] == "Monthly budgets saved."
    assert call(budget.get_other_amount, uid) == 100.0
    assert _panel(api, "2026-06")["summary"]["other"]["budget"] == 100.0
