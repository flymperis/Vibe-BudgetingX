"""Expenses API: the old routes/expenses.py rules and the dashboard's expenses list."""

from datetime import date

from vbx.core.config import LIST_PAGE_SIZE

from .conftest import first_ids, get_connection, register_and_login, user_id


def _setup(client, username):
    api = register_and_login(client, username)
    cat, _inc, acc = first_ids(username)
    return api, cat, acc


def _row(expense_id):
    conn = get_connection()
    row = conn.execute("SELECT * FROM expenses WHERE id = ?", (expense_id,)).fetchone()
    conn.close()
    return row


def test_amount_is_stored_signed_as_sent_and_junk_becomes_zero(client):
    api, cat, acc = _setup(client, "exp-amounts")
    cases = (("-4.20", -4.2), (" 12.5 ", 12.5), (-7, -7.0), (3.25, 3.25), ("abc", 0.0), ("", 0.0), (None, 0.0))
    for raw, stored in cases:
        resp = api.post("/api/expenses", json={"amount": raw, "category_id": cat, "account_id": acc})
        assert resp.status_code == 200, (raw, resp.text)
        assert resp.json()["amount"] == stored
        assert _row(resp.json()["id"])["amount"] == stored
    # amount omitted altogether: the old form default "0"
    resp = api.post("/api/expenses", json={"category_id": cat, "account_id": acc})
    assert resp.json()["amount"] == 0.0


def test_dates_are_normalised_to_a_calendar_day(client):
    api, cat, acc = _setup(client, "exp-dates")
    today = date.today().isoformat()
    for raw, expected in (
        ("2026-03-14", "2026-03-14"),
        ("2026-03-14T18:42:00", "2026-03-14"),
        ("2026-03-14 18:42", "2026-03-14"),
        ("", today),
        (None, today),
    ):
        resp = api.post("/api/expenses", json={"amount": "-1", "category_id": cat, "account_id": acc, "spent_at": raw})
        assert resp.status_code == 200
        assert resp.json()["spent_at"] == expected, raw
        assert _row(resp.json()["id"])["spent_at"] == expected


def test_notes_are_stripped_and_ids_may_be_strings(client):
    api, cat, acc = _setup(client, "exp-notes")
    resp = api.post(
        "/api/expenses",
        json={"notes": "  lunch #work  ", "amount": "-9", "category_id": str(cat), "account_id": f" {acc} "},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["notes"] == "lunch #work"
    assert (body["category_id"], body["account_id"]) == (cat, acc)
    assert body["category_name"] == "General" and body["account_name"] == "Main"


def test_missing_or_invalid_category_or_account_is_400(client):
    api, cat, acc = _setup(client, "exp-invalid")
    for body, message in (
        ({"amount": "1", "account_id": acc}, "Choose a category and an account."),
        ({"amount": "1", "category_id": cat}, "Choose a category and an account."),
        ({"amount": "1", "category_id": "", "account_id": acc}, "Choose a category and an account."),
        ({"amount": "1", "category_id": "abc", "account_id": acc}, "Invalid category or account."),
        ({"amount": "1", "category_id": cat, "account_id": 999999}, "Invalid category or account."),
    ):
        resp = api.post("/api/expenses", json=body)
        assert resp.status_code == 400, body
        assert resp.json() == {"detail": message}
    conn = get_connection()
    n = conn.execute("SELECT COUNT(*) FROM expenses WHERE user_id = ?", (user_id("exp-invalid"),)).fetchone()[0]
    conn.close()
    assert n == 0


def test_other_users_rows_are_invisible_and_untouchable(client, app):
    from fastapi.testclient import TestClient

    owner, cat, acc = _setup(client, "exp-owner")
    mine = owner.post("/api/expenses", json={"notes": "private", "amount": "-5", "category_id": cat, "account_id": acc})
    expense_id = mine.json()["id"]

    intruder, icat, iacc = _setup(TestClient(app), "exp-intruder")
    # someone else's category/account cannot be used
    resp = intruder.post("/api/expenses", json={"amount": "-1", "category_id": cat, "account_id": iacc})
    assert resp.status_code == 400
    resp = intruder.post("/api/expenses", json={"amount": "-1", "category_id": icat, "account_id": acc})
    assert resp.status_code == 400
    # someone else's expense is "not found"
    assert intruder.get("/api/expenses").json()["items"] == []
    resp = intruder.put(f"/api/expenses/{expense_id}", json={"amount": "-1", "category_id": icat, "account_id": iacc})
    assert resp.status_code == 404
    assert intruder.delete(f"/api/expenses/{expense_id}").status_code == 404
    assert _row(expense_id)["notes"] == "private"
    assert _row(expense_id)["amount"] == -5.0
    # filtering by someone else's category falls back to all categories
    listing = intruder.get("/api/expenses", params={"category_id": cat}).json()
    assert listing["category_id"] is None


def test_edit_and_delete_unknown_expense_is_404(client):
    api, cat, acc = _setup(client, "exp-404")
    body = {"amount": "-1", "category_id": cat, "account_id": acc}
    assert api.put("/api/expenses/987654", json=body).json() == {"detail": "Expense not found."}
    assert api.delete("/api/expenses/987654").status_code == 404


def test_list_filters_by_month_and_category_newest_first(client):
    api, cat, acc = _setup(client, "exp-filter")
    uid = user_id("exp-filter")
    conn = get_connection()
    other = conn.execute("SELECT id FROM categories WHERE user_id = ? AND name = 'Other'", (uid,)).fetchone()["id"]
    conn.close()
    for notes, day, category in (
        ("jan-a", "2026-01-05", cat),
        ("jan-b", "2026-01-20", other),
        ("feb-a", "2026-02-01", cat),
        ("mar-a", "2026-03-31", cat),
    ):
        api.post(
            "/api/expenses",
            json={"notes": notes, "amount": "-1", "category_id": category, "account_id": acc, "spent_at": day},
        )

    every = api.get("/api/expenses").json()
    assert [e["notes"] for e in every["items"]] == ["mar-a", "feb-a", "jan-b", "jan-a"]
    assert (every["total"], every["page"], every["pages"], every["month"], every["category_id"]) == (
        4,
        1,
        1,
        None,
        None,
    )
    assert every["page_size"] == LIST_PAGE_SIZE

    jan = api.get("/api/expenses", params={"month": "2026-01"}).json()
    assert [e["notes"] for e in jan["items"]] == ["jan-b", "jan-a"]
    assert jan["month"] == "2026-01"

    jan_general = api.get("/api/expenses", params={"month": "2026-1", "category_id": cat}).json()
    assert [e["notes"] for e in jan_general["items"]] == ["jan-a"]
    assert (jan_general["month"], jan_general["category_id"]) == ("2026-01", cat)

    # invalid filters are ignored, as in the old list
    for params in ({"month": "nonsense"}, {"month": "1999-01"}, {"category_id": "x"}, {"category_id": "-3"}):
        resp = api.get("/api/expenses", params=params).json()
        assert resp["total"] == 4, params


def test_pagination_clamps_like_the_old_list(client):
    api, cat, acc = _setup(client, "exp-pages")
    uid = user_id("exp-pages")
    conn = get_connection()
    conn.executemany(
        "INSERT INTO expenses (user_id, notes, amount, category_id, account_id, spent_at) VALUES (?, ?, -1, ?, ?, ?)",
        [(uid, f"n{i}", cat, acc, f"2026-01-{(i % 28) + 1:02d}") for i in range(LIST_PAGE_SIZE + 5)],
    )
    conn.commit()
    conn.close()

    first = api.get("/api/expenses").json()
    assert (first["total"], first["pages"], first["page"], len(first["items"])) == (
        LIST_PAGE_SIZE + 5,
        2,
        1,
        LIST_PAGE_SIZE,
    )
    second = api.get("/api/expenses", params={"page": 2}).json()
    assert (second["page"], len(second["items"])) == (2, 5)
    assert api.get("/api/expenses", params={"page": 99}).json()["page"] == 2
    assert api.get("/api/expenses", params={"page": "0"}).json()["page"] == 1
    assert api.get("/api/expenses", params={"page": "junk"}).json()["page"] == 1
    ids = {e["id"] for e in first["items"]} | {e["id"] for e in second["items"]}
    assert len(ids) == LIST_PAGE_SIZE + 5


def test_edit_changes_every_field(client):
    api, cat, acc = _setup(client, "exp-edit")
    uid = user_id("exp-edit")
    conn = get_connection()
    conn.execute("INSERT INTO accounts (user_id, name, opening_balance) VALUES (?, 'Revolut', 0)", (uid,))
    conn.commit()
    other_acc = conn.execute("SELECT id FROM accounts WHERE user_id = ? AND name = 'Revolut'", (uid,)).fetchone()["id"]
    other_cat = conn.execute("SELECT id FROM categories WHERE user_id = ? AND name = 'Other'", (uid,)).fetchone()["id"]
    conn.close()
    created = api.post(
        "/api/expenses",
        json={"notes": "a", "amount": "-1", "category_id": cat, "account_id": acc, "spent_at": "2026-01-01"},
    ).json()
    resp = api.put(
        f"/api/expenses/{created['id']}",
        json={
            "notes": " b ",
            "amount": "2.5",
            "category_id": other_cat,
            "account_id": other_acc,
            "spent_at": "2026-02-02",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert (body["notes"], body["amount"], body["category_name"], body["account_name"], body["spent_at"]) == (
        "b",
        2.5,
        "Other",
        "Revolut",
        "2026-02-02",
    )
    # an edit with no category/account is refused and changes nothing
    resp = api.put(f"/api/expenses/{created['id']}", json={"notes": "c", "amount": "9"})
    assert resp.status_code == 400
    assert _row(created["id"])["notes"] == "b"
