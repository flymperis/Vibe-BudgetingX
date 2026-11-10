"""Recurring schedule maths (old tests/test_recurring_intervals.py).

Only the pure recurring_occurrences tests are ported so far; the tests that
post through the app are PENDING with the recurring router."""

from datetime import date

from vbx.core.finance import recurring_occurrences


def test_weekly_occurrences_step_by_whole_weeks():
    start = date(2026, 1, 5)
    got = list(recurring_occurrences("week", 2, start, 5, date(2026, 2, 3)))
    assert got == [
        (date(2026, 1, 5), "2026-01-05"),
        (date(2026, 1, 19), "2026-01-19"),
        (date(2026, 2, 2), "2026-02-02"),
    ]


def test_monthly_occurrences_clamp_to_short_months():
    got = list(recurring_occurrences("month", 1, date(2026, 1, 31), 31, date(2026, 4, 30)))
    assert [d.isoformat() for d, _ in got] == ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]
    assert [k for _, k in got] == ["2026-01", "2026-02", "2026-03", "2026-04"]


def test_every_three_months_and_times_cap():
    got = list(recurring_occurrences("month", 3, date(2026, 11, 15), 15, date(2028, 1, 1), times=3))
    assert [d.isoformat() for d, _ in got] == ["2026-11-15", "2027-02-15", "2027-05-15"]


def test_yearly_on_leap_day_falls_back_to_feb_28():
    got = list(recurring_occurrences("year", 1, date(2024, 2, 29), 29, date(2028, 3, 1)))
    assert [d.isoformat() for d, _ in got] == ["2024-02-29", "2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]
