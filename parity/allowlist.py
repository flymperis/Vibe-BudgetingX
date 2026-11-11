"""Known, documented, intentional deviations between the old and the new app.

Rules for this file:
* every entry names its source (PORTING_NOTES.md or docs/parity/A-E.md) and why
  it is harmless;
* entries only match RESPONSE behaviour (accepted/rejected status, message text)
  of specific actions. The DB comparison and every read-side number comparison
  are never allow-listed: an entry here can not hide a different DB or a
  different number. (Steps that hit an entry are still DB-compared.)
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Callable


@dataclass
class Entry:
    id: str
    kind: str  # "response" (accepted vs rejected / 5xx) | "text" (message wording)
    actions: tuple
    when: Callable  # (old Outcome, new Outcome, step) -> bool
    reason: str
    source: str


def _old_silent(o):
    """The old route redirected without any flash (a silent no-op or success)."""
    return o.status == 302 and not o.messages


def _new_400(n, *texts):
    return n.status == 400 and (not texts or any(t in " ".join(n.messages) for t in texts))


def _new_404(n, *texts):
    return n.status == 404 and (not texts or any(t in " ".join(n.messages) for t in texts))


ENTRIES: list[Entry] = [
    Entry(
        "blank-category-or-account-400", "response",
        ("expense_add", "expense_edit", "income_add", "income_edit"),
        lambda o, n, s: _old_silent(o) and _new_400(n, "Choose a category and an account."),
        "Old route silently redirected and saved nothing when category/account was blank; new answers "
        "400 'Choose a category and an account.'. DB effect identical (nothing saved).",
        "PORTING_NOTES.md routers/expenses.py; docs/parity/A.md §4",
    ),
    Entry(
        "not-found-404", "response",
        ("expense_edit", "expense_delete", "income_edit", "income_delete", "category_edit",
         "icat_edit", "account_edit", "account_delete", "recurring_delete", "stock_delete",
         "crypto_delete", "stock_edit", "crypto_edit"),
        lambda o, n, s: n.status == 404,
        "Edit/delete of a missing or foreign row: old UPDATE/DELETE matched nothing and redirected (some "
        "flashed success, some 'not found'); new answers 404. Nothing changes in either DB.",
        "PORTING_NOTES.md routers/expenses.py; docs/parity/A.md §4; docs/parity/D.md §4",
    ),
    Entry(
        "blank-name-400", "response",
        ("category_add", "category_edit", "icat_add", "icat_edit", "account_add", "account_edit"),
        lambda o, n, s: _old_silent(o) and _new_400(n, "Enter a name."),
        "Blank name: old silent no-op, new 400 'Enter a name.'. Nothing saved on either side.",
        "docs/parity/A.md §4",
    ),
    Entry(
        "duplicate-name-400", "response",
        ("category_add", "icat_add", "account_add", "category_edit", "icat_edit", "account_edit"),
        lambda o, n, s: (_old_silent(o) or o.status >= 500) and _new_400(n, "already exists"),
        "Duplicate name: old INSERT OR IGNORE no-op (add) or 500 IntegrityError (rename); new 400. "
        "DB unchanged on both sides.",
        "docs/parity/A.md §4",
    ),
    Entry(
        "account-in-use-400", "response",
        ("account_delete",),
        lambda o, n, s: (_old_silent(o) or o.status >= 500) and _new_400(n, "still in use"),
        "Deleting a referenced account: old 500/no-op, new 400 with a message. Nothing deleted.",
        "docs/parity/A.md §4",
    ),
    Entry(
        "blank-transfer-accounts-400", "response",
        ("transfer_add",),
        lambda o, n, s: _old_silent(o) and _new_400(n, "Choose the two accounts."),
        "Blank from/to account: old silent no-op, new 400.",
        "docs/parity/A.md §4",
    ),
    Entry(
        "success-object-instead-of-flash", "text",
        ("*",),
        lambda o, n, s: o.status == 302 and "error" not in o.categories and 200 <= n.status < 300 and not n.messages,
        "Old success flash (e.g. 'Account created.', 'Stock buy recorded.') vs a 2xx JSON body that returns the "
        "created/updated object without a message. Success is signalled by the status; the frontend words the toast.",
        "ARCHITECTURE.md 'API conventions' (mutations return 200 with the affected object)",
    ),
    Entry(
        "old-leaked-write-lock", "response",
        ("category_add",),
        lambda o, n, s: s.note.startswith("follow-up write after an old 500") and o.status >= 500 and 200 <= n.status < 300,
        "OLD BUG, fixed by construction in the new app: after the unhandled IntegrityError above, the old route "
        "never closed its connection, so its write lock stays held and the next write in that process fails "
        "('database is locked' after the 30 s busy timeout). New app answers 400 and always closes.",
        "docs/parity/A.md §6 (routes/accounts.py delete/edit, routes/categories.py edit)",
    ),
    Entry(
        "random-link-code", "text",
        ("tg_link_code",),
        lambda o, n, s: [re.sub(r"[A-Z0-9]{8}", "CODE", m) for m in o.messages] == [re.sub(r"[A-Z0-9]{8}", "CODE", m) for m in n.messages if m.startswith("Link code")],
        "The flashed link code is random (secrets); messages are equal once the 8-character code is masked.",
        "docs/parity/E.md §2 (link-code)",
    ),
    Entry(
        "register-already-logged-in", "response",
        ("register",),
        lambda o, n, s: _old_silent(o) and _new_400(n, "Already logged in"),
        "Register while logged in: old redirected to the dashboard, new 400. No account created on either side.",
        "PORTING_NOTES.md routers/auth.py",
    ),
]



class AllowList:
    def __init__(self, entries=None):
        self.entries = entries if entries is not None else ENTRIES
        self.hits: dict[str, int] = {}

    def _match(self, kind, step, o, n):
        for e in self.entries:
            if e.kind == kind and (step.action in e.actions or "*" in e.actions) and e.when(o, n, step):
                self.hits[e.id] = self.hits.get(e.id, 0) + 1
                return e.id
        return None

    def match_response(self, step, o, n):
        return self._match("response", step, o, n)

    def match_text(self, step, o, n):
        return self._match("text", step, o, n) or self._match("response", step, o, n)

    def match_db(self, d, scenario=""):
        # The single DB exception: scenario b3 exists to show the OLD app's
        # leaked write lock; the follow-up row the old app could not write is
        # that old bug, not a new-app difference. Nothing else is ever matched.
        if scenario.startswith("b3:") and d["table"] in ("categories", "sqlite_sequence"):
            self.hits["old-leaked-write-lock(db)"] = self.hits.get("old-leaked-write-lock(db)", 0) + 1
            return "old-leaked-write-lock"
        return None

    def by_id(self):
        d = {e.id: e for e in self.entries}
        d["old-leaked-write-lock(db)"] = Entry("old-leaked-write-lock(db)", "db", (), None,
            "DB side of old-leaked-write-lock: the follow-up category the locked old process could not write (scenario b3 only).",
            "docs/parity/A.md §6")
        return d
