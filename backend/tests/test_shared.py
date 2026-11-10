"""Shared expenses (old tests/test_shared.py): split maths, debt simplification,
the shared API, and the link from a shared bill into the user's own books."""

import pytest
from fastapi.testclient import TestClient

from vbx.core import shared

from .conftest import register_and_login, user_id
from .helpers_shared import add_expense, balance, core, count, ledger, main_and_general, one, setup_group, two_users


def test_allocate_adds_up_and_spreads_leftover_cents():
    assert shared.allocate(1000, [1, 1, 1]) == [334, 333, 333]
    assert shared.allocate(1, [1, 1, 1]) == [1, 0, 0]
    assert shared.allocate(10000, [2, 1, 1]) == [5000, 2500, 2500]
    assert sum(shared.allocate(9999, [3, 7, 11])) == 9999


def test_parse_cents_accepts_comma_and_rejects_garbage():
    assert shared.parse_cents("12,5") == 1250
    assert shared.parse_cents("0.005") == 1
    for bad in ("", "abc", "-3", "nan"):
        with pytest.raises(ValueError):
            shared.parse_cents(bad)


def test_compute_splits_every_method():
    entries = [(1, True, ""), (2, True, ""), (3, False, "")]
    assert shared.compute_splits("equal", 1000, entries) == [(1, 500, ""), (2, 500, "")]

    exact = [(1, True, "6"), (2, True, "4"), (3, True, "")]
    assert [(p, c) for p, c, _ in shared.compute_splits("exact", 1000, exact)] == [(1, 600), (2, 400)]
    with pytest.raises(ValueError, match="add up"):
        shared.compute_splits("exact", 1000, [(1, True, "6"), (2, True, "3")])

    pct = [(1, True, "50"), (2, True, "25"), (3, True, "25")]
    assert [c for _, c, _ in shared.compute_splits("percent", 1001, pct)] == [501, 250, 250]
    with pytest.raises(ValueError, match="100%"):
        shared.compute_splits("percent", 1000, [(1, True, "50"), (2, True, "40")])

    parts = shared.compute_splits("shares", 900, [(1, True, "2"), (2, True, "1"), (3, True, "0")])
    assert [(p, c) for p, c, _ in parts] == [(1, 600), (2, 300)]

    with pytest.raises(ValueError):
        shared.compute_splits("equal", 1000, [(1, False, "")])


def test_simplify_debts_needs_at_most_n_minus_one_payments():
    net = {1: 3000, 2: -1000, 3: -1000, 4: -1000}
    payments = shared.simplify_debts(net)
    assert len(payments) == 3
    assert all(to == 1 for _, to, _ in payments)
    # A owes B, B owes C collapses into A paying C directly.
    assert shared.simplify_debts({1: -500, 2: 0, 3: 500}) == [(1, 3, 500)]
    assert shared.simplify_debts({1: 0, 2: 0}) == []


# --- routes (old routes/shared.py through the API) ---------------------------------


def test_paying_a_shared_bill_books_only_my_share_as_spending(client):
    api, uid, gid, people, main, cat = setup_group(client, "share_payer")
    resp = add_expense(api, gid, people, record_personal="1", category_id=cat, account_id=main)
    assert resp.status_code == 200
    assert resp.json() == {"ok": True, "message": "Added “Dinner”.", "group_id": gid}

    exp = one("SELECT amount, account_id, notes FROM expenses WHERE user_id = ?", uid)
    assert exp["amount"] == -30.0 and exp["account_id"] == main
    assert exp["notes"].startswith("[Shared] Dinner")
    led = ledger(uid)
    # 90 left Main: 30 spent, 60 lent and now owed back via Shared balances.
    assert balance(uid, main) == -90.0
    assert balance(uid, led) == 60.0

    net = core(shared.group_net_balances, gid)
    assert net[people["You"]] == 6000
    assert net[people["Anna"]] == -3000

    detail = api.get(f"/api/shared/groups/{gid}").json()
    assert detail["suggestions"]  # "Suggested payments"
    assert [a["description"] for a in detail["activity"]] == ["Dinner"]
    bill = detail["activity"][0]
    assert (bill["recorded"], bill["i_paid"], bill["my_share"], bill["effect"]) == (True, True, 30.0, 60.0)
    assert (bill["payload"]["category_id"], bill["payload"]["account_id"]) == (cat, main)
    assert detail["my_net"] == 60.0 and detail["total_spent"] == 90.0
    # the overview no longer offers Shared balances as an account to pay from
    overview = api.get("/api/shared").json()
    assert overview["ledger_account_id"] == led
    assert led not in [a["id"] for a in overview["own_accounts"]]
    assert main in [a["id"] for a in overview["own_accounts"]]


def test_someone_else_paying_books_my_share_against_shared_balances(client):
    api, uid, gid, people, main, cat = setup_group(client, "share_borrower")
    add_expense(api, gid, people, paid_by=people["Anna"], record_personal="1", category_id=cat)
    led = ledger(uid)
    assert balance(uid, led) == -30.0
    assert balance(uid, main) == 0.0

    # Settling up moves real money to clear what Shared balances says I owe.
    resp = api.post(
        f"/api/shared/groups/{gid}/settlements",
        json={
            "from_person_id": people["You"],
            "to_person_id": people["Anna"],
            "amount": "30",
            "paid_on": "2026-11-02",
            "record_personal": "1",
            "account_id": main,
        },
    )
    assert resp.json() == {"ok": True, "message": "Payment recorded.", "group_id": gid}
    assert balance(uid, led) == 0.0
    assert balance(uid, main) == -30.0
    net = core(shared.group_net_balances, gid)
    assert net[people["You"]] == 0
    assert net[people["Anna"]] == 3000

    sid = one("SELECT id FROM shared_settlements WHERE user_id = ?", uid)["id"]
    assert api.delete(f"/api/shared/settlements/{sid}").json()["message"] == "Payment deleted."
    assert balance(uid, led) == -30.0
    assert count("SELECT COUNT(*) FROM account_transfers WHERE user_id = ?", uid) == 0


def test_editing_and_deleting_rebuild_the_linked_rows(client):
    api, uid, gid, people, main, cat = setup_group(client, "share_editor")
    add_expense(api, gid, people, record_personal="1", category_id=cat, account_id=main)
    eid = one("SELECT id FROM shared_expenses WHERE user_id = ?", uid)["id"]

    body = {
        "description": "Dinner",
        "amount": "100",
        "spent_on": "2026-11-01",
        "paid_by": people["You"],
        "split_method": "exact",
        "values": {str(people["You"]): "50", str(people["Anna"]): "50"},
        "record_personal": "1",
        "category_id": cat,
        "account_id": main,
    }
    resp = api.put(f"/api/shared/expenses/{eid}", json=body)
    assert resp.json() == {"ok": True, "message": "Expense saved.", "group_id": gid}
    assert count("SELECT COUNT(*) FROM expenses WHERE user_id = ?", uid) == 1
    assert one("SELECT amount FROM expenses WHERE user_id = ?", uid)["amount"] == -50.0
    assert balance(uid, main) == -100.0
    net = core(shared.group_net_balances, gid)
    assert net[people["Nikos"]] == 0

    assert api.delete(f"/api/shared/expenses/{eid}").json()["message"] == "Expense deleted."
    assert count("SELECT COUNT(*) FROM expenses WHERE user_id = ?", uid) == 0
    assert count("SELECT COUNT(*) FROM account_transfers WHERE user_id = ?", uid) == 0
    assert balance(uid, main) == 0.0


def test_unrecorded_bills_leave_my_accounts_alone(client):
    api, uid, gid, people, main, cat = setup_group(client, "share_unrecorded")
    assert add_expense(api, gid, people).status_code == 200
    assert count("SELECT COUNT(*) FROM expenses WHERE user_id = ?", uid) == 0
    assert ledger(uid) is None
    bill = api.get(f"/api/shared/groups/{gid}").json()["activity"][0]
    assert bill["involved"] and not bill["recorded"]  # "Not in your budget yet"


def test_bad_split_is_rejected_without_saving(client):
    api, uid, gid, people, main, cat = setup_group(client, "share_badsplit")
    resp = add_expense(
        api,
        gid,
        people,
        split_method="percent",
        values={str(people["You"]): "50", str(people["Anna"]): "20"},
    )
    assert resp.status_code == 400
    assert "not 100%" in resp.json()["detail"]
    assert resp.json()["detail"] == "The percentages add up to 70%, not 100%."
    assert count("SELECT COUNT(*) FROM shared_expenses WHERE user_id = ?", uid) == 0


def test_member_with_history_cannot_be_removed(client):
    api, uid, gid, people, main, cat = setup_group(client, "share_members")
    add_expense(api, gid, people)
    resp = api.delete(f"/api/shared/groups/{gid}/members/{people['Anna']}")
    assert resp.status_code == 400
    assert resp.json()["detail"] == (
        "They already appear in this group's expenses or payments, so they can't be removed."
    )
    assert one("SELECT 1 FROM shared_group_members WHERE group_id = ? AND person_id = ?", gid, people["Anna"])
    members = {m["name"]: m for m in api.get(f"/api/shared/groups/{gid}").json()["members"]}
    assert members["Anna"]["removable"] is False


def test_deleting_a_group_removes_its_personal_rows(client):
    api, uid, gid, people, main, cat = setup_group(client, "share_groupdel")
    add_expense(api, gid, people, record_personal="1", category_id=cat, account_id=main)
    resp = api.delete(f"/api/shared/groups/{gid}")
    assert resp.json() == {
        "ok": True,
        "message": "Group deleted, along with the entries it had added to everyone's accounts.",
        "group_id": None,
    }
    assert count("SELECT COUNT(*) FROM shared_groups WHERE user_id = ?", uid) == 0
    assert count("SELECT COUNT(*) FROM expenses WHERE user_id = ?", uid) == 0
    assert balance(uid, main) == 0.0


def test_groups_are_private_to_their_owner(app):
    owner, _uid_owner, gid, people, main, cat = setup_group(TestClient(app), "share_owner")
    add_expense(owner, gid, people)
    eid = one("SELECT id FROM shared_expenses WHERE group_id = ?", gid)["id"]

    intruder = register_and_login(TestClient(app), "share_intruder")
    assert intruder.delete(f"/api/shared/groups/{gid}").json() == {"detail": "Group not found."}
    assert intruder.delete(f"/api/shared/expenses/{eid}").json() == {"detail": "Expense not found."}
    assert one("SELECT 1 FROM shared_expenses WHERE id = ?", eid)
    resp = intruder.get(f"/api/shared/groups/{gid}")
    assert resp.status_code == 404
    assert "Trip" not in resp.text
    assert intruder.get("/api/shared").json()["groups"] == []


# --- several users sharing one group --------------------------------------------


def test_invited_user_sees_group_only_after_joining(app):
    owner, friend, o_uid, f_uid, gid, people = two_users(app, "mu_owner1", "mu_friend1", accept=False)
    overview = friend.get("/api/shared").json()
    assert overview["invitations"] == [{"id": gid, "name": "Flat", "owner": "mu_owner1"}]
    assert overview["groups"] == []
    resp = friend.post(
        f"/api/shared/groups/{gid}/settlements",
        json={"from_person_id": people["friend"], "to_person_id": people["owner"], "amount": "5"},
    )
    assert resp.status_code == 404 and resp.json()["detail"] == "Group not found."
    assert friend.get(f"/api/shared/groups/{gid}").status_code == 404

    resp = friend.post(f"/api/shared/groups/{gid}/accept")
    assert resp.json()["group_id"] == gid
    detail = friend.get(f"/api/shared/groups/{gid}").json()
    assert detail["is_owner"] is False and detail["owner_name"] == "mu_owner1"  # "created by mu_owner1"
    assert friend.get("/api/shared").json()["invitations"] == []


def test_each_member_records_their_own_side(app):
    owner, friend, o_uid, f_uid, gid, people = two_users(app, "mu_owner2", "mu_friend2")
    o_main, o_cat = main_and_general(o_uid)
    f_main, f_cat = main_and_general(f_uid)
    owner.post(
        f"/api/shared/groups/{gid}/expenses",
        json={
            "description": "Rent",
            "amount": "800",
            "spent_on": "2026-11-01",
            "paid_by": people["owner"],
            "split_method": "equal",
            "included": [people["owner"], people["friend"]],
            "record_personal": "1",
            "category_id": o_cat,
            "account_id": o_main,
        },
    )
    eid = one("SELECT id FROM shared_expenses WHERE group_id = ?", gid)["id"]
    assert balance(o_uid, o_main) == -800.0
    bill = friend.get(f"/api/shared/groups/{gid}").json()["activity"][0]
    assert bill["involved"] and not bill["recorded"]  # "Not in your budget yet"
    assert bill["added_by"] == "mu_owner2" and bill["effect_text"] == "you borrowed"
    assert count("SELECT COUNT(*) FROM expenses WHERE user_id = ?", f_uid) == 0

    resp = friend.put(f"/api/shared/expenses/{eid}/record", json={"category_id": f_cat})
    assert resp.json() == {"ok": True, "message": "Added to your budget.", "group_id": gid}
    f_ledger = ledger(f_uid)
    assert balance(f_uid, f_ledger) == -400.0
    assert one("SELECT amount FROM expenses WHERE user_id = ?", f_uid)["amount"] == -400.0

    # The friend edits the bill; the owner's own rows follow.
    friend.put(
        f"/api/shared/expenses/{eid}",
        json={
            "description": "Rent",
            "amount": "900",
            "spent_on": "2026-11-01",
            "paid_by": people["owner"],
            "split_method": "equal",
            "included": [people["owner"], people["friend"]],
            "record_personal": "1",
            "category_id": f_cat,
        },
    )
    o_ledger = ledger(o_uid)
    assert one("SELECT amount FROM expenses WHERE user_id = ?", o_uid)["amount"] == -450.0
    assert balance(o_uid, o_main) == -900.0
    assert balance(o_uid, o_ledger) == 450.0
    assert balance(f_uid, f_ledger) == -450.0

    # Friend pays back; both sides can put the payment in their accounts.
    friend.post(
        f"/api/shared/groups/{gid}/settlements",
        json={
            "from_person_id": people["friend"],
            "to_person_id": people["owner"],
            "amount": "450",
            "record_personal": "1",
            "account_id": f_main,
        },
    )
    sid = one("SELECT id FROM shared_settlements WHERE group_id = ?", gid)["id"]
    resp = owner.put(f"/api/shared/settlements/{sid}/record", json={"account_id": o_main})
    assert resp.json()["message"] == "Payment added to your accounts."
    assert balance(f_uid, f_ledger) == 0.0 and balance(f_uid, f_main) == -450.0
    assert balance(o_uid, o_ledger) == 0.0
    assert balance(o_uid, o_main) == -450.0

    # Deleting the bill (by either member) removes both users' rows.
    assert friend.delete(f"/api/shared/expenses/{eid}").status_code == 200
    assert count("SELECT COUNT(*) FROM expenses WHERE user_id IN (?, ?)", o_uid, f_uid) == 0


def test_only_the_creator_can_delete_and_members_can_leave(app):
    owner, friend, o_uid, f_uid, gid, people = two_users(app, "mu_owner3", "mu_friend3")
    resp = friend.delete(f"/api/shared/groups/{gid}")
    assert resp.status_code == 403
    assert resp.json()["detail"] == "Only the person who created the group can delete it."
    assert one("SELECT 1 FROM shared_groups WHERE id = ?", gid)
    # the creator can't be removed, by anyone
    resp = friend.delete(f"/api/shared/groups/{gid}/members/{people['owner']}")
    assert resp.status_code == 400 and resp.json()["detail"] == "The group's creator can't be removed."
    resp = friend.delete(f"/api/shared/groups/{gid}/members/{people['friend']}")
    assert resp.json() == {"ok": True, "message": "You left the group.", "group_id": None}
    assert core(shared.member_person, gid, f_uid, statuses=("active", "invited")) is None
    assert owner.delete(f"/api/shared/groups/{gid}").status_code == 200
    assert not one("SELECT 1 FROM shared_groups WHERE id = ?", gid)


def test_declined_member_stays_a_name_without_access(app):
    owner, friend, o_uid, f_uid, gid, people = two_users(app, "mu_owner4", "mu_friend4", accept=False)
    resp = friend.post(f"/api/shared/groups/{gid}/decline")
    assert resp.json() == {"ok": True, "message": "Invitation declined.", "group_id": None}
    assert friend.get("/api/shared").json()["invitations"] == []
    assert core(shared.group_for_user, f_uid, gid) is None
    members = owner.get(f"/api/shared/groups/{gid}").json()["members"]
    assert [m["status"] for m in members if m["id"] == people["friend"]] == ["declined"]
    # declining twice: there is no invitation any more
    assert friend.post(f"/api/shared/groups/{gid}/decline").json() == {"detail": "Invitation not found."}


def test_friend_balance_adds_up_across_groups_by_login(app):
    owner, friend, o_uid, f_uid, gid, people = two_users(app, "mu_owner5", "mu_friend5")
    owner.post(
        f"/api/shared/groups/{gid}/expenses",
        json={
            "description": "A",
            "amount": "20",
            "paid_by": people["owner"],
            "split_method": "equal",
            "included": [people["owner"], people["friend"]],
        },
    )
    # A second group, created by the friend, with the owner invited back.
    resp = friend.post("/api/shared/groups", json={"name": "Gym", "usernames": "mu_owner5"})
    assert resp.json()["message"] == "Group “Gym” created. 1 user was invited."
    gid2 = one("SELECT id FROM shared_groups WHERE user_id = ?", f_uid)["id"]
    owner.post(f"/api/shared/groups/{gid2}/accept")
    me2 = core(shared.member_person, gid2, o_uid)
    fr2 = core(shared.member_person, gid2, f_uid)
    owner.post(
        f"/api/shared/groups/{gid2}/expenses",
        json={"description": "B", "amount": "30", "paid_by": me2, "split_method": "equal", "included": [me2, fr2]},
    )
    ctx = owner.get("/api/shared").json()
    assert ctx["friend_balances"] == [{"name": "mu_friend5", "amount": 25.0}]
    assert (ctx["owed_to_me"], ctx["i_owe"], ctx["net"]) == (25.0, 0.0, 25.0)
    ctx_friend = friend.get("/api/shared").json()
    assert ctx_friend["friend_balances"] == [{"name": "mu_owner5", "amount": -25.0}]
    assert (ctx_friend["owed_to_me"], ctx_friend["i_owe"], ctx_friend["net"]) == (0.0, 25.0, -25.0)


def test_linking_a_contact_invites_them_to_existing_groups(app):
    friend = register_and_login(TestClient(app), "mu_friend6")
    owner = register_and_login(TestClient(app), "mu_owner6")
    o_uid = user_id("mu_owner6")
    owner.post("/api/shared/groups", json={"name": "Old", "new_members": "Zoe"})
    zoe = one("SELECT id FROM shared_people WHERE user_id = ? AND name = 'Zoe'", o_uid)["id"]
    resp = owner.put(f"/api/shared/people/{zoe}/link", json={"username": "nobody_here"})
    assert resp.status_code == 400
    assert "no user called" in resp.json()["detail"]
    resp = owner.put(f"/api/shared/people/{zoe}/link", json={"username": "mu_friend6"})
    assert resp.json()["message"] == "Linked. Groups they are in now show up as invitations for them."
    invitations = friend.get("/api/shared").json()["invitations"]
    assert [i["name"] for i in invitations] == ["Old"]  # "invited you to"
