"""Transfers API (old routes/accounts.py add_transfer/delete_transfer and the
Transfer panel's log and form defaults)."""

from datetime import date

from vbx.core.config import TRANSFER_LOG_LIMIT

from .conftest import user_id
from .helpers_accounts import account_id, new_user, row


def _two_accounts(app, username):
    api, *_ = new_user(app, username)
    savings = api.post("/api/accounts", json={"name": "Savings", "opening_balance": "100"}).json()["id"]
    main = account_id(user_id(username), "Main")
    return api, main, savings


def test_record_list_and_delete(app):
    api, main, savings = _two_accounts(app, "tr-crud")
    resp = api.post(
        "/api/transfers",
        json={
            "from_account_id": savings,
            "to_account_id": str(main),
            "amount": "-25.5",
            "notes": " rent ",
            "transferred_at": "2026-03-01T10:00",
        },
    )
    assert resp.status_code == 200
    out = resp.json()
    assert out["message"] == "Transfer recorded."
    t = out["transfer"]
    assert (t["amount"], t["notes"], t["transferred_at"]) == (25.5, "rent", "2026-03-01")  # abs, stripped, a day
    assert (t["from_account_name"], t["to_account_name"]) == ("Savings", "Main")

    blank_date = api.post(
        "/api/transfers", json={"from_account_id": savings, "to_account_id": main, "amount": 1}
    ).json()
    assert blank_date["transfer"]["transferred_at"] == date.today().isoformat()

    log = api.get("/api/transfers").json()
    assert log["limit"] == TRANSFER_LOG_LIMIT
    assert [x["id"] for x in log["items"]] == [blank_date["transfer"]["id"], t["id"]]  # newest first

    assert api.delete(f"/api/transfers/{t['id']}").status_code == 200
    assert row("account_transfers", t["id"]) is None
    resp = api.delete(f"/api/transfers/{t['id']}")
    assert (resp.status_code, resp.json()["detail"]) == (404, "Transfer not found.")


def test_log_is_limited_and_ordered_by_date_then_id(app):
    api, main, savings = _two_accounts(app, "tr-log")
    ids = []
    for i in range(TRANSFER_LOG_LIMIT + 2):
        day = "2026-01-05" if i % 2 else "2026-01-06"
        r = api.post(
            "/api/transfers",
            json={"from_account_id": main, "to_account_id": savings, "amount": i + 1, "transferred_at": day},
        )
        ids.append((day, r.json()["transfer"]["id"]))
    expected = [i for _d, i in sorted(ids, key=lambda x: (x[0], x[1]), reverse=True)][:TRANSFER_LOG_LIMIT]
    assert [x["id"] for x in api.get("/api/transfers").json()["items"]] == expected


def test_validation_messages(app):
    _other, _c, _i, other_acc = new_user(app, "tr-other")
    api, main, savings = _two_accounts(app, "tr-valid")
    cases = (
        ({"to_account_id": main, "amount": 1}, "Choose the two accounts."),
        ({"from_account_id": main, "to_account_id": "", "amount": 1}, "Choose the two accounts."),
        ({"from_account_id": "a", "to_account_id": main, "amount": 1}, "Invalid accounts."),
        ({"from_account_id": main, "to_account_id": main, "amount": 1}, "Choose two different accounts."),
        ({"from_account_id": main, "to_account_id": savings, "amount": "0"}, "Enter a positive amount."),
        ({"from_account_id": main, "to_account_id": savings, "amount": "junk"}, "Enter a positive amount."),
        ({"from_account_id": main, "to_account_id": savings}, "Enter a positive amount."),
        ({"from_account_id": main, "to_account_id": other_acc, "amount": 1}, "Invalid accounts."),
        ({"from_account_id": other_acc, "to_account_id": main, "amount": 1}, "Invalid accounts."),
    )
    for body, message in cases:
        resp = api.post("/api/transfers", json=body)
        assert (resp.status_code, resp.json()["detail"]) == (400, message), body
    assert api.get("/api/transfers").json()["items"] == []


def test_other_users_transfers_are_not_found(app):
    owner, main, savings = _two_accounts(app, "tr-owner")
    intruder, *_ = new_user(app, "tr-intruder")
    t = owner.post("/api/transfers", json={"from_account_id": main, "to_account_id": savings, "amount": 3}).json()
    assert intruder.delete(f"/api/transfers/{t['transfer']['id']}").status_code == 404
    assert row("account_transfers", t["transfer"]["id"]) is not None
    assert intruder.get("/api/transfers").json()["items"] == []


def test_form_defaults(app):
    api, *_ = new_user(app, "tr-defaults")
    one = api.get("/api/transfers").json()["defaults"]
    main = one["from_account_id"]
    assert (one["to_account_id"], one["amount"], one["transferred_at"]) == (main, None, date.today().isoformat())

    savings = api.post("/api/accounts", json={"name": "Alpha savings"}).json()["id"]
    two = api.get("/api/transfers").json()["defaults"]
    assert (two["from_account_id"], two["to_account_id"]) == (savings, main)  # first two by name
    # pay_card that is not a card (or junk) changes nothing
    assert api.get(f"/api/transfers?pay_card={savings}").json()["defaults"] == two
    assert api.get("/api/transfers?pay_card=x").json()["defaults"] == two

    card = api.post(
        "/api/accounts",
        json={"name": "AA card", "account_type": "credit", "opening_balance": "0", "statement_day": "1"},
    ).json()["id"]
    paid_off = api.get(f"/api/transfers?pay_card={card}").json()["defaults"]
    # the first non-card account pays; nothing owed -> no amount
    assert (paid_off["from_account_id"], paid_off["to_account_id"], paid_off["amount"]) == (savings, card, None)
