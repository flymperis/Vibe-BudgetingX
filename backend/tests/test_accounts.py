"""Accounts API (old routes/accounts.py + the dashboard's balance block)."""

from datetime import date, timedelta

from .conftest import get_connection, user_id
from .helpers_accounts import account_id, new_user, row


def test_add_edit_delete_bank_account(app):
    api, *_ = new_user(app, "acc-crud")
    resp = api.post("/api/accounts", json={"name": " Piraeus ", "opening_balance": "-12.5"})
    assert resp.status_code == 200
    acc = resp.json()
    assert (acc["name"], acc["account_type"], acc["opening_balance"], acc["current_balance"]) == (
        "Piraeus",
        "bank",
        -12.5,
        -12.5,
    )
    assert acc["bank"]["slug"] == "piraeus"
    assert acc["card"] is None and acc["can_pay"] is False

    resp = api.put(f"/api/accounts/{acc['id']}", json={"name": "Piraeus 2", "opening_balance": 40})
    assert (resp.status_code, resp.json()["name"], resp.json()["opening_balance"]) == (200, "Piraeus 2", 40)

    assert api.delete(f"/api/accounts/{acc['id']}").status_code == 200
    assert row("accounts", acc["id"]) is None
    resp = api.delete(f"/api/accounts/{acc['id']}")
    assert (resp.status_code, resp.json()["detail"]) == (404, "Account not found.")


def test_validation_messages(app):
    api, *_ = new_user(app, "acc-valid")
    cases = (
        ({"name": "X", "opening_balance": "abc"}, "Invalid opening balance."),
        ({"name": "X", "account_type": "credit", "credit_limit": "lots"}, "Invalid credit limit."),
        ({"name": "X", "account_type": "credit", "credit_limit": "-1"}, "Invalid credit limit."),
        ({"name": "X", "account_type": "credit", "statement_day": "x"}, "Invalid statement day."),
        ({"name": "X", "account_type": "credit", "statement_day": "0"}, "The statement day must be between 1 and 31."),
        ({"name": "X", "account_type": "credit", "statement_day": "5", "due_day": "x"}, "Invalid payment due day."),
        (
            {"name": "X", "account_type": "credit", "statement_day": "5", "due_day": "32"},
            "The payment due day must be between 1 and 31.",
        ),
        (
            {"name": "X", "account_type": "credit", "due_day": "5"},
            "Set the statement day too, so the due date can be worked out.",
        ),
        ({"name": "  "}, "Enter a name."),
        ({"name": "Main"}, "An account with that name already exists."),
    )
    for body, message in cases:
        resp = api.post("/api/accounts", json=body)
        assert (resp.status_code, resp.json()["detail"]) == (400, message), body
    assert [a["name"] for a in api.get("/api/accounts").json()["items"]] == ["Main"]

    # field errors win over a blank name, like the old route
    resp = api.post("/api/accounts", json={"name": "", "opening_balance": "abc"})
    assert resp.json()["detail"] == "Invalid opening balance."

    other = api.post("/api/accounts", json={"name": "Other"}).json()
    resp = api.put(f"/api/accounts/{other['id']}", json={"name": "Main"})
    assert (resp.status_code, resp.json()["detail"]) == (400, "An account with that name already exists.")
    resp = api.put(f"/api/accounts/{other['id']}", json={"name": "Other", "account_type": "credit", "due_day": "3"})
    assert resp.status_code == 400
    assert row("accounts", other["id"])["account_type"] == "bank"


def test_card_edit_and_switching_back_to_bank(app):
    api, *_ = new_user(app, "acc-card")
    card = api.post(
        "/api/accounts",
        json={"name": "Visa", "account_type": "credit", "opening_balance": "-50", "statement_day": "31"},
    ).json()
    assert (card["opening_balance"], card["opening_balance_input"], card["credit_limit"], card["due_day"]) == (
        -50,
        50,
        None,
        None,
    )
    assert card["card"]["limit"] is None and card["card"]["available"] is None
    # zero owed is stored as 0.0, not -0.0
    zero = api.post("/api/accounts", json={"name": "Zero", "account_type": "credit", "opening_balance": "0"}).json()
    assert str(row("accounts", zero["id"])["opening_balance"]) == "0.0"

    resp = api.put(
        f"/api/accounts/{card['id']}",
        json={
            "name": "Visa",
            "account_type": "bank",
            "opening_balance": "-50",
            "credit_limit": "500",
            "statement_day": "3",
        },
    )
    stored = row("accounts", card["id"])
    assert resp.status_code == 200
    assert (stored["account_type"], stored["opening_balance"], stored["credit_limit"], stored["statement_day"]) == (
        "bank",
        -50,
        None,
        None,
    )


def test_account_in_use_is_not_deleted(app):
    api, cat, _inc, acc = new_user(app, "acc-in-use")
    api.post("/api/expenses", json={"amount": "-1", "category_id": cat, "account_id": acc})
    resp = api.delete(f"/api/accounts/{acc}")
    assert resp.status_code == 400
    assert resp.json()["detail"] == (
        "That account is still in use, so it was not deleted. Reassign or delete its entries first."
    )
    assert row("accounts", acc) is not None
    assert api.post("/api/accounts", json={"name": "After"}).status_code == 200  # not locked


def test_other_users_accounts_are_not_found(app):
    owner, *_ = new_user(app, "acc-owner")
    intruder, *_ = new_user(app, "acc-intruder")
    acc = owner.post("/api/accounts", json={"name": "Secret"}).json()
    resp = intruder.put(f"/api/accounts/{acc['id']}", json={"name": "Mine"})
    assert (resp.status_code, resp.json()["detail"]) == (404, "Account not found.")
    assert intruder.delete(f"/api/accounts/{acc['id']}").status_code == 404
    assert row("accounts", acc["id"])["name"] == "Secret"
    assert "Secret" not in [a["name"] for a in intruder.get("/api/accounts").json()["items"]]


def test_balances_follow_the_selected_month(app):
    api, cat, inc, acc = new_user(app, "acc-month")
    uid = user_id("acc-month")
    bank2 = api.post("/api/accounts", json={"name": "Bank2", "opening_balance": "100"}).json()["id"]
    today = date.today()
    conn = get_connection()
    conn.execute(
        "INSERT INTO income_entries (user_id, notes, amount, category_id, account_id, received_at)"
        " VALUES (?, '', 30, ?, ?, '2025-01-10')",
        (uid, inc, acc),
    )
    conn.execute(
        "INSERT INTO expenses (user_id, notes, amount, category_id, account_id, spent_at)"
        " VALUES (?, '', -5, ?, ?, '2025-02-01')",
        (uid, cat, acc),
    )
    conn.execute(
        "INSERT INTO account_transfers (user_id, from_account_id, to_account_id, amount, transferred_at, notes)"
        " VALUES (?, ?, ?, 20, '2025-01-20', '')",
        (uid, bank2, acc),
    )
    # a future movement is not in today's balance
    conn.execute(
        "INSERT INTO expenses (user_id, notes, amount, category_id, account_id, spent_at) VALUES (?, '', -7, ?, ?, ?)",
        (uid, cat, acc, (today + timedelta(days=40)).isoformat()),
    )
    conn.commit()
    conn.close()

    jan = api.get("/api/accounts?month=2025-01").json()
    assert (jan["month"], jan["balance_as_of"], jan["through_today"], jan["has_cards"]) == (
        "2025-01",
        "2025-01-31",
        False,
        False,
    )
    by_name = {a["name"]: a["current_balance"] for a in jan["items"]}
    assert by_name == {"Bank2": 80, "Main": 50}
    assert jan["totals"] == {"cash_total": 130, "cards_total": 0, "net_total": 130}
    assert {a["name"]: a["current_balance"] for a in api.get("/api/accounts?month=2025-02").json()["items"]} == {
        "Bank2": 80,
        "Main": 45,
    }
    now = api.get("/api/accounts").json()
    assert (now["month"], now["balance_as_of"], now["through_today"]) == (
        today.strftime("%Y-%m"),
        today.isoformat(),
        True,
    )
    assert {a["name"]: a["current_balance"] for a in now["items"]}["Main"] == 45
    assert api.get("/api/accounts?month=junk").json()["month"] == today.strftime("%Y-%m")
    assert account_id(uid, "Bank2") == bank2
