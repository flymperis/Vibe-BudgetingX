"""Dump and compare two SQLite databases table by table.

Every table is read ordered by its primary key (rowid tables by rowid) and
compared row by row, every column, values exactly as stored (floats compared
with ==, ids included). The ONLY normalisations are listed in VOLATILE below;
each has a reason. Anything else that differs is reported.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime

# Columns filled by SQLite's CURRENT_TIMESTAMP at insert time (real wall clock,
# not the frozen Python clock): the two apps insert the same row a few
# milliseconds/seconds apart. Compared within TIMESTAMP_TOLERANCE_S instead of
# exactly. (NULL vs value is still a difference.)
TIMESTAMP_COLUMNS = {"created_at", "updated_at", "linked_at", "fetched_at", "sent_at"}
TIMESTAMP_TOLERANCE_S = 300

# table -> {column: reason}. Values masked before comparison.
VOLATILE = {
    "users": {
        "password_hash": "salted werkzeug hash differs per call; checked separately with check_password_hash",
    },
    "telegram_link_codes": {
        "code": "random 8-char link code (secrets); rows are ordered by (user_id, expires_at) instead of the code PK",
    },
}

# Tables whose primary key is random: ordered by these columns instead.
ORDER_OVERRIDE = {"telegram_link_codes": "user_id, expires_at"}


def connect_ro(path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=30)
    conn.row_factory = sqlite3.Row
    return conn


def schema(conn) -> list[tuple]:
    return [
        tuple(r)
        for r in conn.execute(
            "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_autoindex%' ORDER BY type, name"
        )
    ]


def _norm_sql(sql):
    return " ".join((sql or "").split())


def tables(conn) -> list[str]:
    return [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]


def _order_by(conn, table) -> str:
    if table in ORDER_OVERRIDE:
        return ORDER_OVERRIDE[table]
    info = conn.execute(f'PRAGMA table_info("{table}")').fetchall()
    pk = sorted([r for r in info if r["pk"]], key=lambda r: r["pk"])
    if pk:
        return ", ".join(f'"{r["name"]}"' for r in pk)
    return "rowid"


def dump(path: str) -> dict:
    conn = connect_ro(path)
    try:
        out = {"__schema__": schema(conn)}
        for t in tables(conn):
            cols = [r["name"] for r in conn.execute(f'PRAGMA table_info("{t}")')]
            rows = conn.execute(f'SELECT * FROM "{t}" ORDER BY {_order_by(conn, t)}').fetchall()
            out[t] = {"columns": cols, "rows": [tuple(r) for r in rows]}
        return out
    finally:
        conn.close()


def _ts(v):
    try:
        return datetime.fromisoformat(str(v).replace(" ", "T"))
    except ValueError:
        return None


def _cell_equal(col, a, b) -> bool:
    if col in TIMESTAMP_COLUMNS and a is not None and b is not None:
        ta, tb = _ts(a), _ts(b)
        if ta and tb:
            return abs((ta - tb).total_seconds()) <= TIMESTAMP_TOLERANCE_S
    if type(a) is not type(b):
        # 1 vs 1.0 stored as INTEGER vs REAL is a real storage difference
        return False
    if isinstance(a, float):
        return a == b or (a != a and b != b)
    return a == b


def compare_dumps(a: dict, b: dict, label_a="old", label_b="new", max_rows=25, redact=False) -> list[dict]:
    """List of differences: {table, kind, detail}. redact=True keeps values
    out of the report (real-DB mode): only ids/columns/numbers."""
    diffs = []
    sa = [(t, n, tb, _norm_sql(s)) for t, n, tb, s in a["__schema__"]]
    sb = [(t, n, tb, _norm_sql(s)) for t, n, tb, s in b["__schema__"]]
    if sa != sb:
        only_a = sorted(set(sa) - set(sb))
        only_b = sorted(set(sb) - set(sa))
        diffs.append({"table": "sqlite_master", "kind": "schema", "detail": f"only in {label_a}: {[x[:2] for x in only_a]}; only in {label_b}: {[x[:2] for x in only_b]}"})
    for t in sorted(set(a) | set(b)):
        if t == "__schema__":
            continue
        if t not in a or t not in b:
            diffs.append({"table": t, "kind": "missing table", "detail": f"present only in {label_a if t in a else label_b}"})
            continue
        ca, cb = a[t]["columns"], b[t]["columns"]
        if ca != cb:
            diffs.append({"table": t, "kind": "columns", "detail": f"{ca} vs {cb}"})
            continue
        masked = VOLATILE.get(t, {})
        ra = [tuple(None if c in masked else v for c, v in zip(ca, r)) for r in a[t]["rows"]]
        rb = [tuple(None if c in masked else v for c, v in zip(cb, r)) for r in b[t]["rows"]]
        if t == "sqlite_sequence":
            ra, rb = sorted(ra), sorted(rb)
        if len(ra) != len(rb):
            diffs.append({"table": t, "kind": "row count", "detail": f"{label_a}={len(ra)} {label_b}={len(rb)}"})
        n = 0
        for i in range(max(len(ra), len(rb))):
            x = ra[i] if i < len(ra) else None
            y = rb[i] if i < len(rb) else None
            if x is not None and y is not None and all(_cell_equal(c, p, q) for c, p, q in zip(ca, x, y)):
                continue
            n += 1
            if n > max_rows:
                continue
            if x is None or y is None:
                row = x or y
                key = row[0] if row else None
                diffs.append({"table": t, "kind": "extra row", "detail": f"row #{i} (first col {key!r}) only in {label_a if y is None else label_b}" + ("" if redact else f": {row}")})
                continue
            cols = [c for c, p, q in zip(ca, x, y) if not _cell_equal(c, p, q)]
            if redact:
                vals = {c: (x[ca.index(c)], y[ca.index(c)]) for c in cols if isinstance(x[ca.index(c)], (int, float)) and isinstance(y[ca.index(c)], (int, float))}
                diffs.append({"table": t, "kind": "row", "detail": f"row #{i} first col {x[0]!r}: columns {cols} numeric {vals}"})
            else:
                diffs.append({"table": t, "kind": "row", "detail": f"row #{i}: " + "; ".join(f"{c}: {label_a}={x[ca.index(c)]!r} {label_b}={y[ca.index(c)]!r}" for c in cols)})
        if n > max_rows:
            diffs.append({"table": t, "kind": "row", "detail": f"... {n - max_rows} more differing rows"})
    return diffs


def table_counts(d: dict) -> dict:
    return {t: len(v["rows"]) for t, v in d.items() if t != "__schema__"}
