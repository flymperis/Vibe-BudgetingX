"""Budgets (old tests/test_budget.py). Only the pure parse_amount test is
ported so far; the rest are PENDING with the budget router."""

from vbx.core import budget


def test_parse_amount_rejects_non_finite_and_over_ceiling():
    for junk in ("inf", "Infinity", "-inf", "1e999", "nan"):
        try:
            budget.parse_amount(junk)
            raise AssertionError(f"expected ValueError for {junk!r}")
        except ValueError:
            pass
    try:
        budget.parse_amount(str(budget.MAX_AMOUNT + 1))
        raise AssertionError("expected ValueError above MAX_AMOUNT")
    except ValueError:
        pass
    # Exactly at the ceiling is fine.
    assert budget.parse_amount(str(budget.MAX_AMOUNT)) == budget.MAX_AMOUNT
