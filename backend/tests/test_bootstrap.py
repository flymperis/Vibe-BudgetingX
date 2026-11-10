"""GET /api/bootstrap: the reference data every screen needs."""

from datetime import date, timedelta

from .conftest import first_ids, get_connection, register_and_login, user_id


def test_bootstrap_shape_for_a_new_user(client):
    api = register_and_login(client, "boot-new")
    body = api.get("/api/bootstrap").json()
    today = date.today()
    assert body["user"] == {"id": user_id("boot-new"), "username": "boot-new"}
    assert body["today"] == today.isoformat()
    assert body["month"] == today.strftime("%Y-%m")
    assert [c["name"] for c in body["categories"]] == ["General", "Other"]
    assert [c["name"] for c in body["income_categories"]] == ["General", "Other", "Salary"]  # ORDER BY name
    assert [a["name"] for a in body["accounts"]] == ["Main"]
    main = body["accounts"][0]
    assert (main["account_type"], main["is_credit_card"], main["current_balance"], main["card"]) == (
        "bank",
        False,
        0.0,
        None,
    )
    assert body["balance_totals"] == {"cash_total": 0.0, "cards_total": 0.0, "net_total": 0.0}
    assert (body["tag_names"], body["recent_tags"], body["budget_enabled"], body["posted_recurring"]) == (
        [],
        [],
        False,
        0,
    )


def test_balances_include_everything_through_today_only(client):
    api = register_and_login(client, "boot-balances")
    uid = user_id("boot-balances")
    cat, inc, acc = first_ids("boot-balances")
    today = date.today()
    conn = get_connection()
    conn.execute("UPDATE accounts SET opening_balance = 100 WHERE id = ?", (acc,))
    conn.execute(
        "INSERT INTO accounts (user_id, name, opening_balance) VALUES (?, 'Savings', 50)",
        (uid,),
    )
    savings = conn.execute("SELECT id FROM accounts WHERE user_id = ? AND name = 'Savings'", (uid,)).fetchone()["id"]
    conn.execute(
        "INSERT INTO income_entries (user_id, notes, amount, category_id, account_id, received_at) "
        "VALUES (?, '', 20, ?, ?, ?)",
        (uid, inc, acc, today.isoformat()),
    )
    conn.execute(
        "INSERT INTO account_transfers (user_id, from_account_id, to_account_id, amount, transferred_at) "
        "VALUES (?, ?, ?, 30, ?)",
        (uid, acc, savings, today.isoformat()),
    )
    conn.commit()
    conn.close()
    api.post("/api/expenses", json={"amount": "-15.5", "category_id": cat, "account_id": acc})
    # tomorrow's expense is not in today's balance
    tomorrow = (today + timedelta(days=1)).isoformat()
    api.post("/api/expenses", json={"amount": "-1000", "category_id": cat, "account_id": acc, "spent_at": tomorrow})

    body = api.get("/api/bootstrap").json()
    balances = {a["name"]: a["current_balance"] for a in body["accounts"]}
    assert balances == {"Main": 100 + 20 - 15.5 - 30, "Savings": 80.0}
    opening = {a["name"]: a["opening_balance"] for a in body["accounts"]}
    assert opening == {"Main": 100.0, "Savings": 50.0}
    assert body["balance_totals"]["net_total"] == 100 + 20 - 15.5 + 50


def test_credit_card_flags_and_status(client):
    api = register_and_login(client, "boot-card")
    uid = user_id("boot-card")
    cat, _inc, _acc = first_ids("boot-card")
    conn = get_connection()
    conn.execute(
        "INSERT INTO accounts (user_id, name, opening_balance, account_type, credit_limit, statement_day, due_day) "
        "VALUES (?, 'Eurobank Visa', 0, 'credit', 1000, 5, 25)",
        (uid,),
    )
    card_id = conn.execute("SELECT id FROM accounts WHERE user_id = ? AND name = 'Eurobank Visa'", (uid,)).fetchone()[
        "id"
    ]
    conn.commit()
    conn.close()
    api.post("/api/expenses", json={"amount": "-200", "category_id": cat, "account_id": card_id})

    body = api.get("/api/bootstrap").json()
    card = next(a for a in body["accounts"] if a["id"] == card_id)
    assert card["is_credit_card"] is True and card["account_type"] == "credit"
    assert (card["credit_limit"], card["statement_day"], card["due_day"]) == (1000.0, 5, 25)
    assert card["bank"]["slug"] == "eurobank"
    status = card["card"]
    assert (status["owed"], status["available"], status["limit"], status["used_pct"]) == (200.0, 800.0, 1000.0, 20.0)
    assert status["used_level"] == "ok"
    assert status["statement"]["state"] in {"none", "paid", "overdue", "soon", "open"}
    date.fromisoformat(status["statement"]["closed_on"])
    totals = body["balance_totals"]
    assert (totals["cash_total"], totals["cards_total"], totals["net_total"]) == (0.0, -200.0, -200.0)


def test_bootstrap_posts_due_recurring_entries_once(client):
    """Like the old index route: every load applies due recurring rules."""
    api = register_and_login(client, "boot-recurring")
    uid = user_id("boot-recurring")
    cat, _inc, acc = first_ids("boot-recurring")
    start = date.today() - timedelta(days=14)
    conn = get_connection()
    conn.execute(
        "INSERT INTO recurring_entries (user_id, entry_type, amount, category_id, account_id, day_of_month, "
        "months_to_run, interval_unit, interval_count, start_date, notes, enabled) "
        "VALUES (?, 'expense', 10, ?, ?, ?, NULL, 'week', 1, ?, 'gym', 1)",
        (uid, cat, acc, start.day, start.isoformat()),
    )
    conn.commit()
    conn.close()

    first = api.get("/api/bootstrap").json()
    assert first["posted_recurring"] == 3  # start, +7, +14 days
    assert api.get("/api/bootstrap").json()["posted_recurring"] == 0
    listing = api.get("/api/expenses").json()
    assert [e["notes"] for e in listing["items"]] == ["[Recurring] gym"] * 3
    assert all(e["amount"] == -10.0 for e in listing["items"])


def test_budget_flag_and_tags(client):
    api = register_and_login(client, "boot-flags")
    uid = user_id("boot-flags")
    cat, _inc, acc = first_ids("boot-flags")
    api.post("/api/expenses", json={"notes": "taxi #work", "amount": "-8", "category_id": cat, "account_id": acc})
    from vbx.core import budget

    conn = get_connection()
    budget.set_enabled(conn, uid, True)
    conn.commit()
    conn.close()
    body = api.get("/api/bootstrap").json()
    assert body["budget_enabled"] is True
    assert body["tag_names"] == ["work"]
    assert body["recent_tags"] == ["work"]
