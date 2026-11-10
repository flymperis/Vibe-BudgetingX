# Phase 2 brief — backend domains (shared by all Phase 2 agents)

Read first, in this order: `docs/ARCHITECTURE.md` (hard rules are binding), `backend/README.md`,
`backend/vbx/core/PORTING_NOTES.md`, `backend/vbx/api/routers/expenses.py` + `schemas/expenses.py`
(reference pattern), `backend/tests/conftest.py`, `backend/tests/test_expenses.py`.

Several agents work in `backend/` at the same time, each on a different domain. To avoid collisions:

- Create/edit only: your own `vbx/api/routers/<name>.py`, `vbx/api/schemas/<name>.py`,
  `vbx/api/services/<name>.py` (for logic extracted from old `routes/*.py`, e.g. pieces of the big
  `routes/dashboard.py::index`), your own test files, and your own `docs/parity/<LETTER>.md`.
- Test files: you own the new counterparts of the OLD test files assigned to you. Some already exist
  with a few pure-function tests; extend them. Put domain test helpers in
  `tests/helpers_<name>.py`. Do NOT edit `tests/conftest.py`, `main.py`, `deps.py`, `errors.py`,
  `security.py`, other agents' routers, or `docs/TEST_PARITY.md`.
- `vbx/core/*` is shared and must stay as close to the old code as possible. Prefer not to edit it.
  If a core function reads Flask state or must change, make the smallest possible edit, re-read the
  file right before editing (someone else may have changed it), and record the exact change in your
  `docs/parity/<LETTER>.md` under "Core changes".
- If you need something from another domain's API in a test (e.g. creating an account), set it up
  with direct SQL or core functions via `conftest.get_connection()` instead of waiting for it.
- `bootstrap` and `expenses` routers exist; if you believe they need a change, describe it in your
  parity file under "Requests" instead of editing them.

Porting rules:

- The old route code is the spec. Port validation, messages, defaults, ordering, rounding and
  ownership checks exactly. Old flash messages become `detail` (errors) or `message` (success).
- Read endpoints must return every number and list the old panel/template shows (read the Jinja
  template for your panel to see what is displayed and how it is derived), computed by the same
  core functions with the same arguments. Return raw numbers; formatting is the frontend's job.
  Design the JSON so a screen can be built from it without further maths.
- Every old test function in your assigned files gets a new counterpart that asserts the same
  facts through the API (old tests assert on HTML; assert on the JSON fields that carry the same
  information). Do not weaken assertions. If a test cannot be ported (purely about HTML/CSS/JS of
  the old UI), list it under "Frontend-only" with what the frontend must guarantee instead.
- Add tests for every validation branch and ownership check you port, even if the old suite had none.
- Never touch the network in tests.

Your `docs/parity/<LETTER>.md` must contain: (1) a table old test → new test for every test in your
assigned old files; (2) endpoint list with one-line descriptions; (3) Core changes; (4) Deviations
from old behaviour and why; (5) Requests / open questions; (6) anything in the old code that looks
like a bug (port it unchanged and list it here).

Before you finish: `cd backend && .venv/Scripts/python -m pytest -q` and
`.venv/Scripts/ruff check vbx tests` (+ `ruff format` on your own files only). Other agents' files may
be mid-flight; you are responsible for your own tests being green and for not breaking the 86 that
existed. Report honestly: counts, what is unverified, what failed.
