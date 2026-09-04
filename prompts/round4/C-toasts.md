# Workspace C — toasts on new calls, subtle polish

Plan section: **Workspace C**, in `docs/plans/2026-09-04-dashboard-round4.md`. Tasks C1–C5, in order, committing after each.

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
Replace the stub `app/(dash)/_ui/call-toaster.tsx` (`export function CallToaster() { return null }`). It is already mounted once in the layout next to `<Toaster position="bottom-right" richColors closeButton />` — do not mount either again, do not edit the layout.

Feed: `GET /api/dash/calls?since=<ISO>` → `{ calls, fetchedAt }`. Read the route to learn the row shape. Seed the cursor from the server's `fetchedAt`, not the browser clock (they can disagree).

Escalation toasts must be visibly different and stay until dismissed. Ordinary toasts auto-dismiss. The user asked for exactly this: "escalation toasts stand out".

You cannot place a phone call. To see a real toast, insert a call row directly: `npx tsx --env-file=.env.local` a one-off script that inserts into `calls` (copy a recent row's shape with `select * from calls order by started_at desc limit 1`; give it a fresh uuid and `started_at = now()`), once as an ordinary call and once with `priority = 'P0'`. Delete both rows afterwards. Say in the report exactly how you verified both toast kinds.

Polish scope is fixed by C5. Nothing on `/cost` charts, nothing on data cells, no change to the priority ramp.
