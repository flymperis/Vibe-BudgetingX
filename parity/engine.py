"""Drive both apps through a scenario and collect differences."""

from __future__ import annotations

import os
import shutil
import sqlite3
import tempfile
import time
from dataclasses import dataclass, field

import actions as A
import dbdump
from clients import NewClient, OldClient, Outcome
from servers import AppServer, free_port

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")


@dataclass
class Finding:
    scenario: str
    where: str  # "step 12: alice: expense_add(...)" or "read home 2026-03"
    category: str  # response | response-text | db | db-unchanged | read | read-html | export | error
    detail: str
    allowed: str | None = None  # allow-list id when this is a documented deviation

    def key(self):
        return (self.scenario, self.category, self.detail)


@dataclass
class StepRecord:
    index: int
    step: A.Step
    old: Outcome | None
    new: Outcome | None


@dataclass
class Stats:
    scenarios: int = 0
    steps: int = 0
    db_comparisons: int = 0
    read_comparisons: int = 0  # individual value comparisons
    read_screens: int = 0  # screen/endpoint pairs compared
    html_values: int = 0


class Side:
    def __init__(self, kind: str, db_path: str, workdir: str):
        self.kind = kind
        self.db_path = db_path
        self.server = AppServer(kind, db_path, free_port(5601 if kind == "old" else 5651), workdir)
        self.clients: dict[str, OldClient | NewClient] = {}

    def start(self):
        self.server.start()

    def stop(self):
        for c in self.clients.values():
            c.close()
        self.clients.clear()
        self.server.stop()

    def client(self, user: str):
        if user not in self.clients:
            cls = OldClient if self.kind == "old" else NewClient
            self.clients[user] = cls(self.server.base)
        return self.clients[user]


class Pair:
    """Two apps on two copies of the same starting database."""

    def __init__(self, name: str, start_db: str | None = None, old_db: str | None = None, new_db: str | None = None):
        self.name = name
        self.dir = tempfile.mkdtemp(prefix=f"parity-{name}-")
        od = old_db or os.path.join(self.dir, "old.db")
        nd = new_db or os.path.join(self.dir, "new.db")
        if start_db and not old_db:
            copy_db(start_db, od)
        if start_db and not new_db:
            copy_db(start_db, nd)
        self.old = Side("old", od, os.path.join(self.dir, "old"))
        self.new = Side("new", nd, os.path.join(self.dir, "new"))

    def start(self):
        self.old.start()
        self.new.start()
        return self

    def stop(self):
        self.old.stop()
        self.new.stop()

    def sides(self):
        return (self.old, self.new)


def copy_db(src: str, dst: str):
    """Consistent copy (sqlite backup API: includes WAL content)."""
    s = sqlite3.connect(f"file:{src}?mode=ro", uri=True)
    d = sqlite3.connect(dst)
    try:
        s.backup(d)
    finally:
        s.close()
        d.close()


def accepted(o: Outcome, kind: str) -> bool:
    if kind == "old":
        return o.status in (200, 302) and "error" not in o.categories
    return 200 <= o.status < 300


class Runner:
    def __init__(self, pair: Pair, scenario: str, stats: Stats, findings: list, allow, db_every: int = 1):
        self.pair, self.scenario, self.stats, self.findings, self.allow = pair, scenario, stats, findings, allow
        self.db_every = db_every
        self.redact = False
        self.records: list[StepRecord] = []
        self._seen = set()
        self._step_no = 0

    def add(self, where, category, detail, allowed=None):
        f = Finding(self.scenario, where, category, detail, allowed)
        if f.key() in self._seen:
            return
        self._seen.add(f.key())
        self.findings.append(f)

    # --------------------------------------------------------------
    def compare_db(self, where: str, redact=False):
        self.stats.db_comparisons += 1
        a = dbdump.dump(self.pair.old.db_path)
        b = dbdump.dump(self.pair.new.db_path)
        mid_scenario = where.startswith("step ")
        reported = self.__dict__.setdefault("_db_tables", set())
        diffs = dbdump.compare_dumps(a, b, redact=redact or self.redact)
        for d in diffs:
            # A divergence usually persists: report a table the first time it
            # diverges, then again only at the non-step checkpoints (end of
            # scenario, after read side, ...).
            if mid_scenario and d["table"] in reported:
                continue
            detail = f"{d['table']}: {d['kind']}: {d['detail']}"
            self.add(where, "db", detail, self.allow.match_db(d, self.scenario))
        reported |= {d["table"] for d in diffs}
        return a, b

    def run(self, steps: list[A.Step]):
        for step in steps:
            self.run_step(step)
        self.compare_db(f"end of scenario ({len(steps)} steps)")

    def run_step(self, step: A.Step):
        self._step_no += 1
        self.stats.steps += 1
        idx = self._step_no
        where = f"step {idx}: {step.describe()}"
        if step.action == "raw_sql":
            for side in self.pair.sides():
                conn = sqlite3.connect(side.db_path, timeout=30)
                try:
                    conn.executescript(step.params["sql"])
                    conn.commit()
                finally:
                    conn.close()
            return
        check_unchanged = step.expect == "reject"
        before = {}
        if check_unchanged:
            before = {s.kind: dbdump.dump(s.db_path) for s in self.pair.sides()}
        old_fn, new_fn = A.ACTIONS[step.action]
        outs = {}
        for side, fn in ((self.pair.old, old_fn), (self.pair.new, new_fn)):
            params = A.resolve_params(step.params, side.db_path, step.user)
            try:
                outs[side.kind] = fn(side.client(step.user), params)
            except Exception as exc:  # harness or transport error
                outs[side.kind] = Outcome(599, [f"EXCEPTION {type(exc).__name__}: {exc}"], ["error"])
        rec = StepRecord(idx, step, outs["old"], outs["new"])
        self.records.append(rec)
        o, n = outs["old"], outs["new"]
        oa, na = accepted(o, "old"), accepted(n, "new")
        if o.status >= 500 or n.status >= 500:
            self.add(where, "response", f"server error: old={o.short()} new={n.short()}", self.allow.match_response(step, o, n))
        elif oa != na:
            self.add(where, "response", f"old {'accepted' if oa else 'rejected'} ({o.short()}), new {'accepted' if na else 'rejected'} ({n.short()})", self.allow.match_response(step, o, n))
        else:
            om = [m for m in o.messages if m]
            if om and not all(m in n.messages for m in om):
                self.add(where, "response-text", f"old={o.status} {om} new={n.status} {n.messages}", self.allow.match_text(step, o, n))
        if step.expect == "ok" and not (oa and na) and not self.allow.match_response(step, o, n):
            self.add(where, "error", f"scenario expected success: old={o.short()} new={n.short()} (scenario/harness problem or both apps refuse)")
        if step.expect == "reject" and (oa or na) and step.action not in ("load",):
            # an accepted 'reject' step is only a finding if it changed the DB (checked below)
            pass
        if check_unchanged:
            changed = {}
            for s in self.pair.sides():
                after = dbdump.dump(s.db_path)
                diffs = dbdump.compare_dumps(before[s.kind], after, "before", "after")
                changed[s.kind] = diffs
            if bool(changed["old"]) != bool(changed["new"]):
                k = "old" if changed["old"] else "new"
                self.add(where, "db-unchanged", f"only the {k} DB changed on this invalid-input step: " + "; ".join(f"{d['table']}: {d['detail'][:160]}" for d in changed[k][:4]))
            elif changed["old"]:
                self.add(where, "info", "both apps changed the DB on this step expected to be rejected (identical behaviour, not a difference): " + "; ".join(sorted({d['table'] for d in changed['old']})))
            self.stats.db_comparisons += 2
        if step.checkpoint or (self.db_every and idx % self.db_every == 0):
            self.compare_db(where)
        return rec
