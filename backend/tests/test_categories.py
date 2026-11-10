"""Categories API (old routes/categories.py): add, rename, delete rules for
expense and income categories, and the counts the list carries."""

import pytest

from .conftest import get_connection, user_id
from .helpers_accounts import new_user, row

KINDS = (("/api/categories", "categories"), ("/api/income-categories", "income_categories"))


@pytest.mark.parametrize("url,table", KINDS)
def test_add_rename_delete(app, url, table):
    api, *_ = new_user(app, f"cat-crud-{table}")
    resp = api.post(url, json={"name": "  Pets  "})
    assert resp.status_code == 200
    created = resp.json()
    assert (created["name"], created["entry_count"], created["rule_count"], created["can_delete"]) == (
        "Pets",
        0,
        0,
        True,
    )
    assert "Pets" in [c["name"] for c in api.get(url).json()["items"]]

    resp = api.put(f"{url}/{created['id']}", json={"name": "Animals"})
    assert (resp.status_code, resp.json()["name"]) == (200, "Animals")
    assert row(table, created["id"])["name"] == "Animals"
    # renaming to its own name is fine
    assert api.put(f"{url}/{created['id']}", json={"name": "Animals"}).status_code == 200

    assert api.delete(f"{url}/{created['id']}").status_code == 200
    assert row(table, created["id"]) is None
    resp = api.delete(f"{url}/{created['id']}")
    assert (resp.status_code, resp.json()["detail"]) == (404, "Category not found.")


@pytest.mark.parametrize("url,table", KINDS)
def test_blank_and_duplicate_names_are_refused(app, url, table):
    api, *_ = new_user(app, f"cat-names-{table}")
    for name in ("", "   ", None):
        resp = api.post(url, json={"name": name})
        assert (resp.status_code, resp.json()["detail"]) == (400, "Enter a name.")
    resp = api.post(url, json={"name": "General"})  # seeded for every user
    assert (resp.status_code, resp.json()["detail"]) == (400, "A category with that name already exists.")

    other = api.post(url, json={"name": "Spare"}).json()
    resp = api.put(f"{url}/{other['id']}", json={"name": "General"})
    assert (resp.status_code, resp.json()["detail"]) == (400, "A category with that name already exists.")
    resp = api.put(f"{url}/{other['id']}", json={"name": " "})
    assert (resp.status_code, resp.json()["detail"]) == (400, "Enter a name.")
    assert row(table, other["id"])["name"] == "Spare"
    # the connection was rolled back: the next write still goes through
    assert api.post(url, json={"name": "After"}).status_code == 200


@pytest.mark.parametrize("url,table", KINDS)
def test_other_users_categories_are_not_found(app, url, table):
    owner, *_ = new_user(app, f"cat-owner-{table}")
    intruder, *_ = new_user(app, f"cat-intruder-{table}")
    created = owner.post(url, json={"name": "Mine"}).json()
    resp = intruder.put(f"{url}/{created['id']}", json={"name": "Stolen"})
    assert (resp.status_code, resp.json()["detail"]) == (404, "Category not found.")
    assert intruder.delete(f"{url}/{created['id']}").status_code == 404
    assert row(table, created["id"])["name"] == "Mine"
    assert "Mine" not in [c["name"] for c in intruder.get(url).json()["items"]]
    # and the same name is free for another user
    assert intruder.post(url, json={"name": "Mine"}).status_code == 200


def test_counts_and_plural_messages(app):
    api, cat, inc, acc = new_user(app, "cat-counts")
    uid = user_id("cat-counts")
    for _ in range(2):
        api.post("/api/expenses", json={"amount": "-1", "category_id": cat, "account_id": acc})
        api.post("/api/income", json={"amount": "1", "category_id": inc, "account_id": acc})
    conn = get_connection()
    for entry_type, category_id in (("expense", cat), ("expense", cat), ("income", inc)):
        conn.execute(
            "INSERT INTO recurring_entries"
            " (user_id, entry_type, amount, category_id, account_id, day_of_month, notes, enabled)"
            " VALUES (?, ?, 5, ?, ?, 1, '', 1)",
            (uid, entry_type, category_id, acc),
        )
    conn.commit()
    conn.close()

    expense_cat = next(c for c in api.get("/api/categories").json()["items"] if c["id"] == cat)
    assert (expense_cat["entry_count"], expense_cat["rule_count"], expense_cat["can_delete"]) == (2, 2, False)
    income_cat = next(c for c in api.get("/api/income-categories").json()["items"] if c["id"] == inc)
    assert (income_cat["entry_count"], income_cat["rule_count"]) == (2, 1)

    resp = api.delete(f"/api/categories/{cat}")
    assert resp.status_code == 400
    assert (
        resp.json()["detail"] == "“General” still has 2 expenses and 2 recurring rules. Reassign or delete them first."
    )
    resp = api.delete(f"/api/income-categories/{inc}")
    assert resp.json()["detail"] == (
        "“General” still has 2 income entries and 1 recurring rule. Reassign or delete them first."
    )


def test_list_is_ordered_by_name(app):
    api, *_ = new_user(app, "cat-order")
    api.post("/api/categories", json={"name": "Alpha"})
    api.post("/api/categories", json={"name": "Zulu"})
    names = [c["name"] for c in api.get("/api/categories").json()["items"]]
    assert names == sorted(names) == ["Alpha", "General", "Other", "Zulu"]
