"""Month end reconciliation: plan (transfers + "balancing input" on Other) and apply."""

from vbx.api.services.reconciliation import Move, plan_moves

from .conftest import get_connection, user_id
from .helpers_accounts import account_id, new_user

DAY = "2026-10-31"


# --- the planner ---------------------------------------------------------------


def test_plan_pairs_largest_first_and_balances_exactly():
    transfers, adjustments = plan_moves({1: -5000, 2: 3000, 3: 2000})
    assert transfers == [Move(1, 2, 3000), Move(1, 3, 2000)]
    assert adjustments == []


def test_plan_leftover_shortfall_is_an_expense():
    transfers, adjustments = plan_moves({1: -10000, 2: 3000})
    assert transfers == [Move(1, 2, 3000)]
    assert adjustments == [Move(1, None, 7000)]  # from_id: expense out of account 1


def test_plan_leftover_surplus_is_an_income():
    transfers, adjustments = plan_moves({1: -1000, 2: 2500, 3: 0})
    assert transfers == [Move(1, 2, 1000)]
    assert adjustments == [Move(None, 2, 1500)]  # to_id: income into account 2


def test_plan_single_account_and_nothing_to_do():
    assert plan_moves({1: -1234}) == ([], [Move(1, None, 1234)])
    assert plan_moves({1: 0, 2: 0}) == ([], [])


def test_plan_ties_follow_order():
    transfers, _ = plan_moves({5: -200, 7: 100, 6: 100}, order={5: 0, 6: 1, 7: 2})
    assert transfers == [Move(5, 6, 100), Move(5, 7, 100)]


# --- the API -------------------------------------------------------------------


def _setup(app, username):
    """Main (opening 1000), Savings (opening 500) and a card owing 200."""
    api, *_ = new_user(app, username)
    uid = user_id(username)
    main = account_id(uid, "Main")
    api.put(f"/api/accounts/{main}", json={"name": "Main", "opening_balance": "1000"})
    savings = api.post("/api/accounts", json={"name": "Savings", "opening_balance": "500"}).json()["id"]
    card = api.post(
        "/api/accounts",
        json={"name": "Visa", "opening_balance": "200", "account_type": "credit", "credit_limit": "2000"},
    ).json()["id"]
    return api, uid, main, savings, card


def _balances(api, day=DAY):
    items = api.get("/api/accounts", params={"month": day[:7]}).json()["items"]
    return {a["id"]: a["current_balance"] for a in items}


def test_preview_does_not_write(app):
    api, uid, main, savings, card = _setup(app, "rec-preview")
    body = {"date": DAY, "balances": [{"account_id": main, "actual_balance": 900}]}
    resp = api.post("/api/reconciliation/preview", json=body)
    assert resp.status_code == 200, resp.text
    plan = resp.json()
    assert plan["date"] == DAY
    assert plan["accounts"] == [
        {
            "account_id": main,
            "name": "Main",
            "is_credit_card": False,
            "system_balance": 1000.0,
            "actual_balance": 900.0,
            "difference": -100.0,
        }
    ]
    assert plan["transfers"] == []
    assert plan["adjustments"] == [
        {"account_id": main, "account_name": "Main", "kind": "expense", "amount": 100.0, "category_name": "Other"}
    ]
    assert plan["notes"] == "balancing input"
    conn = get_connection()
    try:
        assert conn.execute("SELECT COUNT(*) FROM expenses WHERE user_id = ?", (uid,)).fetchone()[0] == 0
    finally:
        conn.close()


def test_apply_moves_money_and_books_the_rest_on_other(app):
    api, uid, main, savings, card = _setup(app, "rec-apply")
    # Real life: Main 700, Savings 750, card owes 250 (balance -250).
    body = {
        "date": DAY,
        "balances": [
            {"account_id": main, "actual_balance": 700},
            {"account_id": savings, "actual_balance": 750},
            {"account_id": card, "actual_balance": -250},
        ],
    }
    resp = api.post("/api/reconciliation/apply", json=body)
    assert resp.status_code == 200, resp.text
    out = resp.json()
    assert out["message"] == "Balances reconciled."
    # Main -300; Savings +250; card -50. Transfers: Main->Savings 250; leftover Main -50 and card -50 as expenses.
    assert [(t["from_account_id"], t["to_account_id"], t["amount"]) for t in out["transfers"]] == [
        (main, savings, 250.0)
    ]
    assert sorted((a["account_id"], a["kind"], a["amount"]) for a in out["adjustments"]) == sorted(
        [(main, "expense", 50.0), (card, "expense", 50.0)]
    )

    assert _balances(api) == {main: 700.0, savings: 750.0, card: -250.0}

    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT e.amount, e.notes, c.name, e.spent_at FROM expenses e JOIN categories c ON c.id = e.category_id "
            "WHERE e.user_id = ? ORDER BY e.id",
            (uid,),
        ).fetchall()
        tr = conn.execute("SELECT notes, transferred_at FROM account_transfers WHERE user_id = ?", (uid,)).fetchall()
    finally:
        conn.close()
    assert [(r["amount"], r["notes"], r["name"], r["spent_at"][:10]) for r in rows] == [
        (-50.0, "balancing input", "Other", DAY),
        (-50.0, "balancing input", "Other", DAY),
    ]
    assert [(r["notes"], r["transferred_at"][:10]) for r in tr] == [("Month end reconciliation", DAY)]

    # Running it again with the same numbers changes nothing.
    again = api.post("/api/reconciliation/apply", json=body).json()
    assert (again["transfers"], again["adjustments"], again["message"]) == ([], [], "Everything already matches.")


def test_apply_surplus_becomes_income_on_other(app):
    api, uid, main, savings, card = _setup(app, "rec-income")
    body = {"date": DAY, "balances": [{"account_id": savings, "actual_balance": 512.34}]}
    out = api.post("/api/reconciliation/apply", json=body).json()
    assert out["adjustments"] == [
        {"account_id": savings, "account_name": "Savings", "kind": "income", "amount": 12.34, "category_name": "Other"}
    ]
    conn = get_connection()
    try:
        r = conn.execute(
            "SELECT i.amount, i.notes, c.name FROM income_entries i JOIN income_categories c ON c.id = i.category_id "
            "WHERE i.user_id = ?",
            (uid,),
        ).fetchone()
    finally:
        conn.close()
    assert (r["amount"], r["notes"], r["name"]) == (12.34, "balancing input", "Other")
    assert _balances(api)[savings] == 512.34


def test_other_category_is_created_when_missing(app):
    api, uid, main, *_ = _setup(app, "rec-noother")
    conn = get_connection()
    try:
        conn.execute("DELETE FROM categories WHERE user_id = ? AND name = 'Other'", (uid,))
        conn.commit()
    finally:
        conn.close()
    out = api.post(
        "/api/reconciliation/apply", json={"date": DAY, "balances": [{"account_id": main, "actual_balance": 990}]}
    ).json()
    assert out["adjustments"][0]["kind"] == "expense"
    conn = get_connection()
    try:
        n = conn.execute("SELECT COUNT(*) FROM categories WHERE user_id = ? AND name = 'Other'", (uid,)).fetchone()[0]
    finally:
        conn.close()
    assert n == 1


def test_only_entries_up_to_the_date_count(app):
    api, uid, main, *_ = _setup(app, "rec-date")
    conn = get_connection()
    try:
        cat = conn.execute("SELECT id FROM categories WHERE user_id = ? ORDER BY id LIMIT 1", (uid,)).fetchone()["id"]
    finally:
        conn.close()
    api.post("/api/expenses", json={"amount": "-40", "category_id": cat, "account_id": main, "spent_at": DAY})
    api.post("/api/expenses", json={"amount": "-60", "category_id": cat, "account_id": main, "spent_at": "2026-11-01"})
    plan = api.post(
        "/api/reconciliation/preview", json={"date": DAY, "balances": [{"account_id": main, "actual_balance": 960}]}
    ).json()
    assert plan["accounts"][0]["system_balance"] == 960.0  # the 1 Nov expense is after the date
    assert plan["adjustments"] == []


def test_validation_and_other_users_accounts(app):
    api, uid, main, *_ = _setup(app, "rec-valid")
    new_user(app, "rec-valid-other")
    foreign = account_id(user_id("rec-valid-other"), "Main")

    resp = api.post("/api/reconciliation/preview", json={"date": DAY, "balances": []})
    assert (resp.status_code, resp.json()["detail"]) == (400, "Enter at least one balance.")
    resp = api.post(
        "/api/reconciliation/apply", json={"date": DAY, "balances": [{"account_id": foreign, "actual_balance": 1}]}
    )
    assert (resp.status_code, resp.json()["detail"]) == (400, "Invalid account.")
    bad_day = {"date": "not-a-day", "balances": [{"account_id": main, "actual_balance": 1}]}
    resp = api.post("/api/reconciliation/preview", json=bad_day)
    assert resp.status_code == 400


def test_start_lists_every_account_with_its_balance_on_the_day(app):
    api, uid, main, savings, card = _setup(app, "rec-start")
    out = api.get("/api/reconciliation", params={"date": DAY}).json()
    assert out["date"] == DAY
    assert [(a["account_id"], a["name"], a["is_credit_card"], a["system_balance"]) for a in out["accounts"]] == [
        (main, "Main", False, 1000.0),
        (savings, "Savings", False, 500.0),
        (card, "Visa", True, -200.0),
    ]
    assert api.get("/api/reconciliation", params={"date": "nope"}).status_code == 400
