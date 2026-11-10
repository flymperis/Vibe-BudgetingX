"""Income API: the old routes/income.py rules and the dashboard's income list."""

from datetime import date

from vbx.core.config import LIST_PAGE_SIZE

from .conftest import get_connection, user_id
from .helpers_accounts import new_user, row


def test_amount_is_stored_positive_and_junk_becomes_zero(app):
    api, _cat, inc, acc = new_user(app, "inc-amounts")
    for raw, stored in (("1500", 1500.0), ("-20.5", 20.5), (-7, 7.0), (" 3 ", 3.0), ("abc", 0.0), ("", 0.0)):
        resp = api.post("/api/income", json={"amount": raw, "category_id": inc, "account_id": acc})
        assert resp.status_code == 200, (raw, resp.text)
        assert resp.json()["amount"] == stored
        assert row("income_entries", resp.json()["id"])["amount"] == stored
    # amount omitted altogether: the old form default "0"
    assert api.post("/api/income", json={"category_id": inc, "account_id": acc}).json()["amount"] == 0.0


def test_dates_notes_and_string_ids(app):
    api, _cat, inc, acc = new_user(app, "inc-dates")
    today = date.today().isoformat()
    for raw, expected in (
        ("2026-03-14", "2026-03-14"),
        ("2026-03-14T18:42:00", "2026-03-14"),
        ("", today),
        (None, today),
    ):
        resp = api.post(
            "/api/income",
            json={"amount": "1", "category_id": str(inc), "account_id": str(acc), "received_at": raw, "notes": " x "},
        )
        assert resp.status_code == 200
        assert resp.json()["received_at"] == expected
        assert resp.json()["notes"] == "x"
        assert resp.json()["category_name"] == "General" and resp.json()["account_name"] == "Main"
        assert row("income_entries", resp.json()["id"])["received_at"] == expected


def test_validation_and_ownership(app):
    _other, _ocat, other_inc, other_acc = new_user(app, "inc-other")
    api, _cat, inc, acc = new_user(app, "inc-valid")

    resp = api.post("/api/income", json={"amount": "1", "account_id": acc})
    assert (resp.status_code, resp.json()["detail"]) == (400, "Choose a category and an account.")
    resp = api.post("/api/income", json={"amount": "1", "category_id": inc, "account_id": " "})
    assert (resp.status_code, resp.json()["detail"]) == (400, "Choose a category and an account.")
    resp = api.post("/api/income", json={"amount": "1", "category_id": "x", "account_id": acc})
    assert (resp.status_code, resp.json()["detail"]) == (400, "Invalid category or account.")
    for cat, account in ((other_inc, acc), (inc, other_acc)):  # someone else's category / account
        resp = api.post("/api/income", json={"amount": "1", "category_id": cat, "account_id": account})
        assert (resp.status_code, resp.json()["detail"]) == (400, "Invalid category or account.")
    assert api.get("/api/income").json()["total"] == 0


def test_edit_and_delete_are_scoped_to_the_owner(app):
    owner, _c, inc, acc = new_user(app, "inc-owner")
    intruder, _c2, inc2, acc2 = new_user(app, "inc-intruder")
    entry = owner.post("/api/income", json={"amount": "10", "category_id": inc, "account_id": acc}).json()

    resp = intruder.put(f"/api/income/{entry['id']}", json={"amount": "1", "category_id": inc2, "account_id": acc2})
    assert (resp.status_code, resp.json()["detail"]) == (404, "Income entry not found.")
    assert intruder.delete(f"/api/income/{entry['id']}").status_code == 404
    assert row("income_entries", entry["id"])["amount"] == 10.0
    # the owner cannot move it onto someone else's account either
    resp = owner.put(f"/api/income/{entry['id']}", json={"amount": "1", "category_id": inc, "account_id": acc2})
    assert resp.status_code == 400

    resp = owner.put(
        f"/api/income/{entry['id']}",
        json={"amount": "12.5", "category_id": inc, "account_id": acc, "notes": "bonus", "received_at": "2026-01-02"},
    )
    assert resp.status_code == 200
    assert (resp.json()["amount"], resp.json()["notes"], resp.json()["received_at"]) == (12.5, "bonus", "2026-01-02")
    assert owner.delete(f"/api/income/{entry['id']}").status_code == 200
    assert row("income_entries", entry["id"]) is None
    assert owner.delete(f"/api/income/{entry['id']}").status_code == 404


def test_list_filters_and_pagination(app):
    _other, _oc, other_inc, _oa = new_user(app, "inc-list-other")
    api, _cat, inc, acc = new_user(app, "inc-list")
    uid = user_id("inc-list")
    conn = get_connection()
    salary = conn.execute("SELECT id FROM income_categories WHERE user_id = ? AND name = 'Salary'", (uid,)).fetchone()[
        "id"
    ]
    for i in range(LIST_PAGE_SIZE + 5):
        conn.execute(
            "INSERT INTO income_entries (user_id, notes, amount, category_id, account_id, received_at)"
            " VALUES (?, ?, 1, ?, ?, ?)",
            (uid, f"n{i}", inc, acc, f"2026-01-{i % 28 + 1:02d}"),
        )
    conn.execute(
        "INSERT INTO income_entries (user_id, notes, amount, category_id, account_id, received_at)"
        " VALUES (?, 'feb', 1, ?, ?, '2026-02-03')",
        (uid, salary, acc),
    )
    conn.commit()
    conn.close()

    data = api.get("/api/income").json()
    assert (data["total"], data["pages"], data["page"], data["page_size"]) == (LIST_PAGE_SIZE + 6, 2, 1, LIST_PAGE_SIZE)
    assert data["items"][0]["notes"] == "feb"  # newest first
    assert len(data["items"]) == LIST_PAGE_SIZE
    assert len(api.get("/api/income?page=2").json()["items"]) == 6
    assert api.get("/api/income?page=99").json()["page"] == 2  # clamped
    assert api.get("/api/income?page=junk").json()["page"] == 1

    feb = api.get("/api/income?month=2026-02").json()
    assert (feb["month"], feb["total"]) == ("2026-02", 1)
    assert api.get("/api/income?month=junk").json()["month"] is None
    by_cat = api.get(f"/api/income?category_id={salary}").json()
    assert (by_cat["category_id"], by_cat["total"]) == (salary, 1)
    # someone else's category is ignored (all categories)
    ignored = api.get(f"/api/income?category_id={other_inc}").json()
    assert (ignored["category_id"], ignored["total"]) == (None, LIST_PAGE_SIZE + 6)
