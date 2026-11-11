"""Scenario scripts. Each returns a list of Steps (see actions.py).

Dates are absolute; the clock of both apps is frozen at servers.DEFAULT_NOW
(2026-11-10 12:00), so "today" is 2026-11-10 in every run.
"""

from __future__ import annotations

import random

from actions import (
    Raw, S, acc, cat, group, icat, last, person, person_of_user, self_person, settlement, shared_expense,
)

PW = "parity-password-123"
ANON = "anon"  # a client that never logs in


def auth_steps():
    return [
        S(ANON, "register", "reject", username="ab", password=PW, note="username too short"),
        S(ANON, "register", "reject", username="mallory", password="short", note="password too short"),
        S(ANON, "register", "reject", username="mallory", password=PW, password2=PW + "x", note="passwords differ"),
        S("alice", "register", "ok", username="alice", password=PW),
        S("alice2", "register", "reject", username="ALICE", password=PW, note="duplicate username (NOCASE)"),
        S("alice", "load"),
        S("alice", "logout", "ok"),
        S("alice", "login", "reject", username="alice", password="wrong-password"),
        S("alice", "login", "ok", username="alice", password=PW),
        S("bob", "register", "ok", username="bob", password=PW),
        S("bob", "load"),
    ]


def features() -> list:
    """Deterministic coverage of every mutation both apps offer, valid and invalid.

    Both users open the Shared screen once right after registering: the old app
    creates the user's own "You" person on ANY page load, the new one only on
    GET /api/shared (finding NB-1, shown by scenarios a and b2). Opening Shared
    first keeps the person ids aligned here so the shared-expense logic itself
    is compared without that one known cascade."""
    s = auth_steps()
    a = "alice"
    s += [
        S(a, "shared_view"),
        S("bob", "shared_view"),
        # --- accounts incl. credit cards
        S(a, "account_add", "ok", name="Savings", account_type="bank", opening_balance="2500.50"),
        S(a, "account_add", "ok", name="Visa", account_type="credit", opening_balance="300", credit_limit="2000", statement_day="5", due_day="25"),
        S(a, "account_add", "ok", name="Mastercard", account_type="credit", opening_balance="-40", credit_limit="", statement_day="28", due_day=""),
        S(a, "account_add", "ok", name="Temp", opening_balance=""),
        S(a, "account_add", "reject", name="Bad1", account_type="credit", credit_limit="abc"),
        S(a, "account_add", "reject", name="Bad2", account_type="credit", statement_day="40"),
        S(a, "account_add", "reject", name="Bad3", account_type="credit", due_day="10"),
        S(a, "account_add", "reject", name="Bad4", opening_balance="12,5x"),
        S(a, "account_add", "reject", name="Bad5", account_type="credit", credit_limit="-5"),
        S(a, "account_add", "reject", name="   ", opening_balance="1"),
        S(a, "account_add", "reject", name="Savings", opening_balance="9"),
        S(a, "account_edit", "ok", id=acc("Savings"), name="Savings", account_type="bank", opening_balance="2600"),
        S(a, "account_edit", "ok", id=acc("Mastercard"), name="Mastercard", account_type="credit", opening_balance="40", credit_limit="500", statement_day="28", due_day="15"),
        S(a, "account_delete", "ok", id=acc("Temp")),
        S(a, "account_delete", "reject", id=acc("Main", user="bob"), note="foreign account"),
        # --- categories
        S(a, "category_add", "ok", name="Food"),
        S(a, "category_add", "ok", name="Rent"),
        S(a, "category_add", "ok", name="Fun"),
        S(a, "category_add", "ok", name="Transport"),
        S(a, "category_add", "ok", name="Travel"),
        S(a, "category_add", "reject", name="Food"),
        S(a, "category_add", "reject", name=""),
        S(a, "category_edit", "ok", id=cat("Fun"), name="Leisure"),
        S(a, "category_edit", "reject", id=cat("General", user="bob"), name="Hijack"),
        S(a, "icat_add", "ok", name="Bonus"),
        S(a, "icat_add", "ok", name="Gifts"),
        S(a, "icat_add", "reject", name="Bonus"),
        S(a, "icat_edit", "ok", id=icat("Gifts"), name="Presents"),
        S(a, "category_delete", "ok", id=cat("Transport")),
        S(a, "category_delete", "reject", id=cat("Transport"), note="already gone"),
        S("bob", "category_add", "ok", name="Bobfood"),
        # --- expenses
        S(a, "expense_add", "ok", notes="groceries #home", amount="-54.30", category_id=cat("Food"), account_id=acc("Main"), spent_at="2026-11-02"),
        S(a, "expense_add", "ok", notes="rent", amount="-800", category_id=cat("Rent"), account_id=acc("Main"), spent_at="2026-11-01"),
        S(a, "expense_add", "ok", notes="cinema #fun", amount="-12.5", category_id=cat("Leisure"), account_id=acc("Visa"), spent_at="2026-10-28"),
        S(a, "expense_add", "ok", notes="flight #trip", amount="-230.99", category_id=cat("Travel"), account_id=acc("Visa"), spent_at="2026-10-03"),
        S(a, "expense_add", "ok", notes="refund #trip", amount="30", category_id=cat("Travel"), account_id=acc("Visa"), spent_at="2026-10-09"),
        S(a, "expense_add", "ok", notes="rent", amount="-800", category_id=cat("Rent"), account_id=acc("Main"), spent_at="2026-10-01"),
        S(a, "expense_add", "ok", notes="old food", amount="-20.1", category_id=cat("Food"), account_id=acc("Mastercard"), spent_at="2025-12-31"),
        S(a, "expense_add", "ok", notes="no date", amount="-1.11", category_id=cat("Food"), account_id=acc("Main"), spent_at=""),
        S(a, "expense_add", "ok", notes="junk amount", amount="abc", category_id=cat("Food"), account_id=acc("Main"), spent_at="2026-09-15", note="old+new store 0.0"),
        S(a, "expense_add", "ok", notes="bad date", amount="-2", category_id=cat("Food"), account_id=acc("Main"), spent_at="2026-13-45"),
        S(a, "expense_add", "ok", notes="comma", amount="-3,50", category_id=cat("Food"), account_id=acc("Main"), spent_at="2026-11-05"),
        S(a, "expense_add", "reject", notes="blank cat", amount="-3", category_id="", account_id=acc("Main")),
        S(a, "expense_add", "reject", notes="foreign cat", amount="-3", category_id=cat("Bobfood", user="bob"), account_id=acc("Main")),
        S(a, "expense_add", "reject", notes="non-int", amount="-3", category_id="x1", account_id=acc("Main")),
        S(a, "expense_edit", "ok", id=last("expenses", where="notes='groceries #home'"), notes="groceries #home #weekly", amount="-58.30", category_id=cat("Food"), account_id=acc("Main"), spent_at="2026-11-03"),
        S("bob", "expense_edit", "reject", id=last("expenses", user=a), notes="hijack", amount="-1", category_id=cat("General"), account_id=acc("Main")),
        S(a, "expense_delete", "ok", id=last("expenses", where="notes='bad date'")),
        S(a, "expense_delete", "reject", id=Raw(999999)),
        S(a, "category_delete", "reject", id=cat("Food"), note="has expenses"),
        # --- income
        S(a, "income_add", "ok", notes="salary", amount="2100", category_id=icat("Salary"), account_id=acc("Main"), received_at="2026-11-01"),
        S(a, "income_add", "ok", notes="salary", amount="2100", category_id=icat("Salary"), account_id=acc("Main"), received_at="2026-10-01"),
        S(a, "income_add", "ok", notes="bonus #work", amount="-350.75", category_id=icat("Bonus"), account_id=acc("Savings"), received_at="2026-10-20", note="stored abs()"),
        S(a, "income_add", "ok", notes="gift", amount="50", category_id=icat("Presents"), account_id=acc("Main"), received_at="2025-12-24"),
        S(a, "income_add", "reject", notes="x", amount="5", category_id=icat("Salary"), account_id=""),
        S(a, "income_add", "reject", notes="x", amount="5", category_id=icat("Salary", user="bob"), account_id=acc("Main")),
        S(a, "income_edit", "ok", id=last("income_entries", where="notes='gift'"), notes="gift", amount="60", category_id=icat("Presents"), account_id=acc("Main"), received_at="2025-12-25"),
        S(a, "income_delete", "reject", id=last("income_entries", user="bob")),
        S(a, "icat_delete", "reject", id=icat("Bonus"), note="has income"),
        # --- transfers
        S(a, "transfer_add", "ok", from_account_id=acc("Main"), to_account_id=acc("Savings"), amount="200", transferred_at="2026-11-04", notes="save"),
        S(a, "transfer_add", "ok", from_account_id=acc("Main"), to_account_id=acc("Visa"), amount="-150", transferred_at="2026-11-06", notes="pay card (negative typed)"),
        S(a, "transfer_add", "ok", from_account_id=acc("Savings"), to_account_id=acc("Mastercard"), amount="40", transferred_at="", notes=""),
        S(a, "transfer_add", "reject", from_account_id=acc("Main"), to_account_id=acc("Main"), amount="5"),
        S(a, "transfer_add", "reject", from_account_id=acc("Main"), to_account_id=acc("Savings"), amount="0"),
        S(a, "transfer_add", "reject", from_account_id=acc("Main"), to_account_id=acc("Savings"), amount="abc"),
        S(a, "transfer_add", "reject", from_account_id="", to_account_id=acc("Savings"), amount="5"),
        S(a, "transfer_add", "reject", from_account_id=acc("Main"), to_account_id=acc("Main", user="bob"), amount="5"),
        S(a, "transfer_add", "ok", from_account_id=acc("Savings"), to_account_id=acc("Main"), amount="1", notes="to delete"),
        S(a, "transfer_delete", "ok", id=last("account_transfers", where="notes='to delete'")),
        S(a, "transfer_delete", "reject", id=Raw(999999)),
        # --- recurring (every interval type) + posting on load
        S(a, "recurring_add", "ok", category_choice=_choice("e", "Leisure"), amount="9.99", account_id=acc("Visa"), months_to_run="6", interval_unit="month", interval_count="1", start_date="2026-08-15", notes="spotify"),
        S(a, "recurring_add", "ok", category_choice=_choice("i", "Bonus"), amount="25", account_id=acc("Main"), indefinitely="1", interval_unit="week", interval_count="2", start_date="2026-10-01", notes="side gig"),
        S(a, "recurring_add", "ok", category_choice=_choice("e", "Food"), amount="-120", account_id=acc("Main"), indefinitely="1", interval_unit="year", interval_count="1", start_date="2024-02-29", notes="yearly fee"),
        S(a, "recurring_add", "ok", category_choice=_choice("i", "Salary"), amount="100", account_id=acc("Savings"), months_to_run="4", interval_unit="month", interval_count="3", start_date="2026-01-31", notes="quarterly"),
        S(a, "recurring_add", "ok", category_choice=_choice("e", "Rent"), amount="15", account_id=acc("Main"), indefinitely="1", day_of_month="31", notes="legacy form (no start_date)"),
        S(a, "recurring_add", "ok", category_choice=_choice("e", "Food"), amount="7", account_id=acc("Main"), indefinitely="1", interval_unit="week", interval_count="1", start_date="2026-12-01", notes="future"),
        S(a, "recurring_add", "reject", category_choice=_choice("e", "Food"), amount="7", account_id=acc("Main"), indefinitely="1", interval_unit="day", start_date="2026-10-01"),
        S(a, "recurring_add", "reject", category_choice=_choice("e", "Food"), amount="7", account_id=acc("Main"), indefinitely="1", interval_unit="week", interval_count="0", start_date="2026-10-01"),
        S(a, "recurring_add", "reject", category_choice=_choice("e", "Food"), amount="7", account_id=acc("Main"), interval_unit="week", interval_count="1", start_date="2026-10-01", note="no duration"),
        S(a, "recurring_add", "reject", category_choice=_choice("e", "Food"), amount="0", account_id=acc("Main"), indefinitely="1", start_date="2026-10-01"),
        S(a, "recurring_add", "reject", category_choice="x-1", amount="5", account_id=acc("Main"), indefinitely="1", start_date="2026-10-01"),
        S(a, "recurring_add", "reject", category_choice=_choice("e", "Food"), amount="5", account_id=acc("Main"), indefinitely="1", start_date="31/10/2026"),
        S(a, "recurring_add", "reject", category_choice=_choice("i", "Food"), amount="5", account_id=acc("Main"), indefinitely="1", start_date="2026-10-01", note="income type with an expense category id"),
        S(a, "load", checkpoint=True),
        S(a, "recurring_edit", "ok", id=last("recurring_entries", where="notes='spotify'"), category_choice=_choice("e", "Leisure"), amount="10.99", account_id=acc("Visa"), months_to_run="6", interval_unit="month", interval_count="1", start_date="2026-08-15", notes="spotify", enabled="1"),
        S(a, "recurring_edit", "ok", id=last("recurring_entries", where="notes='side gig'"), category_choice=_choice("i", "Bonus"), amount="25", account_id=acc("Main"), indefinitely="1", interval_unit="month", interval_count="1", start_date="2026-10-01", notes="side gig monthly", enabled="1"),
        S(a, "recurring_edit", "ok", id=last("recurring_entries", where="notes='quarterly'"), category_choice=_choice("i", "Salary"), amount="100", account_id=acc("Savings"), months_to_run="4", interval_unit="month", interval_count="3", start_date="2026-01-31", notes="quarterly paused"),
        S(a, "recurring_edit", "reject", id=Raw(999999), category_choice=_choice("e", "Food"), amount="1", account_id=acc("Main"), indefinitely="1"),
        S("bob", "recurring_delete", "reject", id=last("recurring_entries", user=a)),
        S(a, "recurring_delete", "ok", id=last("recurring_entries", where="notes='future'")),
        S(a, "category_delete", "reject", id=cat("Leisure"), note="has a recurring rule (and expenses)"),
        S(a, "category_add", "ok", name="RuleOnly"),
        S(a, "recurring_add", "ok", category_choice=_choice("e", "RuleOnly"), amount="3", account_id=acc("Main"), indefinitely="1", interval_unit="month", interval_count="1", start_date="2027-01-01", notes="rule only"),
        S(a, "category_delete", "reject", id=cat("RuleOnly"), note="only a recurring rule refers to it"),
        S(a, "load", checkpoint=True),
        # --- budgets
        S(a, "budget_toggle", "ok", enabled="1"),
        S(a, "budget_defaults", "ok", amounts={cat("Food"): "300", cat("Rent"): "800", cat("Leisure"): "", cat("Travel"): "100.555"}, fixed={cat("Rent"): True}, other_amount="150"),
        S(a, "budget_defaults", "reject", amounts={cat("Food"): "-5", cat("Rent"): "900"}),
        S(a, "budget_defaults", "reject", amounts={cat("Food"): "abc"}),
        S(a, "budget_defaults", "reject", amounts={cat("Food"): "10"}, other_amount="inf"),
        S(a, "budget_override", "ok", month="2026-10", category_id=cat("Food"), amount="350"),
        S(a, "budget_override", "ok", month="2026-11", category_id=cat("Leisure"), amount="40"),
        S(a, "budget_override", "reject", month="2026-13", category_id=cat("Food"), amount="1"),
        S(a, "budget_override", "reject", month="2026-10", category_id=cat("Bobfood", user="bob"), amount="1"),
        S(a, "budget_override", "reject", month="2026-10", category_id=cat("Food"), amount="-1"),
        S(a, "budget_clear_month", "ok", month="2026-09"),
        S(a, "budget_override", "ok", month="2026-09", category_id=cat("Rent"), amount="700"),
        S(a, "budget_clear_month", "ok", month="2026-08"),
        S(a, "budget_clear_month", "reject", month="Sept"),
        S(a, "budget_restore_month", "ok", month="2026-08"),
        S(a, "budget_override", "ok", month="2026-10", category_id=cat("Food"), clear="1"),
        S(a, "budget_override", "ok", month="2026-11", category_id=cat("Travel"), amount="", note="blank amount drops the override (old bug, ported)"),
        S("bob", "budget_toggle", "ok", enabled="0"),
        S(a, "budget_toggle", "ok", enabled="0"),
        S(a, "budget_toggle", "ok", enabled="1"),
        # --- shared: two users
        S(a, "person_add", "ok", name="Nikos, Maria, nikos"),
        S(a, "person_add", "reject", name="  "),
        S(a, "person_add", "ok", name="Bobby"),
        S(a, "person_rename", "ok", id=person("Maria"), name="Maria K"),
        S(a, "person_rename", "reject", id=person("Maria K"), name="Nikos"),
        S(a, "person_rename", "reject", id=self_person(), name="Me"),
        S(a, "person_link", "ok", id=person("Bobby"), username="bob"),
        S(a, "person_link", "reject", id=person("Nikos"), username="nobody-here"),
        S(a, "group_add", "ok", name="Trip", member_ids=[person("Nikos"), person("Maria K"), person("Bobby")]),
        S(a, "group_add", "ok", name="Flat", usernames="bob", new_members="Eleni"),
        S(a, "group_add", "reject", name="", new_members="X"),
        S("bob", "group_accept", "ok", id=group("Trip", user="bob")),
        S("bob", "group_decline", "ok", id=group("Flat", user="bob")),
        S("bob", "group_accept", "reject", id=group("Flat", user="bob"), note="already declined"),
        S(a, "sexp_add", "ok", group=group("Trip"), description="Dinner", amount="90", paid_by=self_person(), split_method="equal",
          included=[self_person(), person("Nikos"), person("Maria K"), person("Bobby")], spent_on="2026-10-12", record_personal="1", category_id=cat("Food"), account_id=acc("Main")),
        S(a, "sexp_add", "ok", group=group("Trip"), description="Hotel", amount="301,01", paid_by=person("Bobby"), split_method="exact",
          values={self_person(): "100", person("Nikos"): "100", person("Bobby"): "101.01"}, spent_on="2026-10-13", record_personal="1", category_id=cat("Travel")),
        S(a, "sexp_add", "ok", group=group("Trip"), description="Taxi", amount="33.33", paid_by=person("Nikos"), split_method="percent",
          values={self_person(): "50", person("Nikos"): "25", person("Maria K"): "25"}, spent_on="2026-10-14"),
        S(a, "sexp_add", "ok", group=group("Trip"), description="Museum", amount="47", paid_by=self_person(), split_method="shares",
          values={self_person(): "2", person("Maria K"): "1", person("Bobby"): "3"}, spent_on="2026-11-02", record_personal="1", category_id=cat("Leisure"), account_id=acc("Visa")),
        S(a, "sexp_add", "reject", group=group("Trip"), description="Bad", amount="0", paid_by=self_person(), split_method="equal", included=[self_person()]),
        S(a, "sexp_add", "reject", group=group("Trip"), description="Bad", amount="10", paid_by=person("Eleni"), split_method="equal", included=[self_person()]),
        S(a, "sexp_add", "reject", group=group("Trip"), description="Bad", amount="10", paid_by=self_person(), split_method="exact", values={self_person(): "4"}),
        S(a, "sexp_add", "reject", group=group("Trip"), description="Bad", amount="10", paid_by=self_person(), split_method="equal", included=[self_person()], record_personal="1", category_id=cat("Food"), account_id=Raw("")),
        S("bob", "sexp_add", "ok", group=group("Trip", user="bob"), description="Snacks", amount="12", paid_by=person_of_user("alice", "bob"), split_method="equal",
          included=[person_of_user("alice", "bob"), person_of_user("alice", "alice")], spent_on="2026-11-03", record_personal="1", category_id=cat("Bobfood"), account_id=acc("Main")),
        S("bob", "sexp_record", "ok", id=shared_expense("Hotel"), category_id=cat("Bobfood"), account_id=acc("Main")),
        S("bob", "sexp_record", "ok", id=shared_expense("Dinner"), category_id=cat("Bobfood")),
        S("bob", "sexp_record", "reject", id=shared_expense("Taxi"), category_id=cat("Bobfood"), note="bob has no part in it"),
        S("bob", "sexp_unrecord", "ok", id=shared_expense("Dinner")),
        S(a, "sexp_edit", "ok", id=shared_expense("Dinner"), description="Dinner", amount="96", paid_by=self_person(), split_method="equal",
          included=[self_person(), person("Nikos"), person("Maria K"), person("Bobby")], spent_on="2026-10-12", record_personal="1", category_id=cat("Food"), account_id=acc("Main")),
        S(a, "sexp_edit", "ok", id=shared_expense("Taxi"), description="Taxi", amount="33.33", paid_by=person("Nikos"), split_method="percent",
          values={self_person(): "50", person("Nikos"): "25", person("Maria K"): "25"}, spent_on="2026-10-14", note="no record_personal: removes editor's own recording"),
        S(a, "sexp_record", "ok", id=shared_expense("Taxi"), category_id=cat("Travel")),
        S(a, "sexp_unrecord", "ok", id=shared_expense("Taxi")),
        S(a, "settle_add", "ok", group=group("Trip"), from_person_id=person("Nikos"), to_person_id=self_person(), amount="20", paid_on="2026-11-04", notes="nikos pays", record_personal="1", account_id=acc("Savings")),
        S(a, "settle_add", "ok", group=group("Trip"), from_person_id=self_person(), to_person_id=person("Bobby"), amount="15.5", paid_on="2026-11-05", notes="to bob"),
        S(a, "settle_add", "reject", group=group("Trip"), from_person_id=self_person(), to_person_id=self_person(), amount="5"),
        S(a, "settle_add", "reject", group=group("Trip"), from_person_id=self_person(), to_person_id=person("Nikos"), amount="0"),
        S(a, "settle_add", "reject", group=group("Trip"), from_person_id=self_person(), to_person_id=person("Nikos"), amount="5", record_personal="1", account_id=""),
        S("bob", "settle_record", "ok", id=settlement("to bob"), account_id=acc("Main")),
        S(a, "settle_record", "ok", id=settlement("to bob"), account_id=acc("Main")),
        S(a, "settle_unrecord", "ok", id=settlement("to bob")),
        S(a, "settle_record", "reject", id=settlement("to bob"), account_id=Raw("")),
        S(a, "settle_add", "ok", group=group("Trip"), from_person_id=person("Maria K"), to_person_id=self_person(), amount="3", notes="to delete"),
        S(a, "settle_delete", "ok", id=settlement("to delete")),
        S(a, "member_remove", "reject", id=group("Trip"), person_id=person("Nikos"), note="has history"),
        S(a, "member_add", "ok", id=group("Trip"), new_members="Kostas"),
        S(a, "member_add", "reject", id=group("Trip"), member_ids=[person("Nikos")], note="already in"),
        S(a, "member_remove", "ok", id=group("Trip"), person_id=person("Kostas")),
        S(a, "group_rename", "ok", id=group("Trip"), name="Trip 2026"),
        S(a, "person_delete", "reject", id=person("Nikos"), note="in a group"),
        S(a, "person_add", "ok", name="Loner"),
        S(a, "person_delete", "ok", id=person("Loner")),
        S(a, "sexp_add", "ok", group=group("Trip 2026"), description="To delete", amount="5", paid_by=self_person(), split_method="equal", included=[self_person()]),
        S(a, "sexp_delete", "ok", id=shared_expense("To delete")),
        S("bob", "group_delete", "reject", id=group("Trip 2026", user="bob"), note="not the creator"),
        S(a, "group_delete", "ok", id=group("Flat")),
        S(a, "person_unlink", "reject", id=person("Bobby"), note="in a group"),
        S(a, "person_add", "ok", name="Linkme"),
        S(a, "person_link", "reject", id=person("Linkme"), username="alice", note="own login"),
        S(a, "person_link", "reject", id=person("Linkme"), username="bob", note="bob already linked to Bobby"),
        S("carl", "register", "ok", username="carl", password=PW),
        S(a, "person_link", "ok", id=person("Linkme"), username="carl"),
        S(a, "person_unlink", "ok", id=person("Linkme")),
        S(a, "load", checkpoint=True),
        # --- investments
        S(a, "crypto_add", "ok", coin_id="Bitcoin", coin_symbol="btc", coin_name="Bitcoin", tx_type="buy", quantity="0.05", price_per_unit="40000", fee="-5", exchange="Kraken", transacted_at="2025-12-01"),
        S(a, "crypto_add", "ok", coin_id="ethereum", coin_symbol="eth", coin_name="Ethereum", tx_type="BUY", quantity="1.5", price_per_unit="2000", fee="", transacted_at="2026-03-10"),
        S(a, "crypto_add", "ok", coin_id="bitcoin", coin_symbol="btc", coin_name="Bitcoin", tx_type="sell", quantity="0.01", price_per_unit="60000", fee="1", transacted_at="2026-06-01"),
        S(a, "crypto_add", "ok", coin_id="unknown-coin", coin_symbol="unk", coin_name="No price", tx_type="buy", quantity="3", price_per_unit="1", transacted_at="2026-02-01", note="no quote available"),
        S(a, "crypto_add", "reject", coin_id="bitcoin", coin_symbol="btc", coin_name="Bitcoin", tx_type="hold", quantity="1", price_per_unit="1"),
        S(a, "crypto_add", "reject", coin_id="bitcoin", coin_symbol="btc", coin_name="Bitcoin", tx_type="buy", quantity="-1", price_per_unit="1"),
        S(a, "crypto_add", "reject", coin_id="", coin_symbol="btc", coin_name="Bitcoin", tx_type="buy", quantity="1", price_per_unit="1"),
        S(a, "crypto_add", "reject", coin_id="bitcoin", coin_symbol="btc", coin_name="Bitcoin", tx_type="buy", quantity="x", price_per_unit="1"),
        S(a, "crypto_edit", "ok", id=last("crypto_transactions", where="coin_id='ethereum'"), coin_id="ethereum", coin_symbol="eth", coin_name="Ethereum", tx_type="buy", quantity="1.75", price_per_unit="1900", fee="2", exchange="Binance", transacted_at="2026-03-11", notes="edited"),
        S(a, "crypto_edit", "reject", id=Raw(999999), coin_id="ethereum", coin_symbol="eth", coin_name="Ethereum", tx_type="buy", quantity="1", price_per_unit="1"),
        S(a, "stock_add", "ok", symbol="aapl", ticker="aapl", instrument_name="Apple", tx_type="buy", quantity="10", price_per_unit="150", fee="1", broker="Freedom24", transacted_at="2025-06-10"),
        S(a, "stock_add", "ok", symbol="ASML.AS", ticker="ASML", instrument_name="ASML", tx_type="buy", quantity="2", price_per_unit="600", transacted_at="2026-01-15"),
        S(a, "stock_add", "ok", symbol="VUSA.L", ticker="VUSA", instrument_name="Vanguard S&P", tx_type="buy", quantity="5", price_per_unit="80", transacted_at="2026-04-01"),
        S(a, "stock_add", "ok", symbol="AAPL", ticker="AAPL", instrument_name="Apple", tx_type="sell", quantity="3", price_per_unit="190", fee="1", transacted_at="2026-07-01"),
        S(a, "stock_add", "ok", symbol="TMP", ticker="TMP", instrument_name="Temp", tx_type="buy", quantity="1", price_per_unit="1", transacted_at="2026-07-02"),
        S(a, "stock_add", "reject", symbol="", ticker="X", instrument_name="X", tx_type="buy", quantity="1", price_per_unit="1"),
        S(a, "stock_add", "reject", symbol="X", ticker="X", instrument_name="X", tx_type="buy", quantity="1", price_per_unit="-1"),
        S(a, "stock_edit", "ok", id=last("stock_transactions", where="symbol='VUSA.L'"), symbol="VUSA.L", ticker="VUSA", instrument_name="Vanguard S&P 500", tx_type="buy", quantity="6", price_per_unit="79.5", fee="0.5", broker="IBKR", transacted_at="2026-04-02"),
        S(a, "stock_delete", "ok", id=last("stock_transactions", where="symbol='TMP'")),
        S("bob", "stock_delete", "reject", id=last("stock_transactions", user=a)),
        S("bob", "crypto_delete", "reject", id=last("crypto_transactions", user=a)),
        S(a, "crypto_add", "ok", coin_id="dogecoin", coin_symbol="doge", coin_name="Doge", tx_type="buy", quantity="100", price_per_unit="0.1", transacted_at="2026-05-05"),
        S(a, "crypto_delete", "ok", id=last("crypto_transactions", where="coin_id='dogecoin'")),
        # --- settings
        S(a, "ai_save", "ok", ai_enabled="1", ai_provider="ollama", ai_base_url="http://ollama.local:11434/", ai_model="qwen3:8b", ai_timeout="45", ai_ocr_model="glm-ocr"),
        S(a, "ai_save", "reject", ai_enabled="1", ai_provider="ollama", ai_base_url="ftp://x", ai_model="m", ai_timeout="30"),
        S(a, "ai_save", "reject", ai_provider="ollama", ai_timeout="999"),
        S(a, "ai_save", "reject", ai_provider="openai", ai_timeout="30"),
        S(a, "raw_sql", sql="INSERT OR REPLACE INTO telegram_server_config (id, bot_token) VALUES (1, 'parity-fake-token');"
          "INSERT INTO telegram_links (user_id, chat_id, telegram_username) SELECT id, '111', 'alice_tg' FROM users WHERE username='alice';"),
        S(a, "tg_default_account", "ok", default_account_id=acc("Savings")),
        S(a, "tg_default_account", "reject", default_account_id=acc("Main", user="bob")),
        S(a, "tg_default_account", "reject", default_account_id="abc"),
        S("bob", "tg_default_account", "reject", default_account_id=acc("Main"), note="bob has no linked chat"),
        S(a, "tg_notifications", "ok", budget="1", cards="1", weekly="1", card_days="5"),
        S(a, "tg_notifications", "reject", budget="1", card_days="20"),
        S(a, "tg_notifications", "reject", card_days="x"),
        S("bob", "tg_link_code", "ok"),
        S("bob", "tg_notifications", "ok"),
        S(a, "tg_unlink", "ok"),
        S(a, "raw_sql", sql="INSERT INTO telegram_links (user_id, chat_id, telegram_username, default_account_id) "
          "SELECT u.id, '111', 'alice_tg', a.id FROM users u JOIN accounts a ON a.user_id=u.id AND a.name='Visa' WHERE u.username='alice';"),
        S(a, "register", "reject", username="alice3", password=PW, note="already logged in"),
        S(a, "load", checkpoint=True),
    ]
    return s


def _choice(kind, name, user=None):
    from actions import Ref

    table = "categories" if kind == "e" else "income_categories"
    if kind == "i" and name == "Food":  # deliberately mismatched type
        return Ref("SELECT 'i-' || id FROM categories WHERE user_id=:uid AND name='Food'", user, "i-<expense Food id>")
    return Ref(f"SELECT '{kind}-' || id FROM {table} WHERE user_id=:uid AND name=:n", user, f"{kind}-{name}", n=name)


# ---------------------------------------------------------------------------
# rich seeded-random scenario


def rich(seed: int = 20261110, months: int = 20) -> list:
    rnd = random.Random(seed)
    a, b = "alice", "bob"
    s = [
        S(a, "register", "ok", username=a, password=PW),
        S(b, "register", "ok", username=b, password=PW),
        S(a, "shared_view"),  # align the "You" person ids (finding NB-1 is shown by scenario a)
        S(b, "shared_view"),
        S(a, "account_add", "ok", name="Eurobank", opening_balance="1520.35"),
        S(a, "account_add", "ok", name="Revolut", opening_balance="80"),
        S(a, "account_add", "ok", name="Cash", opening_balance="40"),
        S(a, "account_add", "ok", name="Visa Gold", account_type="credit", opening_balance="120", credit_limit="1500", statement_day="10", due_day="28"),
        S(a, "account_add", "ok", name="Amex", account_type="credit", opening_balance="0", credit_limit="800", statement_day="31", due_day="20"),
    ]
    ecats = ["Groceries", "Rent", "Utilities", "Eating out", "Transport", "Health", "Clothes", "Gifts", "Holidays", "Kids"]
    icats = ["Freelance", "Dividends"]
    s += [S(a, "category_add", "ok", name=c) for c in ecats]
    s += [S(a, "icat_add", "ok", name=c) for c in icats]
    s += [S(b, "category_add", "ok", name="Food")]
    accts = ["Main", "Eurobank", "Revolut", "Cash", "Visa Gold", "Amex"]
    tags = ["#trip", "#work", "#home", "#kids", "#xmas", "#car"]
    # recurring rules of every interval type, starting in the past
    s += [
        S(a, "recurring_add", "ok", category_choice=_choice("e", "Rent"), amount="650", account_id=acc("Eurobank"), indefinitely="1", interval_unit="month", interval_count="1", start_date="2025-03-01", notes="rent"),
        S(a, "recurring_add", "ok", category_choice=_choice("e", "Utilities"), amount="45.5", account_id=acc("Visa Gold"), indefinitely="1", interval_unit="month", interval_count="2", start_date="2025-03-20", notes="power"),
        S(a, "recurring_add", "ok", category_choice=_choice("e", "Kids"), amount="12", account_id=acc("Cash"), months_to_run="40", interval_unit="week", interval_count="1", start_date="2025-06-02", notes="pocket money"),
        S(a, "recurring_add", "ok", category_choice=_choice("e", "Health"), amount="300", account_id=acc("Eurobank"), indefinitely="1", interval_unit="year", interval_count="1", start_date="2025-04-30", notes="insurance"),
        S(a, "recurring_add", "ok", category_choice=_choice("i", "Salary"), amount="1850", account_id=acc("Eurobank"), indefinitely="1", interval_unit="month", interval_count="1", start_date="2025-03-31", notes="salary"),
        S(a, "recurring_add", "ok", category_choice=_choice("i", "Dividends"), amount="33.17", account_id=acc("Revolut"), months_to_run="8", interval_unit="month", interval_count="3", start_date="2025-05-15", notes="divs"),
        S(a, "recurring_add", "ok", category_choice=_choice("e", "Transport"), amount="20", account_id=acc("Revolut"), indefinitely="1", interval_unit="week", interval_count="2", start_date="2025-09-05", notes="fuel"),
        S(a, "recurring_add", "ok", category_choice=_choice("e", "Eating out"), amount="8.9", account_id=acc("Amex"), indefinitely="1", day_of_month="29", notes="legacy"),
        S(a, "load", checkpoint=True),
    ]
    # budgets
    s += [
        S(a, "budget_toggle", "ok", enabled="1"),
        S(a, "budget_defaults", "ok", amounts={cat("Groceries"): "350", cat("Rent"): "650", cat("Eating out"): "120", cat("Transport"): "90", cat("Kids"): ""},
          fixed={cat("Rent"): True}, other_amount="200"),
    ]
    # shared group with bob
    s += [
        S(a, "person_add", "ok", name="Babis"),
        S(a, "group_add", "ok", name="Holiday", member_ids=[person("Babis")], usernames="bob"),
        S(b, "group_accept", "ok", id=group("Holiday", user=b)),
    ]
    # investments
    for coin in ("bitcoin", "ethereum", "solana"):
        for _ in range(rnd.randint(2, 4)):
            y, m = rnd.choice([(2025, 3), (2025, 7), (2025, 11), (2026, 2), (2026, 6), (2026, 9)])
            s.append(S(a, "crypto_add", "ok", coin_id=coin, coin_symbol=coin[:3], coin_name=coin.title(), tx_type="buy", quantity=f"{rnd.uniform(0.01, 3):.4f}",
                       price_per_unit=f"{rnd.uniform(20, 50000):.2f}", fee=f"{rnd.uniform(0, 5):.2f}", transacted_at=f"{y}-{m:02d}-{rnd.randint(1, 28):02d}"))
    s.append(S(a, "crypto_add", "ok", coin_id="bitcoin", coin_symbol="btc", coin_name="Bitcoin", tx_type="sell", quantity="0.005", price_per_unit="55000", transacted_at="2026-08-08"))
    for sym in ("MSFT", "NVDA", "SAP.DE", "BP.L"):
        for _ in range(rnd.randint(1, 3)):
            y, m = rnd.choice([(2025, 4), (2025, 10), (2026, 1), (2026, 5), (2026, 10)])
            s.append(S(a, "stock_add", "ok", symbol=sym, ticker=sym.split(".")[0], instrument_name=sym, tx_type="buy", quantity=str(rnd.randint(1, 20)),
                       price_per_unit=f"{rnd.uniform(10, 900):.2f}", fee="1", broker="Freedom24", transacted_at=f"{y}-{m:02d}-{rnd.randint(1, 28):02d}"))
    s.append(S(a, "stock_add", "ok", symbol="MSFT", ticker="MSFT", instrument_name="MSFT", tx_type="sell", quantity="1", price_per_unit="400", transacted_at="2026-09-09"))

    # months of activity: 2025-03 .. 2026-11
    ym = [(2025 + (2 + i) // 12, (2 + i) % 12 + 1) for i in range(months + 1)]
    n_shared = 0
    for (y, m) in ym:
        last_day = 28
        is_now = (y, m) == (2026, 11)
        top_day = 10 if is_now else last_day
        for _ in range(rnd.randint(14, 24)):
            d = rnd.randint(1, top_day)
            c = rnd.choice(ecats)
            amt = -round(rnd.uniform(1, 180), 2)
            if rnd.random() < 0.06:
                amt = round(rnd.uniform(1, 40), 2)  # refund
            note = rnd.choice(["", "shop", "online", "market"]) + (" " + rnd.choice(tags) if rnd.random() < 0.3 else "")
            s.append(S(a, "expense_add", "ok", notes=note.strip(), amount=f"{amt}", category_id=cat(c), account_id=acc(rnd.choice(accts)), spent_at=f"{y}-{m:02d}-{d:02d}"))
        for _ in range(rnd.randint(1, 3)):
            s.append(S(a, "income_add", "ok", notes=rnd.choice(["invoice", "bonus #work", "gift"]), amount=f"{round(rnd.uniform(20, 900), 2)}",
                       category_id=icat(rnd.choice(icats + ["Other"])), account_id=acc(rnd.choice(accts[:4])), received_at=f"{y}-{m:02d}-{rnd.randint(1, top_day):02d}"))
        # card payments and moves
        s.append(S(a, "transfer_add", "ok", from_account_id=acc("Eurobank"), to_account_id=acc("Visa Gold"), amount=f"{round(rnd.uniform(100, 500), 2)}", transferred_at=f"{y}-{m:02d}-{min(top_day, 27):02d}", notes="card"))
        if rnd.random() < 0.6:
            s.append(S(a, "transfer_add", "ok", from_account_id=acc("Eurobank"), to_account_id=acc(rnd.choice(["Revolut", "Cash", "Amex"])), amount=f"{round(rnd.uniform(10, 200), 2)}", transferred_at=f"{y}-{m:02d}-{rnd.randint(1, top_day):02d}"))
        # edits and deletes of random earlier rows
        if rnd.random() < 0.7:
            s.append(S(a, "expense_edit", "ok", id=Ref_nth_expense(rnd.randint(0, 40)), notes="edited", amount=f"{-round(rnd.uniform(1, 99), 2)}", category_id=cat(rnd.choice(ecats)), account_id=acc(rnd.choice(accts)), spent_at=f"{y}-{m:02d}-{rnd.randint(1, top_day):02d}"))
        if rnd.random() < 0.5:
            s.append(S(a, "expense_delete", "ok", id=Ref_nth_expense(rnd.randint(0, 60))))
        if rnd.random() < 0.3:
            s.append(S(a, "transfer_delete", "ok", id=last("account_transfers")))
        # budget overrides now and then
        if rnd.random() < 0.35:
            s.append(S(a, "budget_override", "ok", month=f"{y}-{m:02d}", category_id=cat(rnd.choice(ecats)), amount=f"{rnd.randint(0, 400)}"))
        if (y, m) == (2025, 12):
            s.append(S(a, "budget_clear_month", "ok", month="2025-12"))
            s.append(S(a, "budget_override", "ok", month="2025-12", category_id=cat("Gifts"), amount="400"))
        # shared bills
        if rnd.random() < 0.5:
            n_shared += 1
            method = ["equal", "exact", "percent", "shares"][n_shared % 4]
            amount = round(rnd.uniform(10, 300), 2)
            payer = rnd.choice([self_person(), person("Babis"), person_of_user(a, b)])
            members = [self_person(), person("Babis"), person_of_user(a, b)]
            kw = {}
            if method == "equal":
                kw["included"] = members
            elif method == "exact":
                c1 = int(amount * 100) // 3
                kw["values"] = {members[0]: f"{c1 / 100:.2f}", members[1]: f"{c1 / 100:.2f}", members[2]: f"{(int(round(amount * 100)) - 2 * c1) / 100:.2f}"}
            elif method == "percent":
                kw["values"] = {members[0]: "50", members[1]: "30", members[2]: "20"}
            else:
                kw["values"] = {members[0]: "1", members[1]: "2", members[2]: "3"}
            rec = {}
            if rnd.random() < 0.6:
                rec = {"record_personal": "1", "category_id": cat("Holidays"), "account_id": acc("Eurobank")}
            s.append(S(a, "sexp_add", "any", group=group("Holiday"), description=f"bill {n_shared}", amount=f"{amount}", paid_by=payer, split_method=method,
                       spent_on=f"{y}-{m:02d}-{rnd.randint(1, top_day):02d}", **kw, **rec))
            if rnd.random() < 0.4:
                s.append(S(b, "sexp_record", "any", id=shared_expense(f"bill {n_shared}"), category_id=cat("Food"), account_id=acc("Main")))
        if rnd.random() < 0.25:
            s.append(S(a, "settle_add", "ok", group=group("Holiday"), from_person_id=person("Babis"), to_person_id=self_person(), amount=f"{rnd.randint(5, 60)}",
                       paid_on=f"{y}-{m:02d}-{rnd.randint(1, top_day):02d}", notes=f"settle {y}-{m}", record_personal="1", account_id=acc("Revolut")))
        # a page load per month posts due recurring entries (the clock is frozen,
        # so everything up to today posts at the first load already)
        if m in (1, 6):
            s.append(S(a, "load"))
        # bob does a bit too
        if rnd.random() < 0.4:
            s.append(S(b, "expense_add", "ok", notes="bob", amount=f"{-round(rnd.uniform(1, 50), 2)}", category_id=cat("Food"), account_id=acc("Main"), spent_at=f"{y}-{m:02d}-{rnd.randint(1, top_day):02d}"))
    s += [
        S(a, "recurring_edit", "ok", id=last("recurring_entries", where="notes='fuel'"), category_choice=_choice("e", "Transport"), amount="25", account_id=acc("Revolut"), indefinitely="1", interval_unit="month", interval_count="1", start_date="2025-09-05", notes="fuel monthly", enabled="1"),
        S(a, "load"),
        S(b, "load"),
    ]
    return s


def Ref_nth_expense(n):
    from actions import Ref

    return Ref(f"SELECT id FROM expenses WHERE user_id=:uid ORDER BY id DESC LIMIT 1 OFFSET {int(n)}", None, f"expense#-{n}")


def old_500_cases() -> list:
    """Inputs where the OLD route raised an unhandled IntegrityError (500) and,
    worse, left its write transaction open (docs/parity/A.md §6): every later
    write of that process then waits for the lock and fails. Each case runs in
    its own pair of fresh processes so the leak cannot poison other scenarios.
    The step after the faulty one is a plain valid write that shows the effect."""
    a = "alice"
    base = [S(a, "register", "ok", username=a, password=PW), S(a, "shared_view"), S(a, "load"),
            S(a, "account_add", "ok", name="Savings", opening_balance="10"),
            S(a, "account_add", "ok", name="Temp"), S(a, "category_add", "ok", name="Food"),
            S(a, "category_add", "ok", name="Fun"), S(a, "icat_add", "ok", name="Bonus")]
    follow = S(a, "category_add", "ok", name="AfterTheError", note="follow-up write after an old 500")
    return [
        ("account rename onto an existing name", base + [S(a, "account_edit", "reject", id=acc("Temp"), name="Savings", opening_balance="0"), follow]),
        ("category rename onto an existing name", base + [S(a, "category_edit", "reject", id=cat("Fun"), name="Food"), follow]),
        ("income category rename onto an existing name", base + [S(a, "icat_edit", "reject", id=icat("Bonus"), name="Salary"), follow]),
        ("delete an account that is still referenced", base + [
            S(a, "expense_add", "ok", notes="x", amount="-1", category_id=cat("Food"), account_id=acc("Savings"), spent_at="2026-11-01"),
            S(a, "account_delete", "reject", id=acc("Savings")), follow]),
    ]
