"""Recurring rules API (old routes/recurring.py): validation, ownership, the
list the Recurring panel shows, edit without a first date, delete."""

from datetime import date, timedelta

from .conftest import get_connection, user_id
from .helpers_accounts import new_user, row


def _body(choice, account, **fields):
    data = {"category_choice": choice, "amount": "10", "account_id": account, "indefinitely": True, "notes": ""}
    data.update(fields)
    return data


def test_validation_messages(app):
    _o, other_cat, _oi, other_acc = new_user(app, "rec-api-other")
    api, cat, inc, acc = new_user(app, "rec-api-valid")
    today = date.today().isoformat()
    cases = (
        (_body("", acc), "Choose type, category, and account."),
        (_body("x-1", acc), "Choose type, category, and account."),
        (_body(f"e-{cat}", ""), "Choose type, category, and account."),
        (_body(f"e-{other_cat}", acc), "Invalid category for that type."),
        (_body(f"e-{cat}", "abc"), "Invalid amount or account."),
        (_body(f"e-{cat}", acc, amount="ten"), "Invalid amount or account."),
        (_body(f"e-{cat}", other_acc), "Invalid account."),
        (
            _body(f"e-{cat}", acc, indefinitely=False),
            "Choose how many times the recurring rule should run, or enable Indefinitely.",
        ),
        (
            _body(f"e-{cat}", acc, indefinitely="", months_to_run="0"),
            "Choose how many times the recurring rule should run, or enable Indefinitely.",
        ),
        (_body(f"e-{cat}", acc, amount="0", start_date=today), "Amount must be positive."),
        (_body(f"e-{cat}", acc, interval_count="100", start_date=today), "Repeat every must be between 1 and 99."),
    )
    for body, message in cases:
        resp = api.post("/api/recurring", json=body)
        assert (resp.status_code, resp.json()["detail"]) == (400, message), body
    assert api.get("/api/recurring").json()["items"] == []

    # an income category is only valid as an income rule
    resp = api.post("/api/recurring", json=_body(f"i-{inc}", acc, start_date=today))
    assert resp.status_code == 200
    assert resp.json()["rule"]["entry_type"] == "income"


def test_list_shows_every_field_the_panel_shows(app):
    api, cat, inc, acc = new_user(app, "rec-api-list")
    start = (date.today() + timedelta(days=30)).isoformat()
    api.post(
        "/api/recurring",
        json=_body(
            f"e-{cat}", acc, amount="-9.5", notes=" gym ", interval_unit="week", interval_count=2, start_date=start
        ),
    )
    api.post(
        "/api/recurring",
        json=_body(f"i-{inc}", acc, indefinitely=False, months_to_run=3, start_date=start, interval_unit="MONTH"),
    )
    items = api.get("/api/recurring").json()["items"]
    assert len(items) == 2
    expense, income = items  # same day_of_month: ordered by id
    assert expense["entry_type"] == "expense" and expense["category_choice"] == f"e-{cat}"
    assert (expense["amount"], expense["notes"], expense["interval_unit"], expense["interval_count"]) == (
        9.5,
        "gym",
        "week",
        2,
    )
    assert (expense["months_to_run"], expense["enabled"], expense["start_date"]) == (None, True, start)
    assert (expense["category_name"], expense["account_name"]) == ("General", "Main")
    assert income["category_choice"] == f"i-{inc}"
    assert (income["months_to_run"], income["interval_unit"], income["interval_count"]) == (3, "month", 1)


def test_edit_without_first_date_keeps_it_and_takes_day_of_month(app):
    api, cat, _inc, acc = new_user(app, "rec-api-dom")
    rule = api.post("/api/recurring", json=_body(f"e-{cat}", acc, start_date="2099-01-10")).json()["rule"]
    resp = api.put(f"/api/recurring/{rule['id']}", json=_body(f"e-{cat}", acc, day_of_month="40", enabled=True))
    assert resp.status_code == 200
    stored = row("recurring_entries", rule["id"])
    assert (stored["start_date"], stored["day_of_month"], stored["enabled"]) == ("2099-01-10", 31, 1)

    # leaving "enabled" out pauses the rule, like the old unchecked box
    api.put(f"/api/recurring/{rule['id']}", json=_body(f"e-{cat}", acc, start_date="2099-01-10"))
    assert row("recurring_entries", rule["id"])["enabled"] == 0
    assert api.get("/api/recurring").json()["items"][0]["enabled"] is False


def test_paused_rule_posts_nothing_and_income_rules_post_income(app):
    api, cat, inc, acc = new_user(app, "rec-api-post")
    uid = user_id("rec-api-post")
    start = (date.today() - timedelta(days=1)).isoformat()
    paused = api.post("/api/recurring", json=_body(f"e-{cat}", acc, notes="paused", start_date=start)).json()["rule"]
    api.put(f"/api/recurring/{paused['id']}", json=_body(f"e-{cat}", acc, notes="paused", start_date=start))
    api.post("/api/recurring", json=_body(f"i-{inc}", acc, notes="pay", amount="100", start_date=start))
    assert api.get("/api/bootstrap").json()["posted_recurring"] == 1
    conn = get_connection()
    income = conn.execute("SELECT amount, received_at FROM income_entries WHERE user_id = ?", (uid,)).fetchall()
    expenses = conn.execute("SELECT COUNT(*) FROM expenses WHERE user_id = ?", (uid,)).fetchone()[0]
    conn.close()
    assert [(r["amount"], r["received_at"]) for r in income] == [(100.0, start)]
    assert expenses == 0


def test_other_users_rules_are_not_found_and_delete(app):
    owner, cat, _inc, acc = new_user(app, "rec-api-owner")
    intruder, cat2, _inc2, acc2 = new_user(app, "rec-api-intruder")
    rule = owner.post("/api/recurring", json=_body(f"e-{cat}", acc, start_date="2099-01-01")).json()["rule"]

    resp = intruder.put(f"/api/recurring/{rule['id']}", json=_body(f"e-{cat2}", acc2, enabled=True))
    assert (resp.status_code, resp.json()["detail"]) == (404, "Rule not found.")
    assert intruder.delete(f"/api/recurring/{rule['id']}").status_code == 404
    assert intruder.get("/api/recurring").json()["items"] == []
    # the owner cannot point it at someone else's account
    resp = owner.put(f"/api/recurring/{rule['id']}", json=_body(f"e-{cat}", acc2, enabled=True))
    assert (resp.status_code, resp.json()["detail"]) == (400, "Invalid account.")

    resp = owner.delete(f"/api/recurring/{rule['id']}")
    assert (resp.status_code, resp.json()["message"]) == (200, "Recurring rule removed.")
    assert row("recurring_entries", rule["id"]) is None
