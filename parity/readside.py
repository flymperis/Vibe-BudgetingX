"""Read-side comparison: what each app SHOWS for the same database state.

Old side, two independent extractions of the same page:
1. the exact values the dashboard passed to render_template (captured in the
   old process by launch_old.py, /__parity/context) - exact floats;
2. the rendered HTML, parsed back to numbers (money filter "1.527,08 €") for
   Home, Consolidated (summary) and Yearly - what the user actually sees.
Template-side arithmetic (budget panel totals, chart SVG geometry) is
recomputed here from the context with the template's own formulas.

New side: the JSON of the corresponding /api endpoint.

Numbers are compared exactly (==) against (1); against (2) after rounding the
new value to 2 decimals. Dict comparisons cover the keys both sides have; keys
that only one side has are listed in the coverage table, not silently passed.
"""

from __future__ import annotations

import html as _html
import re
from datetime import datetime

# ---------------------------------------------------------------------------
# generic deep compare


# screen -> field paths present on one side only (filled across a whole run,
# printed in the report's coverage section: those values were NOT compared)
ONLY_OLD: dict[str, set] = {}
ONLY_NEW: dict[str, set] = {}


class ReadCompare:
    def __init__(self, runner):
        self.r = runner
        self.only_old = ONLY_OLD
        self.only_new = ONLY_NEW

    def diff(self, where, path, a, b):
        if getattr(self.r, "redact", False):  # real-DB mode: no personal data
            a, b = (x if _num(x) or x is None or isinstance(x, bool) else f"<{type(x).__name__}>" for x in (a, b))
        self.r.add(where, "read", f"{path}: old={_short(a)} new={_short(b)}")

    def cmp(self, where, path, a, b, screen=None):
        screen = screen or path.split(".")[0].split("[")[0]
        if isinstance(a, dict) and isinstance(b, dict):
            for k in a.keys() - b.keys():
                self.only_old.setdefault(screen, set()).add(f"{_generic(path)}.{k}")
            for k in b.keys() - a.keys():
                self.only_new.setdefault(screen, set()).add(f"{_generic(path)}.{k}")
            for k in sorted(a.keys() & b.keys()):
                self.cmp(where, f"{path}.{k}", a[k], b[k], screen)
            return
        if isinstance(a, (list, tuple)) and isinstance(b, (list, tuple)):
            if len(a) != len(b):
                self.r.stats.read_comparisons += 1
                self.diff(where, f"{path} (length)", len(a), len(b))
            for i, (x, y) in enumerate(zip(a, b)):
                self.cmp(where, f"{path}[{i}]", x, y, screen)
            return
        self.r.stats.read_comparisons += 1
        if path.rsplit(".", 1)[-1] in TIMESTAMP_KEYS and _ts_close(a, b):
            return
        if _num(a) and _num(b):
            if float(a) != float(b):
                self.diff(where, path, a, b)
            return
        if a != b:
            self.diff(where, path, a, b)


TIMESTAMP_KEYS = {"created_at", "updated_at", "linked_at", "fetched_at", "sent_at"}


def _ts_close(a, b):
    """created_at & co. come from SQLite CURRENT_TIMESTAMP (real clock): the two
    apps insert the same row a moment apart. Same tolerance as dbdump."""
    from dbdump import TIMESTAMP_TOLERANCE_S, _ts

    if a is None or b is None:
        return a is None and b is None
    ta, tb = _ts(a), _ts(b)
    return bool(ta and tb and abs((ta - tb).total_seconds()) <= TIMESTAMP_TOLERANCE_S)


def _generic(path):
    return re.sub(r"\[\d+\]", "[]", path)


def _num(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def _short(v):
    s = repr(v)
    return s if len(s) < 160 else s[:157] + "..."


def txn_day(raw):
    """helpers.coerce_txn_day (the template's |txn_day filter), for list rows."""
    if raw is None:
        return ""
    text = str(raw).strip()
    if not text:
        return ""
    if len(text) >= 10 and text[4] == "-" and text[7] == "-":
        try:
            datetime.strptime(text[:10], "%Y-%m-%d")
            return text[:10]
        except ValueError:
            pass
    try:
        normalized = text.replace(" ", "T", 1)
        if len(normalized) == 10:
            normalized = f"{normalized}T00:00:00"
        return datetime.fromisoformat(normalized).date().isoformat()
    except ValueError:
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
            try:
                return datetime.strptime(text, fmt).date().isoformat()
            except ValueError:
                continue
    return text[:10] if len(text) >= 10 else ""


# ---------------------------------------------------------------------------
# HTML money parsing


def parse_money(text: str):
    """'1.527,08 €' / '-12,50 €' / '+3,00 €' / '$1.234,50' / '—' -> float or None."""
    t = _html.unescape(re.sub(r"<[^>]+>", "", text)).strip()
    if t in ("—", "-", ""):
        return None
    m = re.search(r"([+-]?)\$?\s*([\d.]+,\d{2})", t)
    if not m:
        raise ValueError(f"not a money value: {t!r}")
    v = float(m.group(2).replace(".", "").replace(",", "."))
    return -v if m.group(1) == "-" else v


def _section(html, panel):
    m = re.search(rf'<section[^>]*id="panel-{panel}"[^>]*>(.*?)</section>', html, re.S)
    return m.group(1) if m else ""


def html_home(html):
    s = _section(html, "home")
    out = {}
    m = re.search(r'home-summary-hero-amount[^"]*">(.*?)</strong>', s, re.S)
    out["net"] = parse_money(m.group(1)) if m else "MISSING"
    m = re.search(r"home-summary-pill-income\">Income <b>(.*?)</b>", s, re.S)
    out["total_income"] = parse_money(m.group(1)) if m else "MISSING"
    m = re.search(r"home-summary-pill-expense\">Expenses <b>(.*?)</b>", s, re.S)
    out["total_expenses"] = parse_money(m.group(1)) if m else "MISSING"
    rows = []
    for li in re.finditer(r'<li class="home-balances-row([^"]*)">(.*?)</li>', s, re.S):
        cls, body = li.group(1), li.group(2)
        name = re.search(r'home-balances-name">(.*?)</span>', body, re.S)
        amt = re.search(r'home-balances-amount-pill[^"]*">(.*?)</span>', body, re.S)
        if not name or not amt:
            continue
        rows.append({"kind": cls.strip(), "name": _html.unescape(name.group(1)).strip(), "amount": parse_money(amt.group(1))})
        meta = re.search(r'home-card-meta">(.*?) available of (.*?)</p>', body, re.S)
        if meta:
            rows[-1]["available"] = parse_money(meta.group(1))
            rows[-1]["limit"] = parse_money(meta.group(2))
    out["balances"] = rows
    return out


def html_yearly(html):
    s = _section(html, "yearly")
    rows = []
    for tr in re.finditer(r"<tr[^>]*>\s*<th scope=\"row\">(.*?)</th>(.*?)</tr>", s, re.S):
        cells = re.findall(r"<td[^>]*>(.*?)</td>", tr.group(2), re.S)
        rows.append([tr.group(1).strip()] + [parse_money(c) for c in cells])
    return rows


def html_summary(html):
    s = _section(html, "summary")
    cards = [parse_money(x) for x in re.findall(r'<div class="card[^"]*">\s*<p>[^<]*</p>\s*<strong>(.*?)</strong>', s, re.S)]
    cols = re.findall(r'<div class="consolidated-column">(.*?)</table>', s, re.S)
    tables = []
    for c in cols:
        rows = []
        for tr in re.findall(r"<tr>\s*(<td>.*?)</tr>", c, re.S):
            tds = re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)
            if len(tds) >= 2 and "colspan" not in tr:
                rows.append([_html.unescape(tds[0]).strip()] + [parse_money(x) for x in tds[1:]])
        tables.append(rows)
    return {"cards": cards, "tables": tables}


def r2(x):
    return None if x is None else round(float(x) + 0.0, 2)


# ---------------------------------------------------------------------------
# chart geometry (old SVG specs) recomputed from the new series + range


def balance_spec_from_new(chart, old_spec):
    pts = chart["points"]
    if not pts:
        return {"dots": [], "points": "", "y_ticks": []}
    ml, mt, pw, ph = old_spec["plot_ml"], old_spec["plot_mt"], old_spec["plot_pw"], old_spec["plot_ph"]
    y_min, y_max, y_mid = chart["y_min"], chart["y_max"], chart["y_mid"]
    y_rng = y_max - y_min or 1.0
    n = len(pts)
    dots, xs = [], []
    for i, p in enumerate(pts):
        v, ch = float(p["value"]), float(p["change"])
        x = ml + (i / (n - 1)) * pw if n > 1 else ml + pw / 2
        yi = mt + ph - ((v - y_min) / y_rng) * ph
        xs.append(f"{x:.1f},{yi:.1f}")
        dots.append({"cx": round(x, 1), "cy": round(yi, 1), "lx": round(x, 1), "short": p["month_label"][:3], "title": f"{p['month_label']}: {v:.2f} (Δ {ch:+.2f})"})
    ticks = [
        {"x": 4, "y": mt + 8, "text": f"{y_max:.2f}"},
        {"x": 4, "y": mt + ph / 2, "text": f"{y_mid:.2f}"},
        {"x": 4, "y": mt + ph - 4, "text": f"{y_min:.2f}"},
    ]
    return {"dots": dots, "points": " ".join(xs), "y_ticks": ticks}


def cash_spec_from_new(chart, old_spec):
    if not chart["has_data"]:
        return {"bars": [], "net_dots": [], "y_ticks": [], "net_points": ""}
    ml, mt, pw, ph = old_spec["plot_ml"], old_spec["plot_mt"], old_spec["plot_pw"], old_spec["plot_ph"]
    y_min, y_max = chart["y_min"], chart["y_max"]
    y_rng = y_max - y_min

    def y_of(v):
        return mt + ph - ((v - y_min) / y_rng) * ph

    zero_y = y_of(0.0)
    slot = pw / 12.0
    bar_w = min(slot * 0.32, 18.0)
    gap = 2.0
    bars, dots, pts = [], [], []
    for i, m in enumerate(chart["months"]):
        centre = ml + slot * (i + 0.5)
        inc, exp, net = m["income"], m["expenses"], m["net"]
        if inc:
            top = y_of(inc)
            bars.append({"x": round(centre - bar_w - gap / 2, 1), "y": round(min(top, zero_y), 1), "w": round(bar_w, 1), "h": round(abs(zero_y - top), 1), "kind": "income", "title": f"{m['label']} income: {inc:,.2f}"})
        if exp:
            bottom = y_of(exp)
            bars.append({"x": round(centre + gap / 2, 1), "y": round(min(bottom, zero_y), 1), "w": round(bar_w, 1), "h": round(abs(bottom - zero_y), 1), "kind": "expense", "title": f"{m['label']} spending: {exp:,.2f}"})
        if m["has_net_point"]:
            ny = y_of(net)
            pts.append(f"{centre:.1f},{ny:.1f}")
            dots.append({"cx": round(centre, 1), "cy": round(ny, 1), "title": f"{m['label']} net: {net:+,.2f}"})
    ticks = [
        {"x": 4, "y": round(mt + 8, 1), "text": f"{y_max:,.0f}"},
        {"x": 4, "y": round(zero_y, 1), "text": "0"},
        {"x": 4, "y": round(mt + ph - 4, 1), "text": f"{y_min:,.0f}"},
    ]
    return {"bars": bars, "net_dots": dots, "y_ticks": ticks, "net_points": " ".join(pts)}


def _pick(spec, keys):
    return {k: spec.get(k) for k in keys}


# ---------------------------------------------------------------------------
# screens


def _balances_block(ctx):
    cards = ctx.get("card_status_by_id") or {}
    return [
        {
            "id": a["id"],
            "name": a["name"],
            "account_type": a.get("account_type") or "bank",
            "current_balance": a["current_balance"],
            "card": cards.get(str(a["id"])),
        }
        for a in ctx["account_balances"]
    ]


def _new_balances(accounts):
    return [{"id": a["id"], "name": a["name"], "account_type": a["account_type"], "current_balance": a["current_balance"], "card": a.get("card")} for a in accounts]


def _budget_card(ctx):
    bs = ctx.get("budget_summary")
    if not ctx.get("budget_enabled") or not bs or not (bs.get("rows") or bs.get("other")):
        return None
    return {
        "total_spent": bs["total_spent"], "total_budget": bs["total_budget"], "total_remaining": bs["total_remaining"],
        "total_pct": bs["total_pct"], "total_status": bs["total_status"], "over": [o["name"] for o in bs.get("over") or []],
    }


def compare_home(rc: ReadCompare, where, ctx, html, new):
    old = {
        "total_income": ctx["total_income"], "total_expenses": ctx["total_expenses"], "net": ctx["net_balance"],
        "cash_total": ctx["accounts_cash_total"], "cards_total": ctx["accounts_cards_total"], "net_total": ctx["accounts_total_balance"],
        "accounts": _balances_block(ctx), "budget_enabled": ctx["budget_enabled"], "budget_card": _budget_card(ctx),
        "balance_scope": "today" if "through today" in ctx["balance_scope_hint"] else "month_end",
        "has_cards": bool(ctx["account_balances"]) and bool(ctx.get("card_status_by_id")),
    }
    nb = dict(new)
    nb["accounts"] = _new_balances(new["accounts"])
    rc.cmp(where, "home", old, {k: nb[k] for k in old})
    # what the page shows
    h = html_home(html)
    rc.r.stats.screens_html = getattr(rc.r.stats, "screens_html", 0)
    for k in ("net", "total_income", "total_expenses"):
        rc.r.stats.html_values += 1
        if h[k] != r2(new[k]):
            rc.r.add(where, "read-html", f"home HTML {k}: page shows {h[k]} new={new[k]}")
    accts = [r for r in h["balances"] if not r["kind"] or "home-balances-card" in r["kind"]]
    if len(accts) != len(new["accounts"]):
        rc.r.add(where, "read-html", f"home HTML account rows: page {len(accts)} new {len(new['accounts'])}")
    for row, na in zip(accts, new["accounts"]):
        rc.r.stats.html_values += 1
        if row["name"] != na["name"] or row["amount"] != r2(na["current_balance"]):
            rc.r.add(where, "read-html", f"home HTML account {na['id']}: page shows {row['amount']} new={na['current_balance']}")
        if "limit" in row and na.get("card"):
            rc.r.stats.html_values += 2
            if row["limit"] != r2(na["card"]["limit"]) or row["available"] != r2(na["card"]["available"]):
                rc.r.add(where, "read-html", f"home HTML card {na['id']}: page {row['available']}/{row['limit']} new {na['card']['available']}/{na['card']['limit']}")
    totals = {r["name"]: r["amount"] for r in h["balances"] if "subtotal" in r["kind"] or "total" in r["kind"]}
    exp = {"Cash & bank": new["cash_total"], "Credit cards": new["cards_total"], "Net (all accounts)": new["net_total"], "Total (all accounts)": new["net_total"]}
    for name, v in totals.items():
        rc.r.stats.html_values += 1
        if name in exp and v != r2(exp[name]):
            rc.r.add(where, "read-html", f"home HTML {name}: page {v} new {exp[name]}")


def compare_summary(rc, where, ctx, html, new):
    old = {
        "total_income": ctx["total_income"], "total_expenses": ctx["total_expenses"], "net": ctx["net_balance"],
        "net_total": ctx["accounts_total_balance"],
        "income_breakdown": ctx["income_breakdown"], "expense_breakdown": ctx["expense_breakdown"],
        "budget_enabled": ctx["budget_enabled"], "budget": ctx["budget_summary"],
        "accounts": [{"id": a["id"], "name": a["name"], "current_balance": a["current_balance"]} for a in ctx["account_balances"]],
    }
    nb = dict(new)
    nb["accounts"] = [{"id": a["id"], "name": a["name"], "current_balance": a["current_balance"]} for a in new["accounts"]]
    rc.cmp(where, "summary", old, {k: nb.get(k) for k in old})
    h = html_summary(html)
    expect_cards = [r2(new["total_income"]), r2(new["total_expenses"]), r2(new["net_total"])]
    rc.r.stats.html_values += 3
    if h["cards"] != expect_cards:
        rc.r.add(where, "read-html", f"summary HTML cards: page {h['cards']} new {expect_cards}")
    if len(h["tables"]) == 3:
        inc = [[r["category_name"], r2(r["total_amount"])] for r in new["income_breakdown"]]
        rc.r.stats.html_values += len(inc)
        if h["tables"][0] != inc:
            rc.r.add(where, "read-html", f"summary HTML income table: page {h['tables'][0]} new {inc}")
        if new["budget"] is None:
            exp = [[r["category_name"], r2(r["total_amount"])] for r in new["expense_breakdown"]]
        else:
            b = new["budget"]
            exp = [[r["name"], r2(r["spent"]), r2(r["budget"]), r2(r["remaining"])] for r in b["rows"]]
            exp += [[r["name"], r2(r["spent"]), None, None] for r in b["unbudgeted"]]
            if b.get("other"):
                o = b["other"]
                exp.append([o["name"], r2(o["spent"]), r2(o["budget"]), r2(o["remaining"])])
        rc.r.stats.html_values += len(exp)
        if h["tables"][1] != exp:
            rc.r.add(where, "read-html", f"summary HTML expenses table: page {h['tables'][1]} new {exp}")
        bal = [[a["name"], r2(a["current_balance"])] for a in new["accounts"]]
        rc.r.stats.html_values += len(bal)
        if h["tables"][2] != bal:
            rc.r.add(where, "read-html", f"summary HTML balances: page {h['tables'][2]} new {bal}")
    else:
        rc.r.add(where, "read-html", f"summary HTML: expected 3 tables, parsed {len(h['tables'])} (parser)")


def compare_yearly(rc, where, ctx, html, new):
    old = {
        "year": ctx["year_filter"],
        "rows": [{"income": r["income"], "expenses": r["expenses"], "delta": r["delta"], "total_balance": r["total_balance"]} for r in ctx["yearly_rows"]],
        "total_income": ctx["yearly_total_income"], "total_expenses": ctx["yearly_total_expenses"], "total_delta": ctx["yearly_total_delta"],
    }
    nn = dict(new)
    nn["rows"] = [{k: r[k] for k in ("income", "expenses", "delta", "total_balance")} for r in new["rows"]]
    rc.cmp(where, "yearly", old, {k: nn[k] for k in old})
    rows = html_yearly(html)
    expect = [[None, r2(r["income"]), r2(r["expenses"]), r2(r["delta"]), r2(r["total_balance"])] for r in new["rows"]]
    expect.append([None, r2(new["total_income"]), r2(new["total_expenses"]), r2(new["total_delta"]), None])
    got = [[None] + r[1:] for r in rows]
    rc.r.stats.html_values += 4 * len(expect)
    if got != expect:
        bad = [i for i, (x, y) in enumerate(zip(got, expect)) if x != y]
        rc.r.add(where, "read-html", f"yearly HTML rows {bad or 'count'}: page {[got[i] for i in bad[:3]] if bad else len(got)} new {[expect[i] for i in bad[:3]] if bad else len(expect)}")


def compare_budget(rc, where, ctx, new):
    enabled = ctx["budget_enabled"]
    old = {"enabled": enabled, "summary": ctx["budget_summary"], "form_rows": ctx["budget_form_rows"], "other_amount": ctx["budget_other_amount"], "month_snapshots": ctx["budget_month_snapshots"]}
    if enabled:
        rows = ctx["budget_form_rows"]
        with_default = [r for r in rows if r["default"] is not None]
        old["defaults_total"] = sum(r["default"] for r in with_default) + (ctx["budget_other_amount"] or 0)
        old["has_any_default"] = len(with_default) > 0
        bs = ctx["budget_summary"]
        old["can_clear_month"] = (not bs["cleared"]) or bool(bs["rows"])
        old["cleared_total_spent"] = (bs["total_spent"] + sum(u["spent"] for u in bs["unbudgeted"])) if (bs["cleared"] and not bs["rows"]) else None
    rc.cmp(where, "budget", old, {k: new.get(k) for k in old})


def compare_list(rc, where, ctx, new, kind):
    p = "expense" if kind == "expenses" else "income"
    date_key = "spent_at" if kind == "expenses" else "received_at"
    rows = ctx["expenses" if kind == "expenses" else "income_entries"]
    old = {
        "items": [dict(r, **{date_key: txn_day(r[date_key])}) for r in rows],
        "total": ctx[f"{p}_total"], "pages": ctx[f"{p}_num_pages"], "page": ctx[f"{p}_page"],
        "month": ctx[f"{p}_filter_month"], "category_id": ctx[f"{p}_filter_category_id"], "page_size": ctx["list_page_size"],
    }
    rc.cmp(where, kind, old, {k: new[k] for k in old})


def compare_recurring(rc, where, ctx, new):
    rc.cmp(where, "recurring", {"items": ctx["recurring_entries"]}, {"items": new["items"]})


def compare_transfers(rc, where, ctx, new):
    amt = ctx["transfer_amount_default"]
    old = {
        "items": ctx["account_transfers"], "limit": ctx["transfer_log_limit"],
        "defaults": {"from_account_id": ctx["transfer_from_id"], "to_account_id": ctx["transfer_to_id"], "amount": None if amt is None else float(amt), "transferred_at": ctx["transfer_default_date"]},
    }
    nn = dict(new)
    nd = dict(new["defaults"])
    if nd.get("amount") is not None:
        nd["amount"] = float(f"{nd['amount']:.2f}")
    nn["defaults"] = nd
    rc.cmp(where, "transfers", old, {k: nn[k] for k in old})


def compare_accounts(rc, where, ctx, new):
    bal = ctx["account_balance_by_id"]
    cards = ctx.get("card_status_by_id") or {}
    old = {
        "items": [
            {"id": a["id"], "name": a["name"], "account_type": a["account_type"], "opening_balance": a["opening_balance"], "credit_limit": a["credit_limit"],
             "statement_day": a["statement_day"], "due_day": a["due_day"], "current_balance": bal.get(str(a["id"])), "card": cards.get(str(a["id"]))}
            for a in ctx["accounts"]
        ],
        "totals": {"cash_total": ctx["accounts_cash_total"], "cards_total": ctx["accounts_cards_total"], "net_total": ctx["accounts_total_balance"]},
    }
    rc.cmp(where, "accounts", old, {k: new[k] for k in old})


def compare_categories(rc, where, ctx, new_exp, new_inc):
    rc.cmp(where, "categories", {"expense": ctx["categories"], "income": ctx["income_categories"]},
           {"expense": [{"id": c["id"], "name": c["name"]} for c in new_exp["items"]], "income": [{"id": c["id"], "name": c["name"]} for c in new_inc["items"]]})


def compare_shared(rc, where, ctx, new):
    sd = dict(ctx["shared_data"])
    sd.pop("selected", None)
    sd["split_methods"] = [{"key": k, "label": label} for k, label in sd["split_methods"]]
    rc.cmp(where, "shared", sd, new)


def compare_group(rc, where, ctx, new):
    sel = ctx["shared_data"]["selected"]
    rc.r.stats.read_comparisons += 1
    if sel is None and new is None:  # e.g. an invitation not yet accepted: neither app opens it
        return
    if sel is None:
        rc.r.add(where, "read", f"shared group: old shows no group, new returned {'404' if new is None else 'a group'}")
        return
    if new is None:
        rc.r.add(where, "read", "shared group: old shows the group, new 404")
        return
    rc.cmp(where, "shared_group", sel, new)


def compare_investments(rc, where, ctx, new):
    for cls, key in (("crypto", "crypto"), ("stock", "stocks")):
        old = {
            "holdings": ctx[f"{cls}_holdings"], "total_value": ctx[f"{cls}_total_value"], "total_invested": ctx[f"{cls}_total_invested"],
            "total_pnl": ctx[f"{cls}_total_pnl"], "total_pnl_pct": ctx[f"{cls}_total_pnl_pct"], "prices_loaded": ctx[f"{cls}_prices_loaded"],
            "transactions": ctx[f"{cls}_transactions"],
        }
        rc.cmp(where, f"investments.{key}", old, {k: new[key].get(k) for k in old})
    rc.cmp(where, "investments", {"finnhub_configured": ctx["finnhub_configured"]}, {"finnhub_configured": new["finnhub_configured"]})


def compare_reports_overview(rc, where, ctx, new):
    old = {
        "cash_flow": ctx["reports_cash_flow"], "bank_balance": ctx["report_live_balance"], "account_id": ctx["report_account_id"],
        "account_label": ctx["report_account_label"], "crypto_value": ctx["reports_crypto_value"], "stock_value": ctx["reports_stock_value"],
        "year": ctx["report_year"], "current_year": ctx["report_current_year"],
    }
    rc.cmp(where, "reports.overview", old, {k: new[k] for k in old})
    keys = ["dots", "points", "y_ticks"]
    rc.cmp(where, "reports.overview.bank_chart(svg)", _pick(ctx["report_chart_spec"], keys), balance_spec_from_new(new["bank_chart"], ctx["report_chart_spec"]))
    rc.cmp(where, "reports.overview.cash_flow_chart(svg)", _pick(ctx["reports_cash_flow_spec"], ["bars", "net_dots", "y_ticks", "net_points"]), cash_spec_from_new(new["cash_flow_chart"], ctx["reports_cash_flow_spec"]))


def compare_reports_spending(rc, where, ctx, new):
    rc.cmp(where, "reports.spending", {"categories": ctx["reports_categories"], "expense_pivot": ctx["reports_expenses_table"]}, {"categories": new["categories"], "expense_pivot": new["expense_pivot"]})


def compare_reports_tags(rc, where, ctx, new):
    rc.cmp(where, "reports.tags", {"tags": ctx["reports_tags"], "tag": ctx["reports_tag"]}, {"tags": new["tags"], "tag": new["tag"]})


def compare_reports_investments(rc, where, ctx, new):
    rc.cmp(where, "reports.investments", {"crypto_value": ctx["reports_crypto_value"], "stock_value": ctx["reports_stock_value"]}, {"crypto_value": new["crypto_value"], "stock_value": new["stock_value"]})
    for k in ("crypto", "stock"):
        spec = ctx[f"{k}_chart_spec"]
        rc.cmp(where, f"reports.investments.{k}_chart(svg)", _pick(spec, ["dots", "points", "y_ticks"]), balance_spec_from_new(new[f"{k}_chart"], spec))


def compare_bootstrap(rc, where, ctx, new):
    old = {
        "categories": ctx["categories"], "income_categories": ctx["income_categories"], "tag_names": ctx["all_tag_names"], "recent_tags": ctx["recent_tags"],
        "budget_enabled": ctx["budget_enabled"], "accounts": _balances_block(ctx),
        "balance_totals": {"cash_total": ctx["accounts_cash_total"], "cards_total": ctx["accounts_cards_total"], "net_total": ctx["accounts_total_balance"]},
    }
    nn = dict(new)
    nn["accounts"] = _new_balances(new["accounts"])
    rc.cmp(where, "bootstrap", old, {k: nn[k] for k in old})


def compare_integrations(rc, where, ctx, new):
    ui = ctx["user_integrations"]
    link = ctx["telegram_link"]
    code = ctx["telegram_link_code"]
    old = {
        "ai": {k: ui[k] for k in ("ai_enabled", "ai_provider", "ai_base_url", "ai_model", "ai_timeout", "ai_ocr_model") if k in ui},
        "telegram": {
            "enabled": ctx["telegram_enabled"], "bot_token_set": ctx["telegram_server"]["bot_token_set"], "bot_username": ctx["telegram_bot_username"],
            "linked": link is not None, "notify_prefs": ctx["telegram_notify_prefs"],
            "link": None if link is None else {"telegram_username": link["telegram_username"], "default_account_id": link["default_account_id"], "default_account_name": link["default_account_name"]},
            "link_code": None if code is None else {"expires_at": code["expires_at"]},
            "notify_kinds": [{"kind": k, "label": v} for k, v in (ctx["telegram_notify_kinds"].items() if isinstance(ctx["telegram_notify_kinds"], dict) else [])],
        },
    }
    nt = dict(new["telegram"])
    if nt.get("link"):
        nt["link"] = {k: nt["link"].get(k) for k in ("telegram_username", "default_account_id", "default_account_name")}
    if nt.get("link_code"):
        nt["link_code"] = {"expires_at": nt["link_code"]["expires_at"]}
    if not old["telegram"]["notify_kinds"]:
        old["telegram"].pop("notify_kinds")
    rc.cmp(where, "integrations", old, {"ai": {k: new["ai"].get(k) for k in old["ai"]}, "telegram": {k: nt.get(k) for k in old["telegram"]}})
