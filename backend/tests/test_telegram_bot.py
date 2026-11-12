"""Telegram bot: parsing, recording, buttons, undo, shared bills, receipts and
questions. Telegram and Ollama are replaced by fakes; the database is real.
Ported 1:1 from the old tests/test_telegram_bot.py (helpers in
tests/helpers_telegram.py); the two tests that went through web routes now
use the settings API or core functions."""

import json
import sqlite3
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from vbx.core import integrations, telegram_bot
from vbx.core import telegram_parse as tp
from vbx.core.finance import fetch_account_balances_through

from .conftest import ApiClient, csrf_token, get_connection, register_and_login, user_id
from .helpers_telegram import (
    AI_ON,
    BOT_CONFIG,
    button,
    current_chat,
    fake_ai,
    linked_user,
    next_chat,
    press,
    rows,
    send,
    shared_group,
    tg,  # noqa: F401  (fixture)
)

TODAY = date.today()


# --- pure parsing -----------------------------------------------------------------


def test_amounts_skip_dates_times_units_and_percentages():
    assert [a.value for a in tp.find_amounts("χθες καφές 3.50")] == [3.5]
    assert [a.value for a in tp.find_amounts("καφές 3, βενζίνη 40")] == [3.0, 40.0]
    assert [a.value for a in tp.find_amounts("15ευρώ σουβλάκια")] == [15.0]
    assert [a.value for a in tp.find_amounts("τυρί 400g 5,60")] == [5.6]
    assert [a.value for a in tp.find_amounts("10/11 18:42 ΦΠΑ 13% total 19.01")] == [19.01]
    assert tp.find_amounts("τι χρωστάω") == []


def test_dates_from_words_and_numbers():
    today = date(2026, 11, 10)
    assert tp.detect_date("χθες καφές 3", today) == date(2026, 11, 9)
    assert tp.detect_date("προχθές 5", today) == date(2026, 11, 8)
    assert tp.detect_date("yesterday coffee 3", today) == date(2026, 11, 9)
    assert tp.detect_date("5/11 ταξί 12", today) == date(2026, 11, 5)
    assert tp.detect_date("20/12 δώρο 30", today) == date(2025, 12, 20)  # no future dates
    assert tp.detect_date("σούπερ 19.01", today) is None  # an amount, not 19 January


ACCOUNTS = [
    {"id": i, "name": n}
    for i, n in enumerate(["AlphaBank", "AlphaBank Bonus Visa", "Cash", "Piraeus", "Revolut", "Ticket Restaurant"])
]


@pytest.mark.parametrize(
    "text,expected",
    [
        ("καφές 3 alpha", "AlphaBank"),
        ("άλφα visa 20", "AlphaBank Bonus Visa"),
        ("μετρητά 5 περίπτερο", "Cash"),
        ("τικετ 12 σουβλάκια", "Ticket Restaurant"),
        ("ρεβολούτ 9", "Revolut"),
        ("πειραιώς 40", "Piraeus"),
        ("restaurant 30", None),
        ("bonus 500", None),
        ("καφές 3", None),
    ],
)
def test_account_detection_handles_greek_greeklish_and_generic_words(text, expected):
    found, _ = tp.detect_account(text, ACCOUNTS)
    assert (ACCOUNTS[found]["name"] if found is not None else None) == expected


def _ctx(**kw):
    defaults = dict(
        expense_categories=["Delivery", "Entertainment", "Other", "Super Market", "Gym"],
        income_categories=["Other", "Salary"],
        accounts=ACCOUNTS,
        history=tp.History(),
        ai_settings={"ai_enabled": False},
        today=date(2026, 11, 10),
    )
    defaults.update(kw)
    return tp.Context(**defaults)


def test_basic_parser_splits_several_transactions_and_finds_income():
    txns = tp.basic_parse("χθες καφές 3,50 και σούπερ μάρκετ 20 revolut", _ctx())
    assert [(t.amount, t.category, t.notes, t.date) for t in txns] == [
        (3.5, "Entertainment", "καφές", "2026-11-09"),
        (20.0, "Super Market", "σούπερ μάρκετ", "2026-11-09"),
    ]
    assert all(t.account_id == 4 and t.source == "basic" for t in txns)
    salary = tp.basic_parse("μισθός 1500", _ctx())[0]
    assert (salary.type, salary.category) == ("income", "Salary")


def test_history_beats_the_ai_and_keywords():
    hist = tp.History(lookup={("expense", tp.key("efood")): "Delivery", ("expense", tp.key("καφές")): "Gym"})
    ctx = _ctx(history=hist)
    assert tp.basic_parse("efood 18", ctx)[0].category == "Delivery"
    assert tp.basic_parse("καφές 3", ctx)[0].category == "Gym"


def test_ai_transactions_are_capped_to_the_amounts_written(monkeypatch):
    fake_ai(
        monkeypatch,
        [
            {
                "transactions": [
                    {
                        "type": "expense",
                        "amount": 3,
                        "category": "Entertainment",
                        "notes": "καφές",
                        "date": "2026-11-10",
                    },
                    {"type": "expense", "amount": 99, "category": "Gym", "notes": "made up", "date": "2026-11-10"},
                ]
            }
        ],
    )
    txns = tp.parse_transactions("καφές 3", _ctx(ai_settings=AI_ON))
    assert [(t.amount, t.category, t.source) for t in txns] == [(3.0, "Entertainment", "ai")]


def test_unusable_ai_answer_falls_back_to_the_basic_parser(monkeypatch):
    fake_ai(monkeypatch, [{"nonsense": True}])
    txns = tp.parse_transactions("γυμναστήριο 35", _ctx(ai_settings=AI_ON))
    assert [(t.amount, t.category, t.source) for t in txns] == [(35.0, "Gym", "basic")]


def test_receipt_total_and_date_come_from_the_text(monkeypatch):
    fake_ai(monkeypatch, [{"merchant": "Σκλαβενίτης", "total": 1.89, "date": None, "category": "Super Market"}])
    ocr = "ΣΚΛΑBENITHΣ Α.E.\n09/11/2026 18:42\nΓΑΛΑ 1L 1.89\nΣΥNOΛO 19.01\nKAPTA 19.01\nΦΠA 13% 1.43"
    txn = tp.parse_receipt(ocr, "", _ctx(ai_settings=AI_ON))
    assert (txn.amount, txn.date, txn.category, txn.notes, txn.source) == (
        19.01,
        "2026-11-09",
        "Super Market",
        "Σκλαβενίτης",
        "receipt",
    )


def test_questions_are_told_apart_from_entries():
    assert tp.looks_like_question("πόσα ξόδεψα αυτόν τον μήνα;")
    assert tp.looks_like_question("υπόλοιπο revolut")
    assert tp.looks_like_question("τι χρωστάω")
    assert not tp.looks_like_question("καφές 3")
    assert not tp.looks_like_question("έχω 20 ευρώ βενζίνη")


# --- the bot end to end -------------------------------------------------------------


def test_text_without_ai_records_with_the_named_account(client, tg):  # noqa: F811
    uid = linked_user(client, "tg_basic")
    send("χθες καφές 3,50 revolut")
    row = rows(
        """SELECT e.amount, e.notes, date(e.spent_at) d, a.name acc, c.name cat FROM expenses e
           JOIN accounts a ON a.id = e.account_id JOIN categories c ON c.id = e.category_id
           WHERE e.user_id = ?""",
        uid,
    )[0]
    assert (row["amount"], row["notes"], row["d"], row["acc"], row["cat"]) == (
        -3.5,
        "καφές",
        (TODAY - timedelta(days=1)).isoformat(),
        "Revolut",
        "Entertainment",
    )
    assert "basic parser" in tg.last_text() and "3.50€" in tg.last_text()
    assert button(tg.last_keyboard(), "↩️ Undo").endswith(":u")


def test_buttons_change_category_account_and_date_then_undo(client, tg):  # noqa: F811
    uid = linked_user(client, "tg_buttons")
    send("σούπερ μάρκετ 20")
    first = tg.last_keyboard()
    press(button(first, "🏷 Category"))
    press(button(tg.last_keyboard(), "Delivery"))
    press(button(first, "🏦 Account"))
    press(button(tg.last_keyboard(), "Cash"))
    press(button(first, "📅 Date"))
    press(button(tg.last_keyboard(), "Yesterday"))
    row = rows(
        """SELECT c.name cat, a.name acc, date(e.spent_at) d FROM expenses e
           JOIN categories c ON c.id = e.category_id JOIN accounts a ON a.id = e.account_id
           WHERE e.user_id = ?""",
        uid,
    )[0]
    assert (row["cat"], row["acc"], row["d"]) == ("Delivery", "Cash", (TODAY - timedelta(days=1)).isoformat())
    assert "Delivery" in tg.last_text() and "Cash" in tg.last_text()

    press(button(first, "↩️ Undo"))
    assert rows("SELECT * FROM expenses WHERE user_id = ?", uid) == []
    assert tg.last_text().startswith("↩️ Removed")


def test_undo_never_touches_entries_made_on_the_web(client, tg):  # noqa: F811
    uid = linked_user(client, "tg_undo")
    conn = get_connection()
    cat = conn.execute("SELECT id FROM categories WHERE user_id = ? LIMIT 1", (uid,)).fetchone()["id"]
    acc = conn.execute("SELECT id FROM accounts WHERE user_id = ? LIMIT 1", (uid,)).fetchone()["id"]
    conn.execute(
        "INSERT INTO expenses (user_id, notes, amount, category_id, account_id, spent_at) "
        "VALUES (?, 'web', -9, ?, ?, ?)",
        (uid, cat, acc, TODAY.isoformat()),
    )
    conn.commit()
    conn.close()
    send("/undo")
    assert tg.last_text() == "Nothing to undo."
    send("καφές 3")
    send("/undo")
    assert [r["notes"] for r in rows("SELECT notes FROM expenses WHERE user_id = ?", uid)] == ["web"]


def test_undo_never_touches_entries_made_through_the_api(client, tg):  # noqa: F811
    """Same fact as above, with the web entry created through POST /api/expenses."""
    uid = linked_user(client, "tg_undo_api")
    conn = get_connection()
    cat = conn.execute("SELECT id FROM categories WHERE user_id = ? ORDER BY id LIMIT 1", (uid,)).fetchone()["id"]
    acc = conn.execute("SELECT id FROM accounts WHERE user_id = ? ORDER BY id LIMIT 1", (uid,)).fetchone()["id"]
    conn.close()
    web = ApiClient(client, csrf_token(client))  # the client is logged in as tg_undo_api
    resp = web.post("/api/expenses", json={"notes": "web", "amount": "-9", "category_id": cat, "account_id": acc})
    assert resp.status_code == 200, resp.text
    send("/undo")
    assert tg.last_text() == "Nothing to undo."
    assert [r["notes"] for r in rows("SELECT notes FROM expenses WHERE user_id = ?", uid)] == ["web"]


def test_several_transactions_in_one_message_with_ai(client, tg, monkeypatch):  # noqa: F811
    uid = linked_user(client, "tg_multi", ai=True)
    prompts = fake_ai(
        monkeypatch,
        [
            {
                "transactions": [
                    {
                        "type": "expense",
                        "amount": 3,
                        "category": "Entertainment",
                        "notes": "καφές",
                        "date": TODAY.isoformat(),
                    },
                    {
                        "type": "expense",
                        "amount": 12,
                        "category": "Delivery",
                        "notes": "σουβλάκια",
                        "date": TODAY.isoformat(),
                    },
                ]
            }
        ],
    )
    send("καφές 3, σουβλάκια 12")
    got = rows("SELECT amount, notes FROM expenses WHERE user_id = ? ORDER BY id", uid)
    assert [(r["amount"], r["notes"]) for r in got] == [(-3.0, "καφές"), (-12.0, "σουβλάκια")]
    assert len(tg.sent()) == 2 and "Delivery" in prompts[0]


def test_past_choices_are_offered_to_the_ai_and_override_it(client, tg, monkeypatch):  # noqa: F811
    uid = linked_user(client, "tg_history", ai=True)
    # The old test let this first message try the real (unreachable) Ollama;
    # an AI with no answer is the same thing without the network.
    fake_ai(monkeypatch, [])
    send("efood 10")  # basic categories: Delivery via keyword
    press(button(tg.last_keyboard(), "🏷 Category"))
    press(button(tg.last_keyboard(), "Entertainment"))  # the user files efood under Entertainment
    prompts = fake_ai(
        monkeypatch,
        [
            {
                "transactions": [
                    {
                        "type": "expense",
                        "amount": 15,
                        "category": "Delivery",
                        "notes": "efood",
                        "date": TODAY.isoformat(),
                    }
                ]
            }
        ],
    )
    send("efood 15")
    assert '"efood" → Entertainment' in prompts[0]
    cats = rows(
        "SELECT c.name FROM expenses e JOIN categories c ON c.id = e.category_id WHERE e.user_id = ? ORDER BY e.id",
        uid,
    )
    assert [r["name"] for r in cats] == ["Entertainment", "Entertainment"]


def test_shared_bill_from_telegram_splits_and_books_my_share(client, tg):  # noqa: F811
    uid = linked_user(client, "tg_shared")
    shared_group(uid, "Σπίτι", ["Άννα", "Νίκος"])
    send("σούπερ μάρκετ 60 μοιρασμένο revolut")
    bill = rows("SELECT id, amount_cents, description FROM shared_expenses WHERE user_id = ?", uid)[0]
    assert bill["amount_cents"] == 6000 and bill["description"] == "σούπερ μάρκετ"
    mine = rows(
        """SELECT e.amount, a.name acc FROM expenses e JOIN accounts a ON a.id = e.account_id
           WHERE e.user_id = ?""",
        uid,
    )[0]
    assert (mine["amount"], mine["acc"]) == (-20.0, "Revolut")
    assert "split 3 ways" in tg.last_text() and "your share 20.00€" in tg.last_text()

    send("η Άννα πλήρωσε πίτσα 30 μισά")
    pizza = rows("SELECT id, paid_by FROM shared_expenses WHERE description = 'πίτσα'")[0]
    anna = rows("SELECT id FROM shared_people WHERE user_id = ? AND name = 'Άννα'", uid)[0]["id"]
    assert pizza["paid_by"] == anna
    splits = rows("SELECT share_cents FROM shared_expense_splits WHERE expense_id = ? AND share_cents > 0", pizza["id"])
    assert sorted(r["share_cents"] for r in splits) == [1500, 1500]

    send("/undo")
    assert rows("SELECT * FROM shared_expenses WHERE description = 'πίτσα'") == []


def test_questions_are_answered_from_the_database(client, tg, monkeypatch):  # noqa: F811
    linked_user(client, "tg_ask", ai=True)
    fake_ai(
        monkeypatch,
        [
            {
                "transactions": [
                    {
                        "type": "expense",
                        "amount": 18,
                        "category": "Delivery",
                        "notes": "efood",
                        "date": TODAY.isoformat(),
                    }
                ]
            },
            {
                "transactions": [
                    {
                        "type": "expense",
                        "amount": 4,
                        "category": "Entertainment",
                        "notes": "καφές",
                        "date": TODAY.isoformat(),
                    }
                ]
            },
            {
                "metric": "spent",
                "category": "Delivery",
                "account": None,
                "search": None,
                "from": TODAY.replace(day=1).isoformat(),
                "to": TODAY.isoformat(),
            },
        ],
    )
    send("efood 18")
    send("καφές 4")
    send("πόσα έδωσα σε delivery αυτόν τον μήνα;")
    assert tg.last_text().startswith("Spent on Delivery this month: 18.00€ (1 entries)")
    send("/month")
    assert "22.00€" in tg.last_text() and "Delivery: 18.00€" in tg.last_text()
    send("υπόλοιπο")  # AI has no reply left → heuristic plan
    assert tg.last_text().startswith("Balances:")


def test_receipt_photo_is_read_and_recorded(client, tg, monkeypatch):  # noqa: F811
    uid = linked_user(client, "tg_receipt", ai=True)
    monkeypatch.setattr(telegram_bot, "download_file", lambda file_id, token: b"jpeg-bytes")
    monkeypatch.setattr(
        integrations,
        "ollama_ocr",
        lambda base, model, img, **kw: f"ΣΚΛΑΒΕΝΙΤΗΣ\n{TODAY.strftime('%d/%m/%Y')}\nΣΥΝΟΛΟ 19,01",
    )
    fake_ai(monkeypatch, [{"merchant": "Σκλαβενίτης", "total": 19.01, "category": "Super Market"}])
    send(
        photo=[{"file_id": "small", "width": 90, "height": 90}, {"file_id": "big", "width": 1280, "height": 960}],
        caption="cash",
    )
    row = rows(
        """SELECT e.amount, e.notes, a.name acc, c.name cat FROM expenses e
           JOIN accounts a ON a.id = e.account_id JOIN categories c ON c.id = e.category_id
           WHERE e.user_id = ?""",
        uid,
    )[0]
    assert (row["amount"], row["notes"], row["acc"], row["cat"]) == (-19.01, "Σκλαβενίτης", "Cash", "Super Market")
    assert tg.sent()[0]["text"].startswith("🧾 Reading")
    assert "from receipt" in tg.last_text()


def test_receipts_need_an_ocr_model(client, tg):  # noqa: F811
    linked_user(client, "tg_no_ocr")
    send(photo=[{"file_id": "x", "width": 10, "height": 10}])
    assert "Receipt photos are off" in tg.last_text()


def test_default_account_command(client, tg):  # noqa: F811
    uid = linked_user(client, "tg_default")
    send("/account")
    press(button(tg.last_keyboard(), "Cash"))
    send("καφές 2")
    acc = rows("SELECT a.name FROM expenses e JOIN accounts a ON a.id = e.account_id WHERE e.user_id = ?", uid)
    assert acc[0]["name"] == "Cash"


def test_other_chats_cannot_press_my_buttons(client, app, tg):  # noqa: F811
    owner_chat, intruder_chat = next_chat(), next_chat()
    uid = linked_user(client, "tg_owner", chat=owner_chat)
    linked_user(TestClient(app), "tg_intruder", chat=intruder_chat)
    send("καφές 3", chat=owner_chat)
    undo = button(tg.last_keyboard(), "↩️ Undo")
    press(undo, chat=intruder_chat)
    assert len(rows("SELECT * FROM expenses WHERE user_id = ?", uid)) == 1


def test_edited_messages_are_ignored(client, tg):  # noqa: F811
    uid = linked_user(client, "tg_edit")
    conn = get_connection()
    telegram_bot.handle_update(
        {"update_id": 3, "edited_message": {"chat": {"id": current_chat()}, "text": "καφές 3"}},
        conn,
        fetch_account_balances_through,
        BOT_CONFIG,
    )
    conn.close()
    assert rows("SELECT * FROM expenses WHERE user_id = ?", uid) == []


def test_ocr_model_is_saved_from_settings(client, monkeypatch):
    """Old: POST /settings/integrations/save then the settings page had an
    ai_ocr_model field. New: PUT /api/settings/integrations/ai, and GET
    /api/settings/integrations returns ai.ai_ocr_model."""
    api = register_and_login(client, "tg_settings")
    resp = api.put(
        "/api/settings/integrations/ai",
        json={
            "ai_enabled": "1",
            "ai_provider": "ollama",
            "ai_base_url": "http://ollama:11434",
            "ai_model": "qwen3:8b",
            "ai_timeout": "60",
            "ai_ocr_model": "glm-ocr",
        },
    )
    assert resp.status_code == 200, resp.text
    conn = get_connection()
    assert integrations.get_user_integrations(conn, user_id("tg_settings"))["ai_ocr_model"] == "glm-ocr"
    conn.close()
    assert api.get("/api/settings/integrations").json()["ai"]["ai_ocr_model"] == "glm-ocr"


# --- any user's own categories, in any language ---------------------------------------


def _ctx_for(expense, income):
    return tp.Context(expense, income, [], tp.History(), {"ai_enabled": False}, date(2026, 11, 10))


@pytest.mark.parametrize(
    "message,greek,english",
    [
        ("σούπερ μάρκετ 42", "Σούπερ μάρκετ", "Groceries"),
        ("καφές 3", "Καφέδες", "Coffee"),
        ("βενζίνη 50", "Βενζίνη", "Car"),
        ("ρεύμα 85", "Λογαριασμοί", "Bills"),
        ("σουβλάκια 12", "Φαγητό έξω", "Eating out"),
        ("μισθός 1500", "Μισθός", "Wages"),
        ("κάτι άσχετο 7", "Λοιπά", "Misc"),
    ],
)
def test_categories_match_whatever_the_user_named_them(message, greek, english):
    greek_ctx = _ctx_for(
        ["Σούπερ μάρκετ", "Καφέδες", "Βενζίνη", "Λογαριασμοί", "Φαγητό έξω", "Λοιπά"], ["Μισθός", "Λοιπά"]
    )
    english_ctx = _ctx_for(["Groceries", "Coffee", "Car", "Cards", "Bills", "Eating out", "Misc"], ["Wages", "Misc"])
    assert tp.basic_parse(message, greek_ctx)[0].category == greek
    assert tp.basic_parse(message, english_ctx)[0].category == english


def test_a_category_written_in_the_message_is_used():
    ctx = _ctx_for(["Βενζίνη", "Κήπος", "Other"], ["Other"])
    assert tp.basic_parse("κήπος λιπάσματα 18", ctx)[0].category == "Κήπος"
    assert tp.basic_parse("βενζίνης 40", ctx)[0].category == "Βενζίνη"


def test_catch_all_is_the_users_own():
    assert tp.find_fallback_category(["Food", "Λοιπά"]) == "Λοιπά"
    assert tp.find_fallback_category(["Food", "General", "Other"]) == "Other"
    assert tp.find_fallback_category(["Food"]) == "Other"
    assert tp.resolve_category("Other", ["Food", "General"]) == "General"


def test_bot_uses_renamed_categories_and_creates_none(client, tg):  # noqa: F811
    """A user who replaced the seeded English "Other"/"Salary" with Greek ones."""
    uid = linked_user(client, "tg_greek_user")
    conn = get_connection()
    conn.execute("DELETE FROM categories WHERE user_id = ? AND name IN ('Other', 'General')", (uid,))
    conn.execute("DELETE FROM income_categories WHERE user_id = ? AND name IN ('Other', 'General', 'Salary')", (uid,))
    conn.executemany("INSERT INTO categories (user_id, name) VALUES (?, ?)", [(uid, "Λοιπά"), (uid, "Βενζίνη")])
    conn.executemany("INSERT INTO income_categories (user_id, name) VALUES (?, ?)", [(uid, "Λοιπά"), (uid, "Μισθός")])
    conn.commit()
    conn.close()
    before = {r["name"] for r in rows("SELECT name FROM categories WHERE user_id = ?", uid)}
    before_income = {r["name"] for r in rows("SELECT name FROM income_categories WHERE user_id = ?", uid)}

    send("κάτι άσχετο 7")
    send("βενζίνη 50")
    send("μισθός 1500")

    assert {r["name"] for r in rows("SELECT name FROM categories WHERE user_id = ?", uid)} == before
    assert {r["name"] for r in rows("SELECT name FROM income_categories WHERE user_id = ?", uid)} == before_income
    cats = rows(
        "SELECT c.name FROM expenses e JOIN categories c ON c.id = e.category_id WHERE e.user_id = ? ORDER BY e.id",
        uid,
    )
    assert [r["name"] for r in cats] == ["Λοιπά", "Βενζίνη"]
    income = rows(
        """SELECT c.name FROM income_entries i JOIN income_categories c ON c.id = i.category_id
           WHERE i.user_id = ?""",
        uid,
    )
    assert [r["name"] for r in income] == ["Μισθός"]


# --- recurring entries ---------------------------------------------------------------


def test_counts_of_months_or_times_are_not_amounts():
    assert [a.value for a in tp.find_amounts("recurring 21.66 for 3 months")] == [21.66]
    assert [a.value for a in tp.find_amounts("γυμναστήριο 30 για 6 μήνες")] == [30.0]
    assert [a.value for a in tp.find_amounts("netflix 12,99 κάθε 2 εβδομάδες 10 φορές")] == [12.99]
    assert [a.value for a in tp.find_amounts("νοίκι 500 μηνιαία")] == [500.0]
    assert [a.value for a in tp.find_amounts("rent 500 monthly")] == [500.0]


def test_the_ais_repeat_is_kept_only_when_it_makes_sense(monkeypatch):
    item = {"type": "expense", "amount": 21.66, "category": "Entertainment", "notes": "spotify", "date": "2026-11-10"}
    cases = [
        ({"every": 1, "unit": "month", "times": 3}, tp.Repeat("month", 1, 3)),
        ({"every": "2", "unit": "weeks", "times": None}, tp.Repeat("week", 2, None)),
        ({"unit": "yearly"}, tp.Repeat("year", 1, None)),
        ({"every": 1, "unit": "day", "times": 5}, None),  # no daily rules
        ({"every": 1, "unit": "month", "times": 1}, None),  # once is not a repeat
        ({"every": -1, "unit": "month"}, None),
        (None, None),
    ]
    for raw, expected in cases:
        fake_ai(monkeypatch, [{"transactions": [{**item, "repeat": raw}]}])
        txns = tp.parse_transactions("spotify 21.66", _ctx(ai_settings=AI_ON))
        assert txns[0].repeat == expected, raw


def test_a_repeating_entry_may_start_later_but_a_one_off_may_not(monkeypatch):
    ctx = _ctx(ai_settings=AI_ON)
    later = "2026-12-01"
    item = {"type": "expense", "amount": 500, "category": "Other", "notes": "νοίκι", "date": later}
    fake_ai(monkeypatch, [{"transactions": [{**item, "repeat": {"every": 1, "unit": "month", "times": None}}]}])
    assert tp.parse_transactions("νοίκι 500 κάθε 1η του μήνα", ctx)[0].date == later
    fake_ai(monkeypatch, [{"transactions": [item]}])
    assert tp.parse_transactions("νοίκι 500", ctx)[0].date == "2026-11-10"


def _rule(uid):
    return rows("SELECT * FROM recurring_entries WHERE user_id = ?", uid)


def test_recurring_message_creates_a_rule_and_its_first_entry(client, tg, monkeypatch):  # noqa: F811
    uid = linked_user(client, "tg_recurring", ai=True)
    prompts = fake_ai(
        monkeypatch,
        [
            {
                "transactions": [
                    {
                        "type": "expense",
                        "amount": 21.66,
                        "category": "Entertainment",
                        "notes": "spotify",
                        "date": TODAY.isoformat(),
                        "repeat": {"every": 1, "unit": "month", "times": 3},
                    }
                ]
            }
        ],
    )
    send("spotify recurring 21.66 for 3 months revolut")
    assert '"repeat"' in prompts[0]

    rules = _rule(uid)
    assert len(rules) == 1
    r = rules[0]
    assert (
        r["entry_type"],
        r["amount"],
        r["interval_unit"],
        r["interval_count"],
        r["months_to_run"],
        r["start_date"],
        r["day_of_month"],
        r["notes"],
    ) == ("expense", 21.66, "month", 1, 3, TODAY.isoformat(), TODAY.day, "spotify")
    posted = rows(
        """SELECT e.amount, e.notes, date(e.spent_at) d, a.name acc FROM expenses e
           JOIN accounts a ON a.id = e.account_id WHERE e.user_id = ?""",
        uid,
    )
    assert [(p["amount"], p["notes"], p["d"], p["acc"]) for p in posted] == [
        (-21.66, "[Recurring] spotify", TODAY.isoformat(), "Revolut")
    ]

    text = tg.last_text()
    assert text.startswith("✅ Recurring expense 21.66€ · Entertainment")
    assert "every month, 3 times" in text and "1 of 3 recorded" in text
    keyboard = tg.last_keyboard()
    assert "📅 Date" not in [b["text"] for row in keyboard for b in row]

    # Category and account buttons change the rule and what it already posted.
    press(button(keyboard, "🏷 Category"))
    press(button(tg.last_keyboard(), "Delivery"))
    press(button(keyboard, "🏦 Account"))
    press(button(tg.last_keyboard(), "Cash"))
    row = rows(
        """SELECT c.name cat, a.name acc FROM recurring_entries r JOIN categories c ON c.id = r.category_id
           JOIN accounts a ON a.id = r.account_id WHERE r.user_id = ?""",
        uid,
    )[0]
    assert (row["cat"], row["acc"]) == ("Delivery", "Cash")
    row = rows(
        """SELECT c.name cat, a.name acc FROM expenses e JOIN categories c ON c.id = e.category_id
           JOIN accounts a ON a.id = e.account_id WHERE e.user_id = ?""",
        uid,
    )[0]
    assert (row["cat"], row["acc"]) == ("Delivery", "Cash")

    send("/undo")
    assert _rule(uid) == []
    assert rows("SELECT * FROM expenses WHERE user_id = ?", uid) == []
    assert tg.last_text().startswith("↩️ Removed: Recurring expense 21.66€") and "1 recorded entry" in tg.last_text()


def test_recurring_income_without_end_starting_next_month(client, tg, monkeypatch):  # noqa: F811
    uid = linked_user(client, "tg_recurring_income", ai=True)
    first = (TODAY.replace(day=1) + timedelta(days=32)).replace(day=1)
    fake_ai(
        monkeypatch,
        [
            {
                "transactions": [
                    {
                        "type": "income",
                        "amount": 1500,
                        "category": "Salary",
                        "notes": "μισθός",
                        "date": first.isoformat(),
                        "repeat": {"every": 1, "unit": "month", "times": None},
                    }
                ]
            }
        ],
    )
    send("μισθός 1500 κάθε 1η του μήνα")
    r = _rule(uid)[0]
    assert (r["entry_type"], r["months_to_run"], r["start_date"], r["day_of_month"]) == (
        "income",
        None,
        first.isoformat(),
        1,
    )
    assert rows("SELECT * FROM income_entries WHERE user_id = ?", uid) == []
    assert "no end date" in tg.last_text() and "0 recorded so far" in tg.last_text()
    press(button(tg.last_keyboard(), "🏷 Category"))
    assert "Salary" in [b["text"] for row in tg.last_keyboard() for b in row]


def test_shared_bills_cannot_repeat(client, tg, monkeypatch):  # noqa: F811
    uid = linked_user(client, "tg_recurring_shared", ai=True)
    shared_group(uid, "Σπίτι", ["Νίκος"])
    fake_ai(
        monkeypatch,
        [
            {
                "transactions": [
                    {
                        "type": "expense",
                        "amount": 40,
                        "category": "Other",
                        "notes": "internet",
                        "date": TODAY.isoformat(),
                        "repeat": {"every": 1, "unit": "month", "times": None},
                    }
                ]
            }
        ],
    )
    send("internet 40 μοιρασμένο κάθε μήνα")
    assert "can't repeat" in tg.last_text()
    assert _rule(uid) == [] and rows("SELECT * FROM shared_expenses WHERE user_id = ?", uid) == []


def test_old_telegram_entries_table_gains_the_recurring_kind():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("CREATE TABLE users (id INTEGER PRIMARY KEY)")
    conn.execute("CREATE TABLE accounts (id INTEGER PRIMARY KEY)")
    conn.execute("""CREATE TABLE telegram_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('expense', 'income', 'shared')),
        row_id INTEGER NOT NULL, source TEXT NOT NULL DEFAULT 'ai',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")
    conn.execute("INSERT INTO users (id) VALUES (1)")
    conn.execute("INSERT INTO telegram_entries (id, user_id, kind, row_id) VALUES (7, 1, 'expense', 42)")
    telegram_bot.migrate_telegram(conn)
    telegram_bot.migrate_telegram(conn)  # idempotent
    conn.execute("INSERT INTO telegram_entries (user_id, kind, row_id) VALUES (1, 'recurring', 3)")
    got = conn.execute("SELECT id, kind, row_id FROM telegram_entries ORDER BY id").fetchall()
    assert [tuple(r) for r in got] == [(7, "expense", 42), (8, "recurring", 3)]


def test_the_amount_written_beats_the_ais_reading_of_it(monkeypatch):
    item = {"type": "expense", "category": "Entertainment", "notes": "netflix", "date": "2026-11-10"}
    fake_ai(monkeypatch, [{"transactions": [{**item, "amount": 1299}]}])
    assert [t.amount for t in tp.parse_transactions("netflix 12,99", _ctx(ai_settings=AI_ON))] == [12.99]
    fake_ai(monkeypatch, [{"transactions": [{**item, "amount": 3}, {**item, "amount": 77}]}])
    txns = tp.parse_transactions("καφές 3, σουβλάκια 12", _ctx(ai_settings=AI_ON))
    assert [(t.amount, t.source) for t in txns] == [(3.0, "ai")]


# --- voice messages ---------------------------------------------------------------


def _fake_whisper(monkeypatch, heard):
    seen = {}

    def transcribe(audio, filename, **kw):
        seen.update(audio=audio, filename=filename, **kw)
        return heard

    monkeypatch.setenv("VB_WHISPER_URL", "http://whisper:8000/")
    monkeypatch.setattr(telegram_bot, "download_file", lambda file_id, token: b"ogg-bytes")
    monkeypatch.setattr(integrations, "transcribe_audio", transcribe)
    return seen


def test_voice_message_is_transcribed_and_recorded(client, tg, monkeypatch):  # noqa: F811
    uid = linked_user(client, "tg_voice")
    seen = _fake_whisper(monkeypatch, "καφές 3,50 μετρητά")
    send(voice={"file_id": "v1", "duration": 3, "mime_type": "audio/ogg"})
    row = rows("""SELECT e.amount, a.name acc FROM expenses e JOIN accounts a ON a.id = e.account_id
                   WHERE e.user_id = ?""", uid)[0]
    assert (row["amount"], row["acc"]) == (-3.5, "Cash")
    assert seen["audio"] == b"ogg-bytes" and seen["filename"] == "voice.ogg"
    assert "Cash" in seen["prompt"]  # account and category names help Whisper spell them
    assert seen["settings"]["url"] == "http://whisper:8000"
    texts = [p["text"] for m, p in tg.calls if m in ("sendMessage", "editMessageText")]
    assert texts[0] == "🎙 Listening…"
    assert "🎙 Heard: «καφές 3,50 μετρητά»" in texts


def test_voice_questions_are_answered(client, tg, monkeypatch):  # noqa: F811
    linked_user(client, "tg_voice_ask")
    _fake_whisper(monkeypatch, "υπόλοιπο")
    send(voice={"file_id": "v2", "duration": 1})
    assert tg.last_text().startswith("Balances:")


def test_voice_message_that_is_not_understood(client, tg, monkeypatch):  # noqa: F811
    uid = linked_user(client, "tg_voice_none")
    _fake_whisper(monkeypatch, None)
    send(voice={"file_id": "v3", "duration": 1})
    assert "Couldn't make out" in tg.last_text()
    assert rows("SELECT id FROM expenses WHERE user_id = ?", uid) == []


def test_voice_messages_need_a_whisper_server(client, tg, monkeypatch):  # noqa: F811
    linked_user(client, "tg_voice_off")
    monkeypatch.delenv("VB_WHISPER_URL", raising=False)
    send(voice={"file_id": "v4", "duration": 1})
    assert "Voice messages are off" in tg.last_text()


def test_voice_uses_the_users_own_whisper_settings(client, tg, monkeypatch):  # noqa: F811
    uid = linked_user(client, "tg_voice_db")
    seen = _fake_whisper(monkeypatch, "καφές 2")  # env says http://whisper:8000
    conn = get_connection()
    try:
        integrations.save_whisper_user_settings(conn, uid, integrations.parse_whisper_form(
            {"whisper_enabled": "1", "whisper_url": "http://mine:9000/", "whisper_model": "", "whisper_language": ""}))
    finally:
        conn.close()
    send(voice={"file_id": "v5", "duration": 1})
    assert seen["settings"] == {"url": "http://mine:9000", "model": integrations.DEFAULT_WHISPER_MODEL, "language": ""}

    conn = get_connection()
    try:  # switched off by the user: the environment no longer applies
        integrations.save_whisper_user_settings(conn, uid, integrations.parse_whisper_form(
            {"whisper_url": "http://mine:9000", "whisper_language": "el"}))
        # saving the Ollama settings leaves Whisper's alone
        integrations.save_user_integrations(conn, uid, integrations.default_integration_settings())
        assert integrations.get_whisper_user_settings(conn, uid)["whisper_url"] == "http://mine:9000"
    finally:
        conn.close()
    send(voice={"file_id": "v6", "duration": 1})
    assert "Voice messages are off" in tg.last_text()


def test_whisper_form_validation():
    with pytest.raises(ValueError):
        integrations.parse_whisper_form({"whisper_enabled": "1", "whisper_url": ""})
    with pytest.raises(ValueError):
        integrations.parse_whisper_form({"whisper_url": "whisper:8000"})
    with pytest.raises(ValueError):
        integrations.parse_whisper_form({"whisper_language": "Greek"})
    assert integrations.parse_whisper_form({"whisper_language": " EL "})["whisper_language"] == "el"


def test_whisper_connection_test(monkeypatch):
    monkeypatch.setattr(integrations, "_fetch_json", lambda url, timeout: {"data": [{"id": "m1"}]})
    assert integrations.test_whisper_connection({"url": "http://w", "model": "m1"})[0] is True
    ok, msg = integrations.test_whisper_connection({"url": "http://w", "model": "m2"})
    assert not ok and "curl -X POST http://w/v1/models/m2" in msg
    assert integrations.test_whisper_connection({"url": "", "model": "m1"})[0] is False


def test_transcribe_audio_posts_an_openai_style_request(monkeypatch):
    captured = {}

    class Resp:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def read(self):
            return json.dumps({"text": " βενζίνη 50 \n"}).encode()

    def fake_urlopen(req, timeout):
        captured.update(url=req.full_url, body=req.data, ctype=req.headers["Content-type"])
        return Resp()

    monkeypatch.setattr(integrations, "urlopen", fake_urlopen)
    text = integrations.transcribe_audio(
        b"OGG", "voice.ogg", prompt="Revolut",
        settings={"url": "http://w:8000", "model": "m", "language": "el"},
    )
    assert text == "βενζίνη 50"
    assert captured["url"] == "http://w:8000/v1/audio/transcriptions"
    assert captured["ctype"].startswith("multipart/form-data; boundary=")
    body = captured["body"]
    for part in (b'name="model"\r\n\r\nm\r\n', b'name="language"\r\n\r\nel\r\n',
                 b'name="prompt"\r\n\r\nRevolut\r\n', b'filename="voice.ogg"', b"\r\n\r\nOGG\r\n"):
        assert part in body
    assert integrations.transcribe_audio(b"x", "a.ogg", settings={"url": "", "model": "m", "language": ""}) is None
