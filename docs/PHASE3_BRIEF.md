# Phase 3 brief — screens (shared by all Phase 3 agents)

Read first: `docs/ARCHITECTURE.md` (hard rules are binding), `docs/FRONTEND.md` (conventions; follow
them exactly), then the parity notes of the backend domains you consume (`docs/parity/A.md` … `E.md`:
endpoint lists, deviations, and "frontend must know" remarks). The approved look is the mockup at
`C:\Users\fotis\AppData\Local\Temp\claude\bc591df24049c261\5035edbb-98a8-4bc8-8010-798a6ae49205\scratchpad\mockup\index.html`
and the foundation's `/dev/components` page.

## What "done" means

The old app (`C:\Users\fotis\code\Vibe-Budgeting`, read-only) is the functional spec. For each old
panel in your group, read its Jinja template (`templates/panels/_*.html`, `_macros.html`), the
relevant part of `static/app.js`, and the routes. **Every piece of information the old panel shows
and every action it offers must exist in your new screen** (it may be arranged differently and
better). Before coding, write a checklist of those items in `docs/screens/<GROUP>.md`; at the end,
tick each with the component that covers it. Nothing may be dropped silently: if something truly
cannot be done, say so in that file and in your report.

Quality: the owner wants a native-app feel and a flawless result.
- Mobile first (390px), also good on desktop (1280px). Light and dark, all colour themes.
- Greek and English. Natural Greek, consistent terms with the existing dictionary.
- Forms open in `ResponsiveSheet`; lists use `ListGroup`/`ListRow`; destructive actions confirm;
  success toasts; loading skeletons; empty states; server `detail` shown inline in forms.
- After any mutation, invalidate the right queries (use `invalidateMoney()` for anything that moves
  balances) so every screen is fresh without a reload.
- Numbers come from the API. Never recompute money in the client beyond what the API returns
  (formatting only). If the API lacks a field you need, list it under "API requests" in your
  screens file; do NOT edit `backend/`.
- Accessibility: labels, focus, keyboard on desktop, 44px targets.

## Working alongside other agents

Five agents build different screen groups at once.
- Edit only: your feature folders under `src/features/`, your own i18n file
  `src/i18n/features/<GROUP>.ts` (add keys to both the El and En objects; prefix keys with your
  feature name), new files you add under `src/components/<GROUP>/` if you need group-specific shared
  pieces, your tests, and `docs/screens/<GROUP>.md`.
- Do NOT edit: `src/components/*` existing files, `src/app/*`, `src/api/*`, `src/lib/*`,
  `src/i18n/el.ts|en.ts|index.ts`, `src/index.css`, package.json, configs, or other groups' folders.
  If a shared piece needs a change or a new dependency seems necessary, write it under
  "Foundation requests" in your screens file and work around it locally for now.
- Routes already exist in `src/app/router.tsx` pointing at the page files in your folders; keep the
  same file names and default exports. If you need an extra route, list it under "Foundation requests".
- API types: `src/api/schema.d.ts` is generated and current. Use it; no hand-written response types.

## Running things

- A shared dev backend runs at `http://127.0.0.1:5001` with a throwaway database. Do not restart or
  kill it. Register your own user (e.g. `agent_<group>_<random>`) and create your own data through
  the API/UI. Never point anything at a real database.
- Start your own Vite dev server on YOUR port (given in your task) with
  `npm run dev -- --port <port> --strictPort`; stop it when you finish.
- Look at your screens with Playwright (Chromium is installed) at 390×844 and 1280×800, light and
  dark, with realistic data (many rows, long names, negative numbers, zero/empty states, Greek text).
  Inspect the screenshots critically and fix what is off. Save final ones under
  `frontend/screenshots/<GROUP>/`.
- Tests: Vitest tests for logic and for each form's validation/submit mapping (mock the api client);
  put Playwright flows for your group in `frontend/e2e/<GROUP>.spec.ts`, written to run against the
  real backend through your dev server (register a fresh user in the test, exercise each main flow:
  create, edit, delete, filters), and run them.
- Before finishing: `npm run build`, `npm run lint`, `npm test` must pass. Other groups' in-flight
  files may break the build momentarily; retry, and report if someone else's file is the cause.
- Do not git commit.

## Report

Reply with: what screens exist, the ticked checklist summary (count covered / total, and anything not
covered), API requests, foundation requests, test counts, screenshot folder, and anything unverified.
