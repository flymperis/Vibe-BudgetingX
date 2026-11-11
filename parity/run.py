"""Parity harness: drive the old and the new app through the same scenarios and
compare databases, responses and what each app shows.

    backend\\.venv\\Scripts\\python -B parity\\run.py            # modes a, b, c (+ d if VBX_PARITY_REAL_DB is set)
    backend\\.venv\\Scripts\\python -B parity\\run.py --quick    # skip the long random scenario and mode c

Writes parity/out/report.md and parity/out/findings.json. Exit code 1 when an
undocumented difference was found.
"""

from __future__ import annotations

import argparse
import io
import json
import os
import sys
import time
import traceback

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True

import actions as A  # noqa: E402
import readside as R  # noqa: E402
import scenarios as SC  # noqa: E402
from allowlist import AllowList  # noqa: E402
from engine import OUT, Pair, Runner, Stats, copy_db  # noqa: E402
from servers import parity_now  # noqa: E402

MONTHS_SMALL = ["2025-12", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"]
YEARS_SMALL = [2025, 2026]
MONTHS_RICH = ["2025-03", "2025-06", "2025-12", "2026-01", "2026-02", "2026-05", "2026-09", "2026-10", "2026-11", "2026-12"]
YEARS_RICH = [2024, 2025, 2026]


# ---------------------------------------------------------------------------
# read side driver


def _screen(runner, rc, where, fn, *args):
    runner.stats.read_screens += 1
    try:
        fn(rc, where, *args)
    except Exception as exc:  # a crash in a comparison is a harness problem, reported
        runner.add(where, "error", f"comparison crashed: {type(exc).__name__}: {exc}\n{traceback.format_exc(limit=3)}")


def _side_ids(runner, ref):
    return {s.kind: ref.resolve(s.db_path, None) for s in runner.pair.sides()}


def read_side(runner: Runner, user: str, months, years, deep=True):
    pair = runner.pair
    oc, nc = pair.old.client(user), pair.new.client(user)
    rc = R.ReadCompare(runner)
    tag = f"[{user}]"
    if getattr(runner, "redact", False):
        _names = {}

        def L(x):  # real-DB mode: never print names, tags or labels
            return _names.setdefault(x, f"<name#{len(_names) + 1}>")
    else:
        def L(x):
            return x

    def both(params, path, qs=None):
        nj = nc.get_json(path, qs)
        html, ctx = oc.page(params)
        return html, ctx, nj

    # bootstrap (new posts recurring here; old on every page load)
    html, ctx, nj = both({}, "/api/bootstrap")
    _screen(runner, rc, f"read bootstrap {tag}", R.compare_bootstrap, ctx, nj)

    cats = [c["name"] for c in ctx["categories"]]
    icats = [c["name"] for c in ctx["income_categories"]]
    group_names = [g["name"] for g in ctx["shared_data"]["groups"]]
    tags = [t["tag"] for t in ctx["reports_tags"]][:6] + ["nosuchtag"]
    cards = [a["name"] for a in ctx["accounts"] if a.get("account_type") == "credit"]

    for m in months:
        html, ctx, nj = both({"panel": "home", "month": m}, "/api/home", {"month": m})
        _screen(runner, rc, f"read home {m} {tag}", R.compare_home, ctx, html, nj)
        _screen(runner, rc, f"read summary {m} {tag}", R.compare_summary, ctx, html, nc.get_json("/api/summary", {"month": m}))
        _screen(runner, rc, f"read budget {m} {tag}", R.compare_budget, ctx, nc.get_json("/api/budget", {"month": m}))
        _screen(runner, rc, f"read accounts {m} {tag}", R.compare_accounts, ctx, nc.get_json("/api/accounts", {"month": m}))
    _screen(runner, rc, f"read categories {tag}", R.compare_categories, ctx, nc.get_json("/api/categories"), nc.get_json("/api/income-categories"))
    _screen(runner, rc, f"read recurring {tag}", R.compare_recurring, ctx, nc.get_json("/api/recurring"))
    _screen(runner, rc, f"read transfers {tag}", R.compare_transfers, ctx, nc.get_json("/api/transfers"))
    _screen(runner, rc, f"read shared {tag}", R.compare_shared, ctx, nc.get_json("/api/shared"))

    for card in cards:
        ids = _side_ids(runner, A.acc(card, user=user))
        html, ctx = oc.page({"panel": "transfer", "pay_card": ids["old"]})
        _screen(runner, rc, f"read transfers pay_card={L(card)} {tag}", R.compare_transfers, ctx, nc.get_json("/api/transfers", {"pay_card": ids["new"]}))

    for y in years:
        html, ctx, nj = both({"panel": "yearly", "year": y}, "/api/yearly", {"year": y})
        _screen(runner, rc, f"read yearly {y} {tag}", R.compare_yearly, ctx, html, nj)
        html, ctx = oc.page({"panel": "reports", "report_year": y})
        _screen(runner, rc, f"read reports.overview {y} {tag}", R.compare_reports_overview, ctx, nc.get_json("/api/reports/overview", {"year": y}))
        _screen(runner, rc, f"read reports.spending {y} {tag}", R.compare_reports_spending, ctx, nc.get_json("/api/reports/spending", {"year": y}))
        _screen(runner, rc, f"read reports.investments {y} {tag}", R.compare_reports_investments, ctx, nc.get_json("/api/reports/investments", {"year": y}))
        if deep:
            for acct in [a["name"] for a in ctx["accounts"]][:3]:
                ids = _side_ids(runner, A.acc(acct, user=user))
                html, ctx2 = oc.page({"panel": "reports", "report_year": y, "report_account": ids["old"]})
                _screen(runner, rc, f"read reports.overview {y} account={L(acct)} {tag}", R.compare_reports_overview, ctx2, nc.get_json("/api/reports/overview", {"year": y, "account": ids["new"]}))

    for t in tags:
        html, ctx = oc.page({"panel": "home", "tag": t})
        _screen(runner, rc, f"read reports.tags tag={L(t)} {tag}", R.compare_reports_tags, ctx, nc.get_json("/api/reports/tags", {"tag": t}))

    # expense / income lists: month x category x page
    for kind, cnames, newpath, pre in (("expenses", cats, "/api/expenses", "exp"), ("income", icats, "/api/income", "inc")):
        mf = [None] + months[:3] + ["2031-01", "garbage"]
        for month in mf:
            for cname in [None] + cnames[:2] + ["__foreign__"]:
                for page in ([1, 2, 99] if month is None and cname is None else [1]):
                    op, np = {"panel": kind}, {}
                    if month:
                        op[f"{pre}_month"] = month
                        np["month"] = month
                    if cname == "__foreign__":
                        op[f"{pre}_category"] = "999999"
                        np["category_id"] = "999999"
                    elif cname:
                        ref = A.cat(cname, user=user) if kind == "expenses" else A.icat(cname, user=user)
                        ids = _side_ids(runner, ref)
                        op[f"{pre}_category"], np["category_id"] = ids["old"], ids["new"]
                    if page != 1:
                        op[f"{pre}_page"] = page
                        np["page"] = page
                    html, ctx = oc.page(op)
                    _screen(runner, rc, f"read {kind} list {np} {tag}", R.compare_list, ctx, nc.get_json(newpath, np), kind)

    for gname in group_names:
        ids = _side_ids(runner, A.group(gname, user=user))
        html, ctx = oc.page({"panel": "shared", "group": ids["old"]})
        r = nc.get(f"/api/shared/groups/{ids['new']}")
        _screen(runner, rc, f"read shared group {L(gname)!r} {tag}", R.compare_group, ctx, r.json() if r.status_code == 200 else None)

    html, ctx = oc.page({"panel": "investments"})
    _screen(runner, rc, f"read investments {tag}", R.compare_investments, ctx, nc.get_json("/api/investments"))
    html, ctx = oc.page({"panel": "settings", "settings_section": "integrations"})
    _screen(runner, rc, f"read settings.integrations {tag}", R.compare_integrations, ctx, nc.get_json("/api/settings/integrations"))
    return rc


# ---------------------------------------------------------------------------
# Excel


def _wb_cells(data: bytes):
    from openpyxl import load_workbook

    wb = load_workbook(io.BytesIO(data))
    return {ws.title: [[c.value for c in row] for row in ws.iter_rows()] for ws in wb.worksheets}


def compare_workbooks(runner, where, a: bytes, b: bytes):
    wa, wb = _wb_cells(a), _wb_cells(b)
    if list(wa) != list(wb):
        runner.add(where, "export", f"sheet names/order: old={list(wa)} new={list(wb)}")
    n = 0
    for sheet in wa.keys() & wb.keys():
        ra, rb = wa[sheet], wb[sheet]
        header = [str(h).strip().lower() if h is not None else "" for h in (ra[0] if ra else [])]
        if len(ra) != len(rb):
            runner.add(where, "export", f"{sheet}: row count old={len(ra)} new={len(rb)}")
        for i, (x, y) in enumerate(zip(ra, rb)):
            for j in range(max(len(x), len(y))):
                n += 1
                p = x[j] if j < len(x) else None
                q = y[j] if j < len(y) else None
                col = header[j] if j < len(header) else ""
                if i > 0 and col in R.TIMESTAMP_KEYS and R._ts_close(p, q):
                    continue  # SQLite CURRENT_TIMESTAMP, real clock (see dbdump.TIMESTAMP_COLUMNS)
                if p != q or type(p) is not type(q):
                    runner.add(where, "export", f"{sheet}!R{i + 1}C{j + 1}: old={p!r} new={q!r}")
    runner.stats.read_comparisons += n
    return n


def excel_round_trip(runner: Runner, user: str):
    pair = runner.pair
    oc, nc = pair.old.client(user), pair.new.client(user)
    ro, rn = oc.get("/export/excel"), nc.get("/api/export/excel")
    runner.stats.read_screens += 1
    if ro.status_code != 200 or rn.status_code != 200:
        runner.add("excel export", "export", f"status old={ro.status_code} new={rn.status_code}")
        return
    compare_workbooks(runner, f"excel export [{user}] (cell values; workbook metadata ignored)", ro.content, rn.content)
    hdr_o = ro.headers.get("content-disposition", "")
    hdr_n = rn.headers.get("content-disposition", "")
    if hdr_o.replace('"', "") != hdr_n.replace('"', ""):
        runner.add(f"excel export [{user}]", "response-text", f"Content-Disposition old={hdr_o!r} new={hdr_n!r}")
    to, tn = oc.get("/export/migration-template"), nc.get("/api/export/migration-template")
    runner.stats.read_screens += 1
    compare_workbooks(runner, "migration template", to.content, tn.content)
    wb = ro.content
    steps = [
        A.S("carol", "register", "ok", username="carol", password=SC.PW),
        A.S("carol", "import_excel", "ok", workbook=wb, filename="old-export.xlsx", checkpoint=True),
        A.S("carol", "import_excel", "ok", workbook=wb, filename="old-export.xlsx", note="merge again: movements added twice", checkpoint=True),
        A.S("carol", "import_excel", "ok", workbook=wb, replace_movements="1", sync_opening_balances="1", checkpoint=True),
        A.S("carol", "import_excel", "reject", workbook=b"", filename="empty.xlsx"),
        A.S("carol", "import_excel", "reject", workbook=b"not a workbook", filename="junk.xlsx"),
        A.S("carol", "import_excel", "reject", workbook=to.content, filename="template.xlsx", note="empty template"),
        A.S("carol", "import_excel", "reject", workbook=wb, filename="", note="blank filename"),
        A.S("carol", "load", checkpoint=True),
    ]
    for st in steps:
        runner.run_step(st)
    return wb


# ---------------------------------------------------------------------------
# modes


def mode_empty(stats, findings, allow):
    pair = Pair("a-empty").start()
    try:
        r = Runner(pair, "a: empty DB", stats, findings, allow)
        stats.scenarios += 1
        r.compare_db("freshly initialised databases (init_db + legacy admin seed)")
        r.run(SC.auth_steps())
        read_side(r, "alice", ["2026-11"], [2026], deep=False)
        r.compare_db("after read side")
        check_passwords(r)
    finally:
        pair.stop()


def check_passwords(r: Runner):
    """password_hash is masked in the DB comparison; check each hash verifies."""
    from werkzeug.security import check_password_hash
    import sqlite3

    for side in r.pair.sides():
        conn = sqlite3.connect(f"file:{side.db_path}?mode=ro", uri=True)
        for uname, h in conn.execute("SELECT username, password_hash FROM users WHERE username != 'admin'"):
            r.stats.db_comparisons += 1
            if not check_password_hash(h, SC.PW):
                r.add("password check", "db", f"{side.kind}: password hash of a scenario user does not verify")
        conn.close()


def mode_features(stats, findings, allow):
    pair = Pair("b-features").start()
    try:
        r = Runner(pair, "b1: feature coverage", stats, findings, allow, db_every=1)
        stats.scenarios += 1
        r.run(SC.features())
        for u in ("alice", "bob"):
            read_side(r, u, MONTHS_SMALL, YEARS_SMALL)
        r.compare_db("after read side")
        excel_round_trip(r, "alice")
        read_side(r, "carol", ["2026-10", "2026-11"], [2026], deep=False)
        r.compare_db("after excel round trip + read side")
        check_passwords(r)
        return r
    finally:
        pair.stop()


def mode_old500(stats, findings, allow):
    for label, steps in SC.old_500_cases():
        pair = Pair("b3-old500").start()
        try:
            r = Runner(pair, f"b3: old 500 path: {label}", stats, findings, allow)
            stats.scenarios += 1
            r.run(steps)
        finally:
            pair.stop()


def mode_rich(stats, findings, allow):
    pair = Pair("b-rich").start()
    try:
        r = Runner(pair, "b2: rich random (seed 20261110)", stats, findings, allow, db_every=25)
        stats.scenarios += 1
        r.run(SC.rich())
        for u in ("alice", "bob"):
            read_side(r, u, MONTHS_RICH, YEARS_RICH)
        r.compare_db("after read side")
        excel_round_trip(r, "alice")
        r.compare_db("after excel round trip")
        return pair
    finally:
        pair.stop()


def mode_cross(stats, findings, allow, rich_pair):
    for label, src_kind in (("c1: old-written DB opened by new", "old"), ("c2: new-written DB opened by old", "new")):
        src = getattr(rich_pair, src_kind).db_path
        name = "c-old2new" if src_kind == "old" else "c-new2old"
        if src_kind == "old":
            pair = Pair(name, old_db=src, new_db=None)
            copy_db(src, pair.new.db_path)
        else:
            pair = Pair(name, old_db=None, new_db=src)
            copy_db(src, pair.old.db_path)
        pair.start()
        try:
            r = Runner(pair, label, stats, findings, allow)
            stats.scenarios += 1
            r.compare_db("on open (both processes ran init_db on the same content)")
            for u in ("alice", "bob"):
                login_as(pair, u)
                read_side(r, u, MONTHS_RICH[-5:], YEARS_RICH[1:])
            r.compare_db("after read side")
        finally:
            pair.stop()


def login_as(pair, username, uid=None):
    import sqlite3

    for side in pair.sides():
        if uid is None:
            conn = sqlite3.connect(f"file:{side.db_path}?mode=ro", uri=True)
            u = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()[0]
            conn.close()
        else:
            u = uid
        side.client(username).login_as(u)


def mode_real(stats, findings, allow, path):
    import sqlite3
    import tempfile

    tmp = tempfile.mkdtemp(prefix="parity-real-")
    src = os.path.join(tmp, "source.db")
    copy_db(path, src)  # read-only snapshot; the original is never opened for writing
    pair = Pair("d-real", start_db=src).start()
    try:
        r = Runner(pair, "d: real DB copy", stats, findings, allow)
        r.redact = True
        stats.scenarios += 1
        conn = sqlite3.connect(f"file:{src}?mode=ro", uri=True)
        uids = [row[0] for row in conn.execute("SELECT id FROM users ORDER BY id")]
        conn.close()
        r.compare_db("on open", redact=True)
        for uid in uids:
            key = f"user{uid}"
            for side in pair.sides():
                side.client(key).login_as(uid)
            months = ["2026-09", "2026-10", "2026-11"]
            read_side(r, key, months, [2025, 2026], deep=False)
        r.compare_db("after read side", redact=True)
    finally:
        pair.stop()


# ---------------------------------------------------------------------------
# report


def write_report(stats, findings, allow, started, modes, redact_real=False):
    os.makedirs(OUT, exist_ok=True)
    undocumented = [f for f in findings if f.allowed is None and f.category not in ("info",)]
    documented = [f for f in findings if f.allowed is not None]
    info = [f for f in findings if f.category == "info"]
    lines = [
        "# Parity report (generated)",
        "",
        f"Generated {time.strftime('%Y-%m-%d %H:%M:%S')} in {time.time() - started:.0f}s; frozen app clock {parity_now()}; modes: {', '.join(modes)}.",
        "",
        "| | count |",
        "| --- | --- |",
        f"| scenarios | {stats.scenarios} |",
        f"| steps (user actions, both apps) | {stats.steps} |",
        f"| DB comparisons (every table, both DBs) | {stats.db_comparisons} |",
        f"| read screens/endpoints compared | {stats.read_screens} |",
        f"| individual read values compared (exact) | {stats.read_comparisons} |",
        f"| values read back from rendered old HTML | {stats.html_values} |",
        f"| differences, undocumented | {len(undocumented)} |",
        f"| differences, allow-listed (documented deviation) | {len(documented)} |",
        f"| informational notes | {len(info)} |",
        "",
    ]
    by_cat = {}
    for f in undocumented:
        by_cat.setdefault(f.category, []).append(f)
    lines.append("## Undocumented differences")
    lines.append("")
    if not undocumented:
        lines.append("None.")
    for cat_, fs in sorted(by_cat.items()):
        lines.append(f"### {cat_} ({len(fs)})")
        lines.append("")
        for f in fs:
            lines.append(f"- **{f.scenario}** — {f.where}  \n  `{f.detail.replace('`', "'")}`")
        lines.append("")
    lines.append("## Allow-listed (documented) deviations hit")
    lines.append("")
    ent = allow.by_id()
    for eid, n in sorted(allow.hits.items()):
        lines.append(f"- `{eid}` x{n}: {ent[eid].reason} ({ent[eid].source})")
    lines.append("")
    lines.append("## Read-side fields present on one side only (NOT compared)")
    lines.append("")
    for screen in sorted(set(R.ONLY_OLD) | set(R.ONLY_NEW)):
        lines.append(f"- **{screen}** old-only: {sorted(R.ONLY_OLD.get(screen, []))}; new-only: {sorted(R.ONLY_NEW.get(screen, []))}")
    lines.append("")
    lines.append("## Informational")
    lines.append("")
    for f in info:
        lines.append(f"- {f.scenario} — {f.where}: {f.detail}")
    with open(os.path.join(OUT, "report.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    with open(os.path.join(OUT, "findings.json"), "w", encoding="utf-8") as fh:
        json.dump(
            {"stats": stats.__dict__, "findings": [f.__dict__ for f in findings], "allow_hits": allow.hits},
            fh, indent=1, ensure_ascii=False, default=str,
        )
    return undocumented


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true", help="modes a + b1 only")
    ap.add_argument("--only", choices=["a", "b1", "b2", "b3", "c", "d"], action="append")
    args = ap.parse_args(argv)
    started = time.time()
    stats, findings, allow = Stats(), [], AllowList()
    only = set(args.only or [])
    run = lambda m: (not only or m in only)  # noqa: E731
    modes = []
    try:
        if run("a"):
            modes.append("a"); mode_empty(stats, findings, allow)
        if run("b1"):
            modes.append("b1"); mode_features(stats, findings, allow)
        if run("b3"):
            modes.append("b3"); mode_old500(stats, findings, allow)
        rich_pair = None
        if not args.quick and (run("b2") or run("c")):
            modes.append("b2"); rich_pair = mode_rich(stats, findings, allow)
        if not args.quick and run("c") and rich_pair:
            modes.append("c"); mode_cross(stats, findings, allow, rich_pair)
        real = os.environ.get("VBX_PARITY_REAL_DB")
        if real and os.path.isfile(real) and run("d"):
            modes.append("d"); mode_real(stats, findings, allow, real)
    except Exception as exc:
        findings.append(__import__("engine").Finding("harness", "run", "error", f"{type(exc).__name__}: {exc}\n{traceback.format_exc()}"))
    und = write_report(stats, findings, allow, started, modes)
    print(f"scenarios={stats.scenarios} steps={stats.steps} db_comparisons={stats.db_comparisons} read_screens={stats.read_screens} "
          f"read_values={stats.read_comparisons} html_values={stats.html_values} undocumented={len(und)} -> {os.path.join(OUT, 'report.md')}")
    return 1 if und else 0


if __name__ == "__main__":
    sys.exit(main())
