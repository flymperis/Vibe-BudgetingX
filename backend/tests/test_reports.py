"""Reports maths (old tests/test_reports.py). Only the pure chart-spec test is
ported so far; the rest are PENDING with the reports router."""

from vbx.core.finance import cash_flow_chart_spec


def test_chart_spec_handles_an_empty_year():
    spec = cash_flow_chart_spec([])
    assert spec["bars"] == []
    assert spec["net_points"] == ""
    assert spec["net_dots"] == []
