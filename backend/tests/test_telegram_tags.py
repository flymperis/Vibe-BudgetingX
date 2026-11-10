"""The Telegram half of the old tests/test_tags.py (tags in bot messages, /tag
mode, tag questions, shared bills). Ported 1:1; the other test_tags.py tests
live in tests/test_tags.py."""

from vbx.core import tags

from .conftest import get_connection
from .helpers_telegram import button, linked_user, rows, send, shared_group, tg  # noqa: F401  (tg is a fixture)


def test_telegram_keeps_tags_and_still_finds_the_category(client, tg):  # noqa: F811
    uid = linked_user(client, "tag_bot")
    send("χθες καφές 3 #Διακοπές2026")
    row = rows(
        "SELECT e.notes, c.name FROM expenses e JOIN categories c ON c.id = e.category_id WHERE e.user_id = ?", uid
    )[0]
    assert (row["notes"], row["name"]) == ("καφές #Διακοπές2026", "Entertainment")
    assert "#Διακοπές2026" in tg.last_text()


def test_tag_mode_tags_every_entry_until_turned_off(client, tg):  # noqa: F811
    uid = linked_user(client, "tag_mode")
    send("/tag Λονδίνο 2026")
    assert "#Λονδίνο2026" in tg.last_text()
    send("καφές 3, σουβλάκια 12")
    send("/tag off")
    assert tg.last_text().startswith("Stopped tagging #Λονδίνο2026. #Λονδίνο2026: 15.00€ spent · 2 entries")
    send("καφές 2")
    notes = [r["notes"] for r in rows("SELECT notes FROM expenses WHERE user_id = ? ORDER BY id", uid)]
    assert notes == ["καφές #Λονδίνο2026", "σουβλάκια #Λονδίνο2026", "καφές"]

    send("/tag")  # menu offers recent tags as buttons
    button(tg.last_keyboard(), "#Λονδίνο2026")


def test_questions_and_tags_command(client, tg):  # noqa: F811
    linked_user(client, "tag_ask")
    send("σούπερ μάρκετ 20 #πάρτι")
    send("efood 15 #πάρτι")
    send("πόσα κόστισε το #πάρτι;")
    assert tg.last_text().startswith("#πάρτι: 35.00€ spent · 2 entries")
    assert "• Super Market: 20.00€ (57%)" in tg.last_text()
    send("/tags")
    assert "• #πάρτι: 35.00€ · 2 entries" in tg.last_text()
    send("/tags άγνωστο")
    assert tg.last_text() == "Nothing is tagged #άγνωστο yet."


def test_shared_bill_keeps_its_tag_in_my_share(client, tg):  # noqa: F811
    uid = linked_user(client, "tag_shared")
    shared_group(uid, "Φίλοι", ["Άννα"])
    send("πίτσα 30 μοιρασμένο #πάρτι")
    bill = rows("SELECT description FROM shared_expenses WHERE user_id = ?", uid)[0]
    assert bill["description"] == "πίτσα #πάρτι"
    conn = get_connection()
    detail = tags.detail(conn, uid, "πάρτι")
    conn.close()
    assert detail["spent"] == 15.0  # only my share is my spending
