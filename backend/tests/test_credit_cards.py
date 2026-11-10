"""Credit cards (old tests/test_credit_cards.py). Only the pure statement-date
test is ported so far; the rest are PENDING with the accounts/transfers routers."""

from datetime import date

from vbx.core import finance


def test_statement_close_and_due_dates():
    # Closing day not reached yet this month -> last month's statement.
    assert finance.last_statement_close(date(2026, 3, 3), 5) == date(2026, 2, 5)
    assert finance.last_statement_close(date(2026, 3, 5), 5) == date(2026, 3, 5)
    # Day 31 closes on the last day of short months.
    assert finance.last_statement_close(date(2026, 2, 28), 31) == date(2026, 2, 28)
    assert finance.last_statement_close(date(2026, 2, 27), 31) == date(2026, 1, 31)
    # Due later the same month, or the next month when the due day comes first.
    assert finance.statement_due_date(date(2026, 3, 5), 25) == date(2026, 3, 25)
    assert finance.statement_due_date(date(2026, 3, 25), 25) == date(2026, 4, 25)
    assert finance.statement_due_date(date(2026, 1, 31), 15) == date(2026, 2, 15)
