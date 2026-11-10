"""Bank badges recognised from account names (old tests/test_banks.py)."""

import os

import pytest

from vbx.core import banks
from vbx.core.banks import detect_bank

from .conftest import register_and_login, user_id


@pytest.mark.parametrize(
    "name, slug",
    [
        ("Eurobank Main", "eurobank"),
        ("Πειραιώς μισθοδοσία", "piraeus"),
        ("ΕΘΝΙΚΗ", "nbg"),
        ("NBG savings", "nbg"),
        ("Alpha Bank", "alpha"),
        ("Revolut EUR", "revolut"),
        ("CrediaBank", "attica"),
        ("Μετρητά", "cash"),
        ("Ticket Restaurant", "ticket_restaurant"),
        ("TicketRestaurant", "ticket_restaurant"),
        ("Edenred κάρτα", "ticket_restaurant"),
        ("Τικετ", "ticket_restaurant"),
    ],
)
def test_detect_bank_from_account_name(name, slug):
    assert detect_bank(name)["slug"] == slug


@pytest.mark.parametrize("name", ["Revolutionary fund", "Holiday fund", "", None])
def test_unknown_names_have_no_bank(name):
    # Only whole words match, so "Revolutionary" is not Revolut.
    assert detect_bank(name) is None


def test_bootstrap_shows_bank_badges(client):
    """Old: test_dashboard_shows_bank_badges (badges in the page HTML)."""
    api = register_and_login(client, "bank-badges-user")
    # Accounts are added straight in the DB until the accounts router exists.
    from .conftest import get_connection

    uid = user_id("bank-badges-user")
    conn = get_connection()
    for name in ("Eurobank Main", "Holiday fund"):
        conn.execute("INSERT INTO accounts (user_id, name, opening_balance) VALUES (?, ?, 10)", (uid, name))
    conn.commit()
    conn.close()

    accounts = {a["name"]: a for a in api.get("/api/bootstrap").json()["accounts"]}
    assert accounts["Eurobank Main"]["bank"]["slug"] == "eurobank"
    assert accounts["Eurobank Main"]["bank"]["name"] == "Eurobank"
    assert accounts["Eurobank Main"]["bank"]["logo"] == "/static/banks/eurobank.png"
    assert accounts["Holiday fund"]["bank"] is None


def test_every_shipped_logo_is_served(client):
    names = sorted(os.listdir(banks._LOGO_DIR))
    assert names, "bank logos were not copied to vbx/static/banks"
    for name in names:
        resp = client.get(f"/static/banks/{name}")
        assert resp.status_code == 200, name
        assert resp.headers["content-type"].startswith("image/"), (name, resp.headers["content-type"])
