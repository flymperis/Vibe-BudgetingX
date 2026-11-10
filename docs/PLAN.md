# Plan

Orchestrated in phases. Each task is done by one agent on its own files; the orchestrator reviews,
runs the full test suite and commits between phases.

## Phase 1 — foundations (parallel)
- Backend foundation: `vbx.core` copied from the old app, FastAPI skeleton, auth, bootstrap,
  expenses, test fixtures, `docs/TEST_PARITY.md` listing every old test.
- Frontend foundation: Vite/React/shadcn shell, design system, building blocks, auth pages.

## Phase 2 — backend domains (parallel, one router + schemas + tests each)
- A: income, categories (expense + income), accounts, credit cards, transfers, recurring.
- B: budget; home/summary/yearly read endpoints.
- C: shared expenses (people, groups, bills, settlements, record/unrecord).
- D: investments (stocks, crypto, search, prices), reports (overview, spending, tags, investments).
- E: settings/integrations (Ollama, Telegram config, link codes, notification prefs),
  Excel export/import, background jobs (Telegram poller, notifications, nightly backup).

## Phase 3 — screens (parallel, one feature folder each), typed from the real OpenAPI
- Home + Expenses + Income + add/edit sheets.
- Accounts/transfers/recurring/categories/settings.
- Budget + summary + yearly.
- Shared.
- Investments + reports.

## Phase 4 — proof
- Differential tests: same actions through the old Flask app and the new API on two copies of one
  database, then compare tables and computed numbers.
- Playwright end-to-end flows on a temporary database.
- Independent review of `vbx.core` diffs against the old modules.
- Docker image; container on port 5001 with a copy of the production backup; Telegram poller off
  (the old app keeps the bot until switch-over).

## Switch-over (later, with the owner)
- Backup, stop old container, start new one on the same data folder with jobs enabled.
