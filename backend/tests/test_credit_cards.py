"""Credit cards (old tests/test_credit_cards.py): owed / available, the
statement cycle, paying a card by transfer. The export/import test is PENDING
with the excel import/export domain."""

from datetime import date

from vbx.core import finance

from .conftest import get_connection, register_and_login, user_id


def _account(uid, name):
    conn = get_connection()
    row = conn.execute("SELECT * FROM accounts WHERE user_id = ? AND name = ?", (uid, name)).fetchone()
    conn.close()
    return row


def _add_card(api, name="Eurobank Visa", **fields):
    data = {
        "name": name,
        "account_type": "credit",
        "opening_balance": "0",
        "credit_limit": "1000",
        "statement_day": "5",
        "due_day": "25",
    }
    data.update(fields)
    return api.post("/api/accounts", json=data)


def _status_on(uid, account_id, as_of):
    conn = get_connection()
    cutoff = date.fromordinal(as_of.toordinal() + 1).isoformat()
    row = next(r for r in finance.fetch_account_balances_through(conn, cutoff, uid) if r["id"] == account_id)
    status = finance.credit_card_status(conn, uid, row, as_of)
    conn.close()
    return status


def test_statement_close_and_due_dates():
    # Closing day not reached yet this month -> last month's statement.
    assert finance.last_statement_close(date(2026, 3, 3), 5) == date(2026, 2, 5)
    assert finance.last_statement_close(date(2026, 3, 5), 5) == date(2026, 3, 5)
    # Day 31 closes on the last day of short months.
    assert finance.last_statement_close(date(2026, 2, 28), 31) == date(2026, 2, 28)
    assert finance.last_statement_close(date(2026, 2, 27), 31) == date(2026, 1, 31)
    # Due later the same month, or the next month when the due day comes first.
    assert finance.statement_due_date(date(2026, 3, 5), 25) == date(2026, 3, 25)
    assert finance.statement_due_date(date(2026, 3, 25), 25) == date(2026, 4, 25)
    assert finance.statement_due_date(date(2026, 1, 31), 15) == date(2026, 2, 15)


def test_add_card_stores_owed_opening_balance_as_negative(client):
    api = register_and_login(client, "cardopen")
    uid = user_id("cardopen")
    resp = _add_card(api, opening_balance="300")
    assert resp.status_code == 200

    card = _account(uid, "Eurobank Visa")
    assert card["account_type"] == "credit"
    assert card["opening_balance"] == -300
    assert card["credit_limit"] == 1000
    assert (card["statement_day"], card["due_day"]) == (5, 25)
    out = resp.json()
    assert (out["opening_balance"], out["opening_balance_input"], out["is_credit_card"]) == (-300, 300, True)


def test_card_fields_are_validated(client):
    api = register_and_login(client, "cardbad")
    uid = user_id("cardbad")

    resp = _add_card(api, name="Bad due", due_day="40")
    assert resp.status_code == 400
    assert "between 1 and 31" in resp.json()["detail"]
    assert _account(uid, "Bad due") is None

    resp = _add_card(api, name="No close", statement_day="")
    assert resp.status_code == 400
    assert "Set the statement day too" in resp.json()["detail"]
    assert _account(uid, "No close") is None

    # A bank account ignores card inputs entirely.
    resp = api.post("/api/accounts", json={"name": "Bank", "opening_balance": "50", "credit_limit": "999"})
    assert resp.status_code == 200
    bank = _account(uid, "Bank")
    assert bank["account_type"] == "bank"
    assert bank["opening_balance"] == 50
    assert bank["credit_limit"] is None


def test_statement_follows_spending_and_payments(client):
    api = register_and_login(client, "cardcycle")
    uid = user_id("cardcycle")
    _add_card(api)
    card_id = _account(uid, "Eurobank Visa")["id"]
    bank_id = _account(uid, "Main")["id"]

    conn = get_connection()
    category_id = conn.execute("SELECT id FROM categories WHERE user_id = ? LIMIT 1", (uid,)).fetchone()["id"]
    for spent_at, amount in (("2026-03-01", -200), ("2026-03-10", -50)):
        conn.execute(
            "INSERT INTO expenses (user_id, notes, amount, category_id, account_id, spent_at)"
            " VALUES (?, '', ?, ?, ?, ?)",
            (uid, amount, category_id, card_id, spent_at),
        )
    conn.execute(
        "INSERT INTO account_transfers (user_id, from_account_id, to_account_id, amount, transferred_at, notes)"
        " VALUES (?, ?, ?, 120, '2026-03-12', '')",
        (uid, bank_id, card_id),
    )
    conn.commit()
    conn.close()

    status = _status_on(uid, card_id, date(2026, 3, 15))
    assert status["owed"] == 130
    assert status["available"] == 870
    statement = status["statement"]
    # Only the 1 Mar purchase was on the 5 Mar statement; the payment counts against it.
    assert statement["closed_on"] == date(2026, 3, 5)
    assert statement["amount"] == 200
    assert statement["remaining"] == 80
    assert statement["due_on"] == date(2026, 3, 25)
    assert statement["state"] == "open"

    assert _status_on(uid, card_id, date(2026, 3, 20))["statement"]["state"] == "soon"
    assert _status_on(uid, card_id, date(2026, 3, 26))["statement"]["state"] == "overdue"

    # The same figures through the API: GET /api/accounts?month=2026-03 judges
    # the card on 31 Mar (month end), after the 25 Mar due date.
    card = next(a for a in api.get("/api/accounts?month=2026-03").json()["items"] if a["id"] == card_id)
    assert card["card"]["owed"] == 130
    assert card["card"]["statement"]["closed_on"] == "2026-03-05"
    assert card["card"]["statement"]["remaining"] == 80
    assert card["card"]["statement"]["state"] == "overdue"

    api.post(
        "/api/transfers",
        json={"from_account_id": bank_id, "to_account_id": card_id, "amount": "80", "transferred_at": "2026-03-20"},
    )
    assert _status_on(uid, card_id, date(2026, 3, 26))["statement"]["state"] == "paid"


def test_home_splits_totals_and_pay_link_prefills_transfer(client):
    api = register_and_login(client, "cardhome")
    uid = user_id("cardhome")
    _add_card(api, opening_balance="400")
    card_id = _account(uid, "Eurobank Visa")["id"]
    bank_id = _account(uid, "Main")["id"]

    home = api.get("/api/accounts").json()
    # "Net (all accounts)" plus the "Credit cards" subtotal are shown when there is a card.
    assert home["has_cards"] is True
    assert home["totals"] == {"cash_total": 0, "cards_total": -400, "net_total": -400}
    by_id = {a["id"]: a for a in home["items"]}
    # "600,00 € available of 1.000,00 €"
    assert by_id[card_id]["card"]["available"] == 600
    assert by_id[card_id]["card"]["limit"] == 1000
    # the "Pay card" link (pay_card=<id>)
    assert by_id[card_id]["can_pay"] is True
    assert by_id[bank_id]["can_pay"] is False

    transfer = api.get(f"/api/transfers?pay_card={card_id}").json()
    assert transfer["defaults"]["from_account_id"] == bank_id
    assert transfer["defaults"]["to_account_id"] == card_id
    assert transfer["defaults"]["amount"] == 400.0
    # the balances the transfer selects show
    assert by_id[bank_id]["current_balance"] == 0
    assert by_id[card_id]["current_balance"] == -400
