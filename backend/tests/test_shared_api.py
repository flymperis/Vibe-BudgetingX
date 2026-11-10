"""Shared API: every validation branch and ownership check ported from the old
routes/shared.py, plus the read model (overview, group detail, form defaults).
The old suite had no tests for most of these."""

from datetime import date

from fastapi.testclient import TestClient

from vbx.core import shared

from .conftest import get_connection, register_and_login, user_id
from .helpers_shared import add_expense, core, count, ledger, main_and_general, one, setup_group, two_users


def _err(resp, status, detail):
    assert resp.status_code == status, resp.text
    assert resp.json() == {"detail": detail}


# --- auth --------------------------------------------------------------------


def test_needs_login_and_csrf(client):
    assert client.get("/api/shared").status_code == 401
    assert client.get("/api/shared/groups/1").status_code == 401
    api = register_and_login(client, "sh-auth")
    resp = client.post("/api/shared/people", json={"name": "Anna"})  # no CSRF header
    assert resp.status_code == 403
    assert api.post("/api/shared/people", json={"name": "Anna"}).status_code == 200


# --- people --------------------------------------------------------------------


def test_people_add_rename_delete(client):
    api = register_and_login(client, "sh-people")
    uid = user_id("sh-people")
    _err(api.post("/api/shared/people", json={"name": " , ,"}), 400, "Enter a name.")
    resp = api.post("/api/shared/people", json={"name": "Anna,  Nikos\nanna, Maria "})
    assert resp.json() == {"ok": True, "message": "Added Anna, Nikos, Maria.", "group_id": None}
    contacts = api.get("/api/shared").json()["contacts"]
    assert [c["name"] for c in contacts] == ["Anna", "Maria", "Nikos"]
    assert all(c["login"] is None and c["group_count"] == 0 for c in contacts)
    ids = {c["name"]: c["id"] for c in contacts}
    # adding an existing name (any case) does not duplicate it
    api.post("/api/shared/people", json={"name": "ANNA"})
    assert count("SELECT COUNT(*) FROM shared_people WHERE user_id = ? AND is_self = 0", uid) == 3

    _err(api.put(f"/api/shared/people/{ids['Anna']}", json={"name": "  "}), 400, "Enter a name.")
    _err(
        api.put(f"/api/shared/people/{ids['Anna']}", json={"name": "nikos"}),
        400,
        "There is already someone called nikos.",
    )
    assert api.put(f"/api/shared/people/{ids['Anna']}", json={"name": " Anna  K "}).json()["message"] == "Name saved."
    assert one("SELECT name FROM shared_people WHERE id = ?", ids["Anna"])["name"] == "Anna K"
    _err(api.put("/api/shared/people/999999", json={"name": "X"}), 404, "That person can't be renamed.")

    me = core(shared.ensure_self, uid)
    _err(api.put(f"/api/shared/people/{me}", json={"name": "Me"}), 400, "That person can't be renamed.")
    _err(api.delete(f"/api/shared/people/{me}"), 400, "That person can't be removed.")
    _err(api.delete("/api/shared/people/999999"), 404, "That person can't be removed.")

    api.post("/api/shared/groups", json={"name": "G", "member_ids": [ids["Maria"]]})
    _err(api.delete(f"/api/shared/people/{ids['Maria']}"), 400, "Remove them from their groups first.")
    assert api.delete(f"/api/shared/people/{ids['Nikos']}").json()["message"] == "Person removed."
    assert not one("SELECT 1 FROM shared_people WHERE id = ?", ids["Nikos"])


def test_people_are_private(app):
    owner = register_and_login(TestClient(app), "sh-pown")
    owner.post("/api/shared/people", json={"name": "Secret"})
    pid = one("SELECT id FROM shared_people WHERE user_id = ? AND name = 'Secret'", user_id("sh-pown"))["id"]
    other = register_and_login(TestClient(app), "sh-pother")
    assert other.get("/api/shared").json()["contacts"] == []
    assert other.put(f"/api/shared/people/{pid}", json={"name": "Mine"}).status_code == 404
    assert other.delete(f"/api/shared/people/{pid}").status_code == 404
    _err(
        other.put(f"/api/shared/people/{pid}/link", json={"username": "sh-pother"}), 400, "That person can't be linked."
    )
    # old behaviour: unlinking someone else's (group-less) contact silently does nothing
    assert other.delete(f"/api/shared/people/{pid}/link").json()["message"] == "Unlinked."
    assert one("SELECT name FROM shared_people WHERE id = ?", pid)["name"] == "Secret"


def test_link_and_unlink_rules(app):
    register_and_login(TestClient(app), "sh-target")
    register_and_login(TestClient(app), "sh-target2")
    api = register_and_login(TestClient(app), "sh-linker")
    uid = user_id("sh-linker")
    api.post("/api/shared/people", json={"name": "Tom, Tim"})
    p = {
        r["name"]: r["id"]
        for r in get_connection().execute("SELECT id, name FROM shared_people WHERE user_id = ?", (uid,))
    }
    _err(
        api.put(f"/api/shared/people/{p['Tom']}/link", json={"username": "ghost"}),
        400,
        "There is no user called “ghost” on this server.",
    )
    _err(api.put(f"/api/shared/people/{p['Tom']}/link", json={"username": "sh-linker"}), 400, "That's your own login.")
    assert api.put(f"/api/shared/people/{p['Tom']}/link", json={"username": "@sh-target"}).status_code == 200
    # linking again to the same login is a no-op success
    assert api.put(f"/api/shared/people/{p['Tom']}/link", json={"username": "sh-target"}).status_code == 200
    _err(api.put(f"/api/shared/people/{p['Tom']}/link", json={"username": "sh-target2"}), 400, "Unlink them first.")
    _err(
        api.put(f"/api/shared/people/{p['Tim']}/link", json={"username": "sh-target"}),
        400,
        "That user is already linked to Tom.",
    )
    contacts = {c["name"]: c for c in api.get("/api/shared").json()["contacts"]}
    assert contacts["Tom"]["login"] == "sh-target"

    api.post("/api/shared/groups", json={"name": "G", "member_ids": [p["Tom"]]})
    _err(
        api.delete(f"/api/shared/people/{p['Tom']}/link"),
        400,
        "They are in a group; unlinking would lock them out of it.",
    )
    assert api.put(f"/api/shared/people/{p['Tim']}/link", json={"username": "sh-target2"}).status_code == 200
    assert api.delete(f"/api/shared/people/{p['Tim']}/link").json()["message"] == "Unlinked."
    assert one("SELECT linked_user_id FROM shared_people WHERE id = ?", p["Tim"])["linked_user_id"] is None


# --- groups and members ------------------------------------------------------------


def test_create_group_validation_and_members(app):
    register_and_login(TestClient(app), "sh-gfriend")
    api = register_and_login(TestClient(app), "sh-gowner")
    uid = user_id("sh-gowner")
    _err(api.post("/api/shared/groups", json={"name": "   "}), 400, "Give the group a name.")
    # unknown username: nothing is saved, not even the typed names
    _err(
        api.post("/api/shared/groups", json={"name": "X", "new_members": "Zed", "usernames": "nobody"}),
        400,
        "There is no user called “nobody” on this server.",
    )
    assert count("SELECT COUNT(*) FROM shared_groups WHERE user_id = ?", uid) == 0
    assert not one("SELECT 1 FROM shared_people WHERE user_id = ? AND name = 'Zed'", uid)

    resp = api.post(
        "/api/shared/groups",
        json={"name": " Crete   trip ", "new_members": ["Anna", "Bob"], "usernames": "sh-gfriend"},
    )
    body = resp.json()
    assert body["message"] == "Group “Crete trip” created. 1 user was invited."
    gid = body["group_id"]
    detail = api.get(f"/api/shared/groups/{gid}").json()
    assert detail["name"] == "Crete trip" and detail["is_owner"] is True
    assert [m["name"] for m in detail["members"]] == ["You", "Anna", "Bob", "sh-gfriend"]
    statuses = {m["name"]: m["status"] for m in detail["members"]}
    assert statuses == {"You": "active", "Anna": "active", "Bob": "active", "sh-gfriend": "invited"}
    me = detail["members"][0]
    assert me["is_me"] and me["is_owner"] and not me["removable"]
    assert detail["shared_with_users"] == 0  # the friend has not accepted yet
    assert detail["member_names"] == ["You", "Anna", "Bob", "sh-gfriend"]

    # rename
    _err(api.put(f"/api/shared/groups/{gid}", json={"name": ""}), 400, "Give the group a name.")
    _err(api.put("/api/shared/groups/999999", json={"name": "Y"}), 404, "Group not found.")
    assert api.put(f"/api/shared/groups/{gid}", json={"name": "Crete"}).json() == {
        "ok": True,
        "message": "Group renamed.",
        "group_id": gid,
    }


def test_add_and_remove_members(app):
    register_and_login(TestClient(app), "sh-mfriend")
    api, uid, gid, people, main, cat = setup_group(TestClient(app), "sh-mowner")
    _err(api.post(f"/api/shared/groups/{gid}/members", json={}), 400, "Choose someone to add.")
    _err(api.post("/api/shared/groups/999999/members", json={"new_members": "X"}), 404, "Group not found.")
    _err(
        api.post(f"/api/shared/groups/{gid}/members", json={"usernames": "ghost"}),
        400,
        "There is no user called “ghost” on this server.",
    )
    _err(
        api.post(f"/api/shared/groups/{gid}/members", json={"person_id": people["Anna"]}),
        400,
        "They are already in this group.",
    )
    resp = api.post(f"/api/shared/groups/{gid}/members", json={"new_members": "Carla"})
    assert resp.json() == {"ok": True, "message": "Member added.", "group_id": gid}
    resp = api.post(f"/api/shared/groups/{gid}/members", json={"usernames": "sh-mfriend"})
    assert resp.json()["message"] == "Invitation sent. They'll see the group once they accept."
    # inviting the same login again: already there
    _err(
        api.post(f"/api/shared/groups/{gid}/members", json={"usernames": "sh-mfriend"}),
        400,
        "They are already in this group.",
    )

    # addable_contacts: own contacts not in the group
    api.post("/api/shared/people", json={"name": "Dora"})
    addable = api.get(f"/api/shared/groups/{gid}").json()["addable_contacts"]
    assert [c["name"] for c in addable] == ["Dora"]
    dora = addable[0]["id"]
    assert api.post(f"/api/shared/groups/{gid}/members", json={"member_ids": [str(dora)]}).status_code == 200

    # someone else's contact id is ignored
    other = register_and_login(TestClient(app), "sh-mother")
    other.post("/api/shared/people", json={"name": "Eve"})
    eve = one("SELECT id FROM shared_people WHERE user_id = ? AND name = 'Eve'", user_id("sh-mother"))["id"]
    _err(api.post(f"/api/shared/groups/{gid}/members", json={"person_id": eve}), 400, "Choose someone to add.")

    carla = one("SELECT id FROM shared_people WHERE user_id = ? AND name = 'Carla'", uid)["id"]
    resp = api.delete(f"/api/shared/groups/{gid}/members/{carla}")
    assert resp.json() == {"ok": True, "message": "Member removed.", "group_id": gid}
    assert not one("SELECT 1 FROM shared_group_members WHERE group_id = ? AND person_id = ?", gid, carla)
    _err(api.delete(f"/api/shared/groups/999999/members/{carla}"), 404, "Group not found.")
    me = people["You"]
    _err(api.delete(f"/api/shared/groups/{gid}/members/{me}"), 400, "The group's creator can't be removed.")
    # outsiders can't touch members
    _err(other.delete(f"/api/shared/groups/{gid}/members/{dora}"), 404, "Group not found.")


def test_invitations_accept_and_decline_need_an_invitation(app):
    owner, friend, o_uid, f_uid, gid, people = two_users(app, "sh-iowner", "sh-ifriend", accept=False)
    _err(owner.post(f"/api/shared/groups/{gid}/accept"), 404, "Invitation not found.")
    _err(friend.post("/api/shared/groups/999999/accept"), 404, "Invitation not found.")
    assert friend.post(f"/api/shared/groups/{gid}/accept").json() == {
        "ok": True,
        "message": "You joined the group. Use “Add to my budget” on bills you want in your own accounts.",
        "group_id": gid,
    }
    _err(friend.post(f"/api/shared/groups/{gid}/accept"), 404, "Invitation not found.")
    detail = owner.get(f"/api/shared/groups/{gid}").json()
    assert detail["shared_with_users"] == 1
    assert api_names(friend.get(f"/api/shared/groups/{gid}").json()) == ["You", "sh-iowner"]


def api_names(detail):
    return [m["name"] for m in detail["members"]]


def test_declined_user_can_be_invited_again(app):
    owner, friend, o_uid, f_uid, gid, people = two_users(app, "sh-downer", "sh-dfriend", accept=False)
    friend.post(f"/api/shared/groups/{gid}/decline")
    resp = owner.post(f"/api/shared/groups/{gid}/members", json={"person_id": people["friend"]})
    assert resp.json()["message"] == "Invitation sent. They'll see the group once they accept."
    assert [i["id"] for i in friend.get("/api/shared").json()["invitations"]] == [gid]


# --- bills ----------------------------------------------------------------------


def test_expense_validation_branches(client):
    api, uid, gid, people, main, cat = setup_group(client, "sh-evalid")
    you, anna = people["You"], people["Anna"]
    cases = (
        ({"amount": ""}, "Enter the bill amount."),
        ({"amount": "abc"}, "Enter the bill amount."),
        ({"amount": "-5"}, "Enter the bill amount."),
        ({"amount": "0"}, "Enter an amount above zero."),
        ({"paid_by": None}, "Choose who paid from the group's members."),
        ({"paid_by": 999999}, "Choose who paid from the group's members."),
        ({"split_method": "weird"}, "Choose how to split the bill."),
        ({"included": []}, "Pick at least one person to split with."),
        ({"split_method": "exact", "values": {str(you): "10"}}, "The amounts add up to 10.00 €, not 90.00 €."),
        (
            {"split_method": "exact", "values": {str(you): "x"}},
            "Each person's amount must be a number of zero or more.",
        ),
        (
            {"split_method": "shares", "values": {str(you): "-1"}},
            "Each person's number of shares must be a number of zero or more.",
        ),
        (
            {"split_method": "percent", "values": {str(you): "abc"}},
            "Each person's percentage must be a number of zero or more.",
        ),
        ({"split_method": "shares", "values": {}}, "Give at least one person a share of the bill."),
        ({"record_personal": True, "account_id": main}, "Choose the category for your share."),
        ({"record_personal": "1", "category_id": 999999, "account_id": main}, "Choose the category for your share."),
        (
            {"record_personal": "1", "category_id": cat},
            "Choose the account the money actually left (not Shared balances).",
        ),
        (
            {"record_personal": "1", "category_id": cat, "account_id": 999999},
            "Choose the account the money actually left (not Shared balances).",
        ),
    )
    for fields, message in cases:
        _err(add_expense(api, gid, people, **fields), 400, message)
    assert count("SELECT COUNT(*) FROM shared_expenses WHERE group_id = ?", gid) == 0
    _err(add_expense(api, 999999, people), 404, "Group not found.")

    # Shared balances itself is not an account you can pay from
    add_expense(api, gid, people, paid_by=anna, record_personal="1", category_id=cat)
    led = ledger(uid)
    _err(
        add_expense(api, gid, people, record_personal="1", category_id=cat, account_id=led),
        400,
        "Choose the account the money actually left (not Shared balances).",
    )
    # record_personal is ignored when I'm neither payer nor sharer
    resp = add_expense(api, gid, people, paid_by=anna, included=[anna], record_personal="1")
    assert resp.status_code == 200
    # someone else's category is refused
    other = register_and_login(TestClient(client.app), "sh-evalid-other")
    o_main, o_cat = main_and_general(user_id("sh-evalid-other"))
    _err(
        add_expense(api, gid, people, record_personal="1", category_id=o_cat, account_id=main),
        400,
        "Choose the category for your share.",
    )
    _err(
        add_expense(api, gid, people, record_personal="1", category_id=cat, account_id=o_main),
        400,
        "Choose the account the money actually left (not Shared balances).",
    )
    assert other.get("/api/shared").json()["groups"] == []


def test_expense_defaults_description_date_and_values(client):
    api, uid, gid, people, main, cat = setup_group(client, "sh-edefaults")
    resp = add_expense(api, gid, people, description="  ", spent_on="", amount="12,345")
    assert resp.json()["message"] == "Added “Expense”."
    row = one("SELECT * FROM shared_expenses WHERE group_id = ?", gid)
    assert row["description"] == "Expense" and row["amount_cents"] == 1235
    assert row["spent_on"] == date.today().isoformat()
    # shares and percent keep the typed values, exact keeps the amount
    api.post(
        f"/api/shared/groups/{gid}/expenses",
        json={
            "description": "Fuel",
            "amount": 90,
            "paid_by": str(people["You"]),
            "split_method": "shares",
            "spent_on": "2026-01-02T10:00",
            "values": {str(people["You"]): 2, str(people["Anna"]): "1,0", str(people["Nikos"]): None},
        },
    )
    fuel = next(a for a in api.get(f"/api/shared/groups/{gid}").json()["activity"] if a["description"] == "Fuel")
    assert fuel["date"] == "2026-01-02"
    assert [(s["name"], s["share"], s["input_value"]) for s in fuel["splits"]] == [
        ("You", 60.0, "2"),
        ("Anna", 30.0, "1"),
    ]
    assert fuel["method_label"] == "Shares" and fuel["effect_text"] == "you lent" and fuel["effect"] == 30.0
    assert fuel["payload"]["values"] == {str(people["You"]): "2", str(people["Anna"]): "1"}
    assert fuel["payload"]["amount"] == "90.00" and fuel["payload"]["record_personal"] is False


def test_edit_validation_and_editing_without_recording_unrecords_me(client):
    api, uid, gid, people, main, cat = setup_group(client, "sh-eedit")
    add_expense(api, gid, people, record_personal="1", category_id=cat, account_id=main)
    eid = one("SELECT id FROM shared_expenses WHERE group_id = ?", gid)["id"]
    base = {"description": "Dinner", "amount": "90", "paid_by": people["You"], "included": list(people.values())}
    _err(api.put("/api/shared/expenses/999999", json=base), 404, "Expense not found.")
    _err(api.put(f"/api/shared/expenses/{eid}", json={**base, "amount": "0"}), 400, "Enter an amount above zero.")
    assert one("SELECT amount_cents FROM shared_expenses WHERE id = ?", eid)["amount_cents"] == 9000
    assert count("SELECT COUNT(*) FROM expenses WHERE user_id = ?", uid) == 1
    # the old form sent record_personal unchecked -> the editor's own rows go
    assert api.put(f"/api/shared/expenses/{eid}", json=base).status_code == 200
    assert count("SELECT COUNT(*) FROM expenses WHERE user_id = ?", uid) == 0
    assert count("SELECT COUNT(*) FROM shared_expense_links WHERE expense_id = ?", eid) == 0


def test_record_and_unrecord_a_bill(client):
    api, uid, gid, people, main, cat = setup_group(client, "sh-record")
    add_expense(api, gid, people)
    eid = one("SELECT id FROM shared_expenses WHERE group_id = ?", gid)["id"]
    _err(api.put("/api/shared/expenses/999999/record", json={}), 404, "Expense not found.")
    _err(
        api.put(f"/api/shared/expenses/{eid}/record", json={"account_id": main}),
        400,
        "Choose the category for your share.",
    )
    _err(
        api.put(f"/api/shared/expenses/{eid}/record", json={"category_id": cat}),
        400,
        "Choose the account you paid from.",
    )
    resp = api.put(f"/api/shared/expenses/{eid}/record", json={"category_id": str(cat), "account_id": str(main)})
    assert resp.json()["message"] == "Added to your budget."
    assert count("SELECT COUNT(*) FROM expenses WHERE user_id = ?", uid) == 1
    led = ledger(uid)
    _err(
        api.put(f"/api/shared/expenses/{eid}/record", json={"category_id": cat, "account_id": led}),
        400,
        "Choose the account you paid from.",
    )
    resp = api.delete(f"/api/shared/expenses/{eid}/record")
    assert resp.json() == {"ok": True, "message": "Removed from your budget.", "group_id": gid}
    assert count("SELECT COUNT(*) FROM expenses WHERE user_id = ?", uid) == 0
    _err(api.delete("/api/shared/expenses/999999/record"), 404, "Expense not found.")

    # a bill I'm not part of
    add_expense(api, gid, people, description="Theirs", paid_by=people["Anna"], included=[people["Anna"]])
    theirs = one("SELECT id FROM shared_expenses WHERE description = 'Theirs'")["id"]
    _err(
        api.put(f"/api/shared/expenses/{theirs}/record", json={"category_id": cat}),
        400,
        "You aren't part of this bill.",
    )
    item = next(a for a in api.get(f"/api/shared/groups/{gid}").json()["activity"] if a["id"] == theirs)
    assert (item["involved"], item["effect"], item["effect_text"]) == (False, 0.0, "not involved")


def test_record_incomplete_when_made_payer_after_recording(app):
    owner, friend, o_uid, f_uid, gid, people = two_users(app, "sh-incowner", "sh-incfriend")
    f_main, f_cat = main_and_general(f_uid)
    both = [people["owner"], people["friend"]]
    owner.post(
        f"/api/shared/groups/{gid}/expenses",
        json={"description": "X", "amount": "10", "paid_by": people["owner"], "included": both},
    )
    eid = one("SELECT id FROM shared_expenses WHERE group_id = ?", gid)["id"]
    friend.put(f"/api/shared/expenses/{eid}/record", json={"category_id": f_cat})
    owner.put(
        f"/api/shared/expenses/{eid}",
        json={"description": "X", "amount": "10", "paid_by": people["friend"], "included": both},
    )
    item = friend.get(f"/api/shared/groups/{gid}").json()["activity"][0]
    assert item["recorded"] and item["record_incomplete"] and item["i_paid"]


# --- settlements -------------------------------------------------------------------


def test_settlement_validation_branches(client):
    api, uid, gid, people, main, cat = setup_group(client, "sh-svalid")
    you, anna, nikos = people["You"], people["Anna"], people["Nikos"]
    base = {"from_person_id": you, "to_person_id": anna, "amount": "10"}
    for fields, message in (
        ({"from_person_id": None}, "Choose who paid and who received from the group's members."),
        ({"to_person_id": 999999}, "Choose who paid and who received from the group's members."),
        ({"to_person_id": you}, "Someone can't pay themselves."),
        ({"amount": "abc"}, "Enter an amount above zero."),
        ({"amount": "0"}, "Enter an amount above zero."),
        ({"record_personal": "1"}, "Choose the account the money went from or to (not Shared balances)."),
        (
            {"record_personal": "1", "account_id": 999999},
            "Choose the account the money went from or to (not Shared balances).",
        ),
    ):
        _err(api.post(f"/api/shared/groups/{gid}/settlements", json={**base, **fields}), 400, message)
    _err(api.post("/api/shared/groups/999999/settlements", json=base), 404, "Group not found.")
    assert count("SELECT COUNT(*) FROM shared_settlements WHERE group_id = ?", gid) == 0

    # not involved: record_personal is ignored, no account needed
    resp = api.post(
        f"/api/shared/groups/{gid}/settlements",
        json={
            "from_person_id": anna,
            "to_person_id": nikos,
            "amount": "5",
            "record_personal": "1",
            "notes": "  cash  ",
            "paid_on": "",
        },
    )
    assert resp.status_code == 200
    row = one("SELECT * FROM shared_settlements WHERE group_id = ?", gid)
    assert (row["notes"], row["paid_on"], row["amount_cents"]) == ("cash", date.today().isoformat(), 500)
    assert count("SELECT COUNT(*) FROM shared_settlement_links WHERE settlement_id = ?", row["id"]) == 0
    item = api.get(f"/api/shared/groups/{gid}").json()["activity"][0]
    assert item["kind"] == "settlement"
    assert (item["from_name"], item["to_name"], item["involved"], item["effect"], item["added_by"]) == (
        "Anna",
        "Nikos",
        False,
        0.0,
        "you",
    )


def test_record_unrecord_and_delete_settlement(app):
    api, uid, gid, people, main, cat = setup_group(TestClient(app), "sh-srec")
    api.post(
        f"/api/shared/groups/{gid}/settlements",
        json={"from_person_id": people["Anna"], "to_person_id": people["You"], "amount": "20", "paid_on": "2026-03-01"},
    )
    sid = one("SELECT id FROM shared_settlements WHERE group_id = ?", gid)["id"]
    item = api.get(f"/api/shared/groups/{gid}").json()["activity"][0]
    assert (item["involved"], item["recorded"], item["i_paid"], item["effect"]) == (True, False, False, -20.0)
    _err(api.put("/api/shared/settlements/999999/record", json={"account_id": main}), 404, "Payment not found.")
    _err(api.put(f"/api/shared/settlements/{sid}/record", json={}), 400, "Choose a real account (not Shared balances).")
    assert api.put(f"/api/shared/settlements/{sid}/record", json={"account_id": main}).status_code == 200
    tr = one("SELECT * FROM account_transfers WHERE user_id = ?", uid)
    led = ledger(uid)
    assert (tr["from_account_id"], tr["to_account_id"], tr["amount"]) == (led, main, 20.0)
    assert tr["notes"] == "[Shared] Settle up (received) · Trip"
    _err(
        api.put(f"/api/shared/settlements/{sid}/record", json={"account_id": led}),
        400,
        "Choose a real account (not Shared balances).",
    )
    assert api.get(f"/api/shared/groups/{gid}").json()["activity"][0]["recorded"] is True

    outsider = register_and_login(TestClient(app), "sh-srec-out")
    _err(outsider.delete(f"/api/shared/settlements/{sid}"), 404, "Payment not found.")
    _err(outsider.put(f"/api/shared/settlements/{sid}/record", json={"account_id": main}), 404, "Payment not found.")
    _err(outsider.delete(f"/api/shared/settlements/{sid}/record"), 404, "Payment not found.")

    resp = api.delete(f"/api/shared/settlements/{sid}/record")
    assert resp.json() == {"ok": True, "message": "Payment removed from your accounts.", "group_id": gid}
    assert count("SELECT COUNT(*) FROM account_transfers WHERE user_id = ?", uid) == 0
    _err(api.delete("/api/shared/settlements/999999"), 404, "Payment not found.")
    assert api.delete(f"/api/shared/settlements/{sid}").json()["message"] == "Payment deleted."


# --- read model ----------------------------------------------------------------------


def test_overview_for_a_new_user(client):
    api = register_and_login(client, "sh-empty")
    body = api.get("/api/shared").json()
    assert body["contacts"] == [] and body["groups"] == [] and body["invitations"] == []
    assert body["friend_balances"] == [] and (body["owed_to_me"], body["i_owe"], body["net"]) == (0, 0, 0)
    assert body["ledger_account_id"] is None
    assert [a["name"] for a in body["own_accounts"]] == ["Main"]
    assert body["split_methods"] == [
        {"key": "equal", "label": "Equally"},
        {"key": "exact", "label": "Exact amounts"},
        {"key": "percent", "label": "Percentages"},
        {"key": "shares", "label": "Shares"},
    ]
    # the user's own person was created and committed, as the dashboard did
    assert one("SELECT 1 FROM shared_people WHERE user_id = ? AND is_self = 1", user_id("sh-empty"))


def test_group_detail_balances_suggestions_and_defaults(client):
    api, uid, gid, people, main, cat = setup_group(client, "sh-detail")
    detail = api.get(f"/api/shared/groups/{gid}").json()
    today = date.today().isoformat()
    ids = [m["id"] for m in detail["members"]]
    assert detail["me_id"] == people["You"] and ids[0] == people["You"]
    assert detail["expense_defaults"] == {
        "paid_by": people["You"],
        "split_method": "equal",
        "included": ids,
        "spent_on": today,
        "record_personal": True,
    }
    # no suggestion yet: you pay the second member in the list
    assert detail["settlement_defaults"] == {
        "from_person_id": people["You"],
        "to_person_id": ids[1],
        "amount": None,
        "paid_on": today,
        "record_personal": True,
    }
    assert detail["activity"] == [] and detail["suggestions"] == [] and detail["total_spent"] == 0

    add_expense(api, gid, people, paid_by=people["Anna"], amount="30", spent_on="2026-05-01")
    api.post(
        f"/api/shared/groups/{gid}/settlements",
        json={"from_person_id": people["You"], "to_person_id": people["Anna"], "amount": "4", "paid_on": "2026-05-01"},
    )
    add_expense(api, gid, people, description="Later", amount="3", spent_on="2026-05-02")
    detail = api.get(f"/api/shared/groups/{gid}").json()
    # newest first; on the same day the bill comes before the payment
    assert [(a["kind"], a["date"]) for a in detail["activity"]] == [
        ("expense", "2026-05-02"),
        ("expense", "2026-05-01"),
        ("settlement", "2026-05-01"),
    ]
    assert detail["total_spent"] == 33.0
    nets = {m["name"]: m["net"] for m in detail["members"]}
    # Anna: +30 -10 -1 -4 (received); You: -10 +3 -1 +4 (paid); Nikos: -10 -1
    assert nets == {"You": -4.0, "Anna": 15.0, "Nikos": -11.0}
    assert detail["my_net"] == -4.0
    assert [(s["from_name"], s["to_name"], s["amount"], s["involves_me"]) for s in detail["suggestions"]] == [
        ("Nikos", "Anna", 11.0, False),
        ("You", "Anna", 4.0, True),
    ]
    first = detail["suggestions"][0]
    assert detail["settlement_defaults"]["from_person_id"] == first["from_id"]
    assert detail["settlement_defaults"]["to_person_id"] == first["to_id"]
    assert detail["settlement_defaults"]["amount"] == 11.0
    summary = api.get("/api/shared").json()["groups"]
    assert summary == [
        {"id": gid, "name": "Trip", "member_names": ["You", "Anna", "Nikos"], "my_net": -4.0, "shared_with_users": 0}
    ]
