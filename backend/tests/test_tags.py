"""Tags (#hashtags in notes): parsing and totals across categories (old
tests/test_tags.py). The web report and Telegram tests are PENDING (see
docs/TEST_PARITY.md)."""

from datetime import date

from vbx.core import tags
from vbx.core import telegram_parse as tp

from .conftest import get_connection, register_and_login, user_id

# --- parsing ------------------------------------------------------------------------


def test_tags_are_found_in_any_script_and_compared_without_case_or_accents():
    assert tags.find_tags("καφές #Διακοπές2026 #trip-ny #διακοπες2026") == ["Διακοπές2026", "trip-ny"]
    assert tags.tag_key("#Διακοπές2026") == tags.tag_key("διακοπες2026") == "διακοπες2026"
    assert tags.find_tags("table #3, mail a#b, url x.com/#top") == []  # no letters / not a word start
    assert tags.strip_tags("καφές #trip 3") == "καφές 3"
    assert tags.add_tags("καφές #trip", ["Trip", "party"]) == "καφές #trip #party"
    assert tags.clean_tag("#διακοπές 2026") == "διακοπές2026"
    assert tags.clean_tag("2026") is None


def test_linkify_escapes_html_and_links_tags():
    html = str(tags.linkify("<b>x</b> & #trip2026"))
    assert html.startswith("&lt;b&gt;x&lt;/b&gt; &amp; ")
    assert '<a class="tag-chip" href="/?panel=reports&amp;reports_section=tags&amp;tag=trip2026">#trip2026</a>' in html


def test_tag_numbers_are_not_amounts():
    assert [a.value for a in tp.find_amounts("#2026 καφές 3")] == [3.0]


# --- totals ---------------------------------------------------------------------------


def test_tag_totals_add_up_across_categories(client):
    """Old: test_web_tag_report_adds_up_across_categories — the tags.detail /
    tags.summary maths and the tag list bootstrap hands to the notes fields.
    The rendered report (HTML) part is PENDING with the reports router."""
    api = register_and_login(client, "tag_web")
    uid = user_id("tag_web")
    conn = get_connection()
    conn.execute("INSERT INTO categories (user_id, name) VALUES (?, 'Hotel')", (uid,))
    conn.commit()
    hotel = conn.execute("SELECT id FROM categories WHERE user_id = ? AND name = 'Hotel'", (uid,)).fetchone()["id"]
    general = conn.execute("SELECT id FROM categories WHERE user_id = ? AND name = 'General'", (uid,)).fetchone()["id"]
    inc = conn.execute("SELECT id FROM income_categories WHERE user_id = ? ORDER BY id LIMIT 1", (uid,)).fetchone()[
        "id"
    ]
    acc = conn.execute("SELECT id FROM accounts WHERE user_id = ? ORDER BY id LIMIT 1", (uid,)).fetchone()["id"]
    conn.close()

    for notes, amount, day in (
        ("ferry #Trip2026", "-80", "2026-07-01"),  # the form signs spending
        ("dinner #trip2026 #friends", "-45.50", "2026-07-03"),
        ("coffee", "-3", "2026-07-02"),
    ):
        resp = api.post(
            "/api/expenses",
            json={"notes": notes, "amount": amount, "category_id": general, "account_id": acc, "spent_at": day},
        )
        assert resp.status_code == 200, resp.text

    conn = get_connection()
    # Income goes in directly until the income router exists.
    conn.execute(
        "INSERT INTO income_entries (user_id, notes, amount, category_id, account_id, received_at) "
        "VALUES (?, 'refund #trip2026', 20, ?, ?, '2026-07-10')",
        (uid, inc, acc),
    )
    conn.execute(
        "INSERT INTO expenses (user_id, notes, amount, category_id, account_id, spent_at) "
        "VALUES (?, 'hotel #TRIP2026', -300, ?, ?, '2026-07-02')",
        (uid, hotel, acc),
    )
    conn.commit()
    detail = tags.detail(conn, uid, "trip2026")
    summary = {t["key"]: t for t in tags.summary(conn, uid)}
    conn.close()

    assert (detail["spent"], detail["income"], detail["net"], detail["count"]) == (425.5, 20.0, -405.5, 4)
    assert (detail["first"], detail["last"]) == ("2026-07-01", "2026-07-10")
    assert [c["name"] for c in detail["categories"]] == ["Hotel", "General"]
    assert summary["trip2026"]["spent"] == 425.5 and summary["friends"]["count"] == 1

    boot = api.get("/api/bootstrap").json()
    assert "trip2026" in [t.lower() for t in boot["tag_names"]]
    conn = get_connection()
    expected_chips = tags.chip_tags(tags.summary(conn, uid), date.today())
    conn.close()
    assert boot["recent_tags"] == expected_chips  # [] today: July is too long ago for chips


def test_chips_offer_only_a_few_recently_used_tags():
    rows = [{"tag": f"t{i}", "last": f"2026-11-{10 - i:02d}"} for i in range(9)] + [
        {"tag": "old", "last": "2026-01-01"}
    ]
    assert tags.chip_tags(rows, date(2026, 11, 10)) == ["t0", "t1", "t2", "t3", "t4", "t5"]
    assert tags.chip_tags([{"tag": "old", "last": "2026-08-01"}], date(2026, 11, 10)) == []
