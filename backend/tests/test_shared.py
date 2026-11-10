"""Shared expenses (old tests/test_shared.py). Only the pure split/debt maths is
ported so far; the rest are PENDING with the shared router."""

import pytest

from vbx.core import shared


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
