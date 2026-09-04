# Workspace A — `/schedule` cycles through weeks

Plan section: **Workspace A**, in `docs/plans/2026-09-04-dashboard-round4.md`. Tasks A1–A5, in order, committing after each.

## Read first
- `docs/plans/2026-09-04-dashboard-round4.md` — your task is one section of it. The contract at the top is already on `main`; use it, do not re-implement it.
- `AGENTS.md` — this is Next 16. Read `node_modules/next/dist/docs/` for anything you are unsure about (`searchParams` is a Promise; `proxy.ts`, not middleware; run `npx next typegen` before `tsc`).
- `app/(dash)/_data/metrics.ts`, `_data/mutations.ts`, `_data/client.ts` — the data contract. **Owned by main. Do not edit.**
- `app/(dash)/_ui/priority.tsx`, `time.ts`, `format.ts` — reuse; no second palette, no second time formatter.
- `components/ui/*` — shadcn is installed (badge button card chart input label scroll-area select separator sheet sidebar skeleton sonner table tabs tooltip). Do not run `shadcn add` without saying so in your report.

## Rules
- Do **not** modify anything outside your folder except the files your plan section names. Never: `app/(dash)/layout.tsx`, `_data/*`, `agent/**`, `app/api/**`, `db/**`, `proxy.ts`, `package.json`.
- Server components by default; `"use client"` only where there is state.
- Colours only via tokens and the thermal ramp. No hex. `tabular-nums` on digits.
- Every state renders honestly at zero data.
- Tests first for the pure module your section names; watch them fail, then implement.
- Animations subtle: `tw-animate-css` classes, ≤300ms, no layout shift.

## Validate before you report
```
npx next typegen; npx tsc --noEmit; npx vitest run app; npm run build
```
Run them one at a time and check each exit code — a `set -e` script with `&&` lists does not stop on failure. All four must pass; paste the real output. Take a screenshot at `http://localhost:3000/<route>?key=$DASH_SECRET` (value in `.env.local`) and save to `docs/screenshots/<route>.png`. Commit, push, open a PR titled with your workspace letter.

## Report
End with: what you built, what you deliberately did not do, anything you touched outside your folder and why, and any contract gap you worked around locally.

## Specifics
Route: `/schedule`. Today the page shows "next 5 days from today" using `denverInstant(0..5, …)`. It becomes Mon–Fri of a chosen week, keyed by `?week=YYYY-MM-DD` (a Monday, Denver). The week helpers live in `week.ts` and are pure so they can be tested with fixed `now` values — including a `now` on Sunday, and weeks that cross the 2026 DST changes (Mar 8, Nov 1), where `denverInstant` must keep the 00:00 boundary honest.

The current data is bookings on Tue 8 Sep 2026 — so "this week" (Sep 7–11) has content and both neighbours are empty. Both must look intentional.

Do not touch `proxy.ts`: `/schedule/:path*` already covers the query string.
