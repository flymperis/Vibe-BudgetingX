"""Helpers for the shared-expenses API tests (old tests/test_shared.py)."""

from fastapi.testclient import TestClient

from vbx.core import finance, shared

from .conftest import get_connection, register_and_login, user_id


def one(sql, *params):
    conn = get_connection()
    try:
        return conn.execute(sql, params).fetchone()
    finally:
        conn.close()


def count(sql, *params) -> int:
    return int(one(sql, *params)[0])


def core(fn, *args, **kwargs):
    """Call a vbx.core.shared function with a fresh connection."""
    conn = get_connection()
    try:
        return fn(conn, *args, **kwargs)
    finally:
        conn.close()


def balance(uid, account_id) -> float:
    conn = get_connection()
    try:
        rows = finance.fetch_account_balances_through(conn, "2100-01-01", uid)
    finally:
        conn.close()
    for row in rows:
        if int(row["id"]) == int(account_id):
            return round(float(row["current_balance"]), 2)
    raise AssertionError("account not found")


def ledger(uid):
    return core(shared.ledger_account_id, uid)


def main_and_general(uid):
    main = one("SELECT id FROM accounts WHERE user_id = ? AND name = 'Main'", uid)["id"]
    cat = one("SELECT id FROM categories WHERE user_id = ? AND name = 'General'", uid)["id"]
    return main, cat


def people_of(uid):
    conn = get_connection()
    try:
        return {
            r["name"]: r["id"] for r in conn.execute("SELECT id, name FROM shared_people WHERE user_id = ?", (uid,))
        }
    finally:
        conn.close()


def setup_group(client, username):
    """Old _setup_group: a user with a group "Trip" holding You, Anna and Nikos."""
    api = register_and_login(client, username)
    uid = user_id(username)
    resp = api.post("/api/shared/groups", json={"name": "Trip", "new_members": "Anna, Nikos"})
    assert resp.status_code == 200, resp.text
    gid = resp.json()["group_id"]
    assert gid == one("SELECT id FROM shared_groups WHERE user_id = ?", uid)["id"]
    main, cat = main_and_general(uid)
    return api, uid, gid, people_of(uid), main, cat


def add_expense(api, gid, people, **fields):
    """Old _add_expense: Dinner 90 on 2026-11-01 paid by You, split equally
    between everyone in `people`."""
    body = {
        "description": "Dinner",
        "amount": "90",
        "spent_on": "2026-11-01",
        "paid_by": people["You"],
        "split_method": "equal",
        "included": list(people.values()),
    }
    body.update(fields)
    return api.post(f"/api/shared/groups/{gid}/expenses", json=body)


def two_users(app, owner_name, friend_name, accept=True):
    """Old _two_users: the owner creates "Flat" inviting the friend by login."""
    friend = register_and_login(TestClient(app), friend_name)
    owner = register_and_login(TestClient(app), owner_name)
    resp = owner.post("/api/shared/groups", json={"name": "Flat", "usernames": friend_name})
    assert resp.status_code == 200, resp.text
    o_uid, f_uid = user_id(owner_name), user_id(friend_name)
    gid = one("SELECT id FROM shared_groups WHERE user_id = ?", o_uid)["id"]
    if accept:
        assert friend.post(f"/api/shared/groups/{gid}/accept").status_code == 200
    people = {
        "owner": core(shared.member_person, gid, o_uid),
        "friend": core(shared.member_person, gid, f_uid, statuses=("active", "invited", "declined")),
    }
    return owner, friend, o_uid, f_uid, gid, people
