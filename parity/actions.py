"""The scenario DSL: one logical user action -> old form POST and new API call.

A scenario is a list of Step objects. Each step names a user (by username),
an action from ACTIONS and its parameters. Parameter values are written once:

* plain values (strings, numbers) are sent as strings on both sides (forms are
  strings; the new schemas accept strings for every field, like the forms);
* Ref objects (cat("Food"), acc("Main"), last("expenses"), ...) are resolved
  per side against THAT side's database, so a scenario keeps working even if
  the two apps assigned different ids (which the DB comparison then reports);
* None means "field not sent" (absent from the form / JSON body), which
  matters where the old code tests presence ("start_date" in form,
  amount_<id> in form, other_amount in form).

Each action has an old and a new implementation returning clients.Outcome.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field

from clients import NewClient, OldClient, Outcome

# --------------------------------------------------------------------------
# references


class Ref:
    def __init__(self, sql: str, user: str | None = None, desc: str = "", **params):
        self.sql, self.user, self.params, self.desc = sql, user, params, desc

    def resolve(self, db_path: str, acting_user: str):
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, timeout=30)
        try:
            uname = self.user or acting_user
            row = conn.execute("SELECT id FROM users WHERE username = ?", (uname,)).fetchone()
            params = dict(self.params, uid=row[0] if row else -1)
            row = conn.execute(self.sql, params).fetchone()
            return row[0] if row else -999999  # a foreign/missing id: the apps must reject it
        finally:
            conn.close()

    def __repr__(self):
        return self.desc or f"Ref({self.sql!r})"


def cat(name, user=None):
    return Ref("SELECT id FROM categories WHERE user_id=:uid AND name=:n", user, f"cat({name})", n=name)


def icat(name, user=None):
    return Ref("SELECT id FROM income_categories WHERE user_id=:uid AND name=:n", user, f"icat({name})", n=name)


def acc(name, user=None):
    return Ref("SELECT id FROM accounts WHERE user_id=:uid AND name=:n", user, f"acc({name})", n=name)


def person(name, user=None):
    return Ref("SELECT id FROM shared_people WHERE user_id=:uid AND name=:n", user, f"person({name})", n=name)


def self_person(user=None):
    return Ref("SELECT id FROM shared_people WHERE user_id=:uid AND is_self=1", user, "self_person")


def group(name, user=None):
    # a group the user created or is a member of
    return Ref(
        "SELECT g.id FROM shared_groups g WHERE g.name=:n AND (g.user_id=:uid OR EXISTS ("
        "SELECT 1 FROM shared_group_members m JOIN shared_people p ON p.id=m.person_id "
        "WHERE m.group_id=g.id AND p.linked_user_id=:uid)) ORDER BY g.id DESC",
        user, f"group({name})", n=name,
    )


def member(group_name, person_name, owner):
    """person id (owned by `owner`) of a group member, for paid_by/included."""
    return Ref("SELECT id FROM shared_people WHERE user_id=(SELECT id FROM users WHERE username=:o) AND name=:n", None, f"member({owner}:{person_name})", o=owner, n=person_name)


def person_of_user(owner, linked_username):
    """the contact row of `owner` that is linked to login `linked_username` (or `owner`'s self row)."""
    return Ref(
        "SELECT id FROM shared_people WHERE user_id=(SELECT id FROM users WHERE username=:o) "
        "AND linked_user_id=(SELECT id FROM users WHERE username=:l) ORDER BY is_self DESC, id",
        None, f"person_of({owner}->{linked_username})", o=owner, l=linked_username,
    )


def last(table, user_col="user_id", where="", user=None, **params):
    w = f" AND {where}" if where else ""
    return Ref(f"SELECT id FROM {table} WHERE {user_col}=:uid{w} ORDER BY id DESC", user, f"last({table}{w})", **params)


def nth(table, n, user=None):
    return Ref(f"SELECT id FROM {table} WHERE user_id=:uid ORDER BY id LIMIT 1 OFFSET {int(n)}", user, f"nth({table},{n})")


def shared_expense(desc_text, user=None):
    return Ref("SELECT id FROM shared_expenses WHERE description=:d ORDER BY id DESC", user, f"sexp({desc_text})", d=desc_text)


def settlement(notes, user=None):
    return Ref("SELECT id FROM shared_settlements WHERE notes=:n ORDER BY id DESC", user, f"settle({notes})", n=notes)


class Raw:
    """A literal id (e.g. a made-up foreign id) sent as is on both sides."""

    def __init__(self, v):
        self.v = v

    def __repr__(self):
        return f"Raw({self.v})"


# --------------------------------------------------------------------------
# steps


@dataclass
class Step:
    user: str
    action: str
    params: dict = field(default_factory=dict)
    expect: str = "any"  # "ok" | "reject" | "any": what a correct app does (documentation + checks)
    note: str = ""
    checkpoint: bool = False  # force a DB comparison after this step

    def describe(self) -> str:
        ps = ", ".join(f"{k}={v!r}" for k, v in self.params.items() if k != "workbook")
        return f"{self.user}: {self.action}({ps})"


def S(user, action, expect="any", note="", checkpoint=False, **params) -> Step:
    return Step(user, action, params, expect, note, checkpoint)


def _resolve(v, db_path, user):
    if isinstance(v, Ref):
        return v.resolve(db_path, user)
    if isinstance(v, Raw):
        return v.v
    if isinstance(v, list):
        return [_resolve(x, db_path, user) for x in v]
    if isinstance(v, dict):
        return {(_resolve(k, db_path, user) if isinstance(k, Ref) else k): _resolve(x, db_path, user) for k, x in v.items()}
    return v


def resolve_params(params: dict, db_path: str, user: str) -> dict:
    return {k: _resolve(v, db_path, user) for k, v in params.items()}


def _form(params: dict, keys=None) -> dict:
    out = {}
    for k, v in params.items():
        if keys is not None and k not in keys:
            continue
        if v is None:
            continue
        out[k] = [str(x) for x in v] if isinstance(v, list) else ("" if v == "" else str(v))
    return out


def _json(params: dict, keys=None) -> dict:
    out = {}
    for k, v in params.items():
        if keys is not None and k not in keys:
            continue
        if v is None:
            continue
        out[k] = [str(x) for x in v] if isinstance(v, list) else (v if isinstance(v, (dict, bool)) else str(v))
    return out


# --------------------------------------------------------------------------
# action implementations: (old_fn, new_fn)

ACTIONS: dict[str, tuple] = {}


def action(name, old_fn, new_fn):
    ACTIONS[name] = (old_fn, new_fn)


def _simple(old_path, new_method, new_path, id_key=None, keys=None):
    """Generic CRUD action: id_key names the param that goes in the URL."""

    def old(c: OldClient, p):
        path = old_path.format(**p) if id_key else old_path
        return c.post(path, _form({k: v for k, v in p.items() if k != id_key}, keys))

    def new(c: NewClient, p):
        path = new_path.format(**p) if id_key else new_path
        body = _json({k: v for k, v in p.items() if k != id_key}, keys)
        if new_method == "DELETE" and not body:
            return c.call("DELETE", path)
        return c.call(new_method, path, body)

    return old, new


# auth
action("register", lambda c, p: c.register(p["username"], p["password"], p.get("password2")), lambda c, p: c.register(p["username"], p["password"], p.get("password2")))
action("login", lambda c, p: c.login(p["username"], p["password"]), lambda c, p: c.login(p["username"], p["password"]))
action("logout", lambda c, p: c.logout(), lambda c, p: c.logout())

# expenses / income
action("expense_add", *_simple("/expenses/add", "POST", "/api/expenses"))
action("expense_edit", *_simple("/expenses/{id}/edit", "PUT", "/api/expenses/{id}", "id"))
action("expense_delete", *_simple("/expenses/{id}/delete", "DELETE", "/api/expenses/{id}", "id"))
action("income_add", *_simple("/income/add", "POST", "/api/income"))
action("income_edit", *_simple("/income/{id}/edit", "PUT", "/api/income/{id}", "id"))
action("income_delete", *_simple("/income/{id}/delete", "DELETE", "/api/income/{id}", "id"))

# categories
action("category_add", *_simple("/categories/add", "POST", "/api/categories"))
action("category_edit", *_simple("/categories/{id}/edit", "PUT", "/api/categories/{id}", "id"))
action("category_delete", *_simple("/categories/{id}/delete", "DELETE", "/api/categories/{id}", "id"))
action("icat_add", *_simple("/income-categories/add", "POST", "/api/income-categories"))
action("icat_edit", *_simple("/income-categories/{id}/edit", "PUT", "/api/income-categories/{id}", "id"))
action("icat_delete", *_simple("/income-categories/{id}/delete", "DELETE", "/api/income-categories/{id}", "id"))

# accounts / transfers
action("account_add", *_simple("/accounts/add", "POST", "/api/accounts"))
action("account_edit", *_simple("/accounts/{id}/edit", "PUT", "/api/accounts/{id}", "id"))
action("account_delete", *_simple("/accounts/{id}/delete", "DELETE", "/api/accounts/{id}", "id"))
action("transfer_add", *_simple("/transfers/add", "POST", "/api/transfers"))
action("transfer_delete", *_simple("/transfers/{id}/delete", "DELETE", "/api/transfers/{id}", "id"))

# recurring
action("recurring_add", *_simple("/recurring/add", "POST", "/api/recurring"))
action("recurring_edit", *_simple("/recurring/{id}/edit", "PUT", "/api/recurring/{id}", "id"))
action("recurring_delete", *_simple("/recurring/{id}/delete", "DELETE", "/api/recurring/{id}", "id"))

# budgets
action("budget_toggle", *_simple("/budget/toggle", "POST", "/api/budget/toggle"))


def _budget_defaults_old(c, p):
    form = {}
    for cid, amt in (p.get("amounts") or {}).items():
        form[f"amount_{cid}"] = "" if amt is None else str(amt)
    for cid, on in (p.get("fixed") or {}).items():
        if on:
            form[f"fixed_{cid}"] = "1"
    if "other_amount" in p and p["other_amount"] is not None:
        form["other_amount"] = str(p["other_amount"])
    return c.post("/budget/defaults", form)


def _budget_defaults_new(c, p):
    body = {
        "amounts": {str(cid): ("" if a is None else str(a)) for cid, a in (p.get("amounts") or {}).items()},
        "fixed": {str(cid): True for cid, on in (p.get("fixed") or {}).items() if on},
    }
    if "other_amount" in p and p["other_amount"] is not None:
        body["other_amount"] = str(p["other_amount"])
    return c.call("POST", "/api/budget/defaults", body)


action("budget_defaults", _budget_defaults_old, _budget_defaults_new)
action("budget_override", *_simple("/budget/override", "POST", "/api/budget/override"))
action("budget_clear_month", *_simple("/budget/clear-month", "POST", "/api/budget/clear-month"))
action("budget_restore_month", *_simple("/budget/restore-month", "POST", "/api/budget/restore-month"))

# shared: people
action("person_add", *_simple("/shared/people/add", "POST", "/api/shared/people"))
action("person_rename", *_simple("/shared/people/{id}/rename", "PUT", "/api/shared/people/{id}", "id"))
action("person_link", *_simple("/shared/people/{id}/link", "PUT", "/api/shared/people/{id}/link", "id"))
action("person_unlink", *_simple("/shared/people/{id}/unlink", "DELETE", "/api/shared/people/{id}/link", "id"))
action("person_delete", *_simple("/shared/people/{id}/delete", "DELETE", "/api/shared/people/{id}", "id"))
# groups
action("group_add", *_simple("/shared/groups/add", "POST", "/api/shared/groups"))
action("group_rename", *_simple("/shared/groups/{id}/rename", "PUT", "/api/shared/groups/{id}", "id"))
action("group_delete", *_simple("/shared/groups/{id}/delete", "DELETE", "/api/shared/groups/{id}", "id"))
action("group_accept", *_simple("/shared/groups/{id}/accept", "POST", "/api/shared/groups/{id}/accept", "id"))
action("group_decline", *_simple("/shared/groups/{id}/decline", "POST", "/api/shared/groups/{id}/decline", "id"))
action("member_add", *_simple("/shared/groups/{id}/members/add", "POST", "/api/shared/groups/{id}/members", "id"))


def _member_remove_old(c, p):
    return c.post(f"/shared/groups/{p['id']}/members/{p['person_id']}/remove", {})


def _member_remove_new(c, p):
    return c.call("DELETE", f"/api/shared/groups/{p['id']}/members/{p['person_id']}")


action("member_remove", _member_remove_old, _member_remove_new)


def _sexp_form(p):
    form = _form(p, ["description", "amount", "paid_by", "split_method", "spent_on", "record_personal", "category_id", "account_id"])
    for pid in p.get("included") or []:
        form[f"include_{pid}"] = "1"
    for pid, v in (p.get("values") or {}).items():
        form[f"value_{pid}"] = str(v)
    return form


def _sexp_json(p):
    body = _json(p, ["description", "amount", "paid_by", "split_method", "spent_on", "record_personal", "category_id", "account_id"])
    body["included"] = [str(x) for x in (p.get("included") or [])]
    body["values"] = {str(k): str(v) for k, v in (p.get("values") or {}).items()}
    return body


action("sexp_add", lambda c, p: c.post(f"/shared/groups/{p['group']}/expenses/add", _sexp_form(p)), lambda c, p: c.call("POST", f"/api/shared/groups/{p['group']}/expenses", _sexp_json(p)))
action("sexp_edit", lambda c, p: c.post(f"/shared/expenses/{p['id']}/edit", _sexp_form(p)), lambda c, p: c.call("PUT", f"/api/shared/expenses/{p['id']}", _sexp_json(p)))
action("sexp_delete", *_simple("/shared/expenses/{id}/delete", "DELETE", "/api/shared/expenses/{id}", "id"))
action("sexp_record", *_simple("/shared/expenses/{id}/record", "PUT", "/api/shared/expenses/{id}/record", "id"))
action("sexp_unrecord", *_simple("/shared/expenses/{id}/unrecord", "DELETE", "/api/shared/expenses/{id}/record", "id"))
action("settle_add", lambda c, p: c.post(f"/shared/groups/{p['group']}/settlements/add", _form({k: v for k, v in p.items() if k != "group"})), lambda c, p: c.call("POST", f"/api/shared/groups/{p['group']}/settlements", _json({k: v for k, v in p.items() if k != "group"})))
action("settle_delete", *_simple("/shared/settlements/{id}/delete", "DELETE", "/api/shared/settlements/{id}", "id"))
action("settle_record", *_simple("/shared/settlements/{id}/record", "PUT", "/api/shared/settlements/{id}/record", "id"))
action("settle_unrecord", *_simple("/shared/settlements/{id}/unrecord", "DELETE", "/api/shared/settlements/{id}/record", "id"))

# investments
action("stock_add", *_simple("/stocks/add", "POST", "/api/investments/stocks"))
action("stock_edit", *_simple("/stocks/{id}/edit", "PUT", "/api/investments/stocks/{id}", "id"))
action("stock_delete", *_simple("/stocks/{id}/delete", "DELETE", "/api/investments/stocks/{id}", "id"))
action("crypto_add", *_simple("/crypto/add", "POST", "/api/investments/crypto"))
action("crypto_edit", *_simple("/crypto/{id}/edit", "PUT", "/api/investments/crypto/{id}", "id"))
action("crypto_delete", *_simple("/crypto/{id}/delete", "DELETE", "/api/investments/crypto/{id}", "id"))

# settings
action("ai_save", *_simple("/settings/integrations/save", "PUT", "/api/settings/integrations/ai"))
action("tg_default_account", *_simple("/settings/telegram/default-account", "PUT", "/api/settings/telegram/default-account"))
action("tg_link_code", *_simple("/settings/telegram/generate-code", "POST", "/api/settings/telegram/link-code"))
action("tg_unlink", *_simple("/settings/telegram/unlink", "POST", "/api/settings/telegram/unlink"))

_KINDS = ("budget", "cards", "bills", "weekly", "monthly")


def _notify_old(c, p):
    form = {f"notify_{k}": str(p[k]) for k in _KINDS if p.get(k) is not None}
    if p.get("card_days") is not None:
        form["card_days"] = str(p["card_days"])
    return c.post("/settings/telegram/notifications", form)


def _notify_new(c, p):
    return c.call("PUT", "/api/settings/telegram/notifications", _json(p, list(_KINDS) + ["card_days"]))


action("tg_notifications", _notify_old, _notify_new)


# excel import (the workbook bytes come from the step's params)
def _import_old(c, p):
    files = {"file": (p.get("filename", "import.xlsx"), p["workbook"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    return c.post("/import/excel", _form(p, ["replace_movements", "sync_opening_balances"]), files=files)


def _import_new(c, p):
    files = {"file": (p.get("filename", "import.xlsx"), p["workbook"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    return c.call("POST", "/api/import/excel", files=files, data=_form(p, ["replace_movements", "sync_opening_balances"]))


action("import_excel", _import_old, _import_new)


# page load: the old app posts due recurring entries on every dashboard load,
# the new one on GET /api/bootstrap.
def _load_old(c, p):
    r = c.get("/", params={"panel": "home"})
    return Outcome(r.status_code, [])


def _load_new(c, p):
    r = c.get("/api/bootstrap")
    return Outcome(r.status_code, [], body=r.json() if r.status_code == 200 else None)


action("load", _load_old, _load_new)


# opening the Shared screen (old: the shared panel of the dashboard, new: GET /api/shared)
def _shared_old(c, p):
    r = c.get("/", params={"panel": "shared"})
    return Outcome(r.status_code, [])


def _shared_new(c, p):
    r = c.get("/api/shared")
    return Outcome(r.status_code, [])


action("shared_view", _shared_old, _shared_new)

# Non-HTTP: the same SQL applied to both databases (setup that no UI offers,
# e.g. a linked Telegram chat). Handled by the runner.
action("raw_sql", None, None)
