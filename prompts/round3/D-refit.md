# Workspace D — refit `/calls`, `/calls/[id]`, `/schedule` onto shadcn

You are refitting the three existing operator pages. Plan section: **Workspace D**. Tasks D1–D3, in order, committing after each.

**You are the only workspace that edits existing pages, so you merge last.** Rebase on main before opening your PR; A, B and C may have landed `_ui/format.ts` and screenshots by then.

Preserve behaviour exactly: the 3-second poll on the calls list, the DST-tested time helpers, the thermal ramp, the transcript turn split, the tool trace. This is a visual refit, not a rewrite — if a diff changes what the page *does*, stop and reconsider.

Delete `app/(dash)/_ui/nav-link.tsx`; the sidebar replaced it. Confirm nothing else imports it first.

## Read first
- `docs/plans/2026-09-04-shadcn-dashboard.md` — your task is one section of it. Follow it; the code and file paths in it are the spec.
- `app/(dash)/_data/metrics.ts` — the data contract. **Owned by main. Do not edit.** Every number on your page comes from these functions. If you need a number it does not provide, add a local helper in your own folder and note it in your report — do not add SQL to your page.
- `app/(dash)/_ui/priority.tsx`, `outcome.tsx`, `time.ts` — reuse these. Do not invent a second colour palette or a second time formatter.
- `components/ui/*` — the shadcn set is already installed. Do not run `shadcn add` for anything else without saying so.

## Rules
- Do **not** modify: `app/(dash)/layout.tsx`, `_ui/sidebar-nav.tsx`, `_data/*`, `agent/**`, `app/api/**`, `db/**`, `package.json`, or any file in another workspace's folder.
- Server components by default. `"use client"` only where there is state or a recharts chart.
- Colours only via tokens (`--chart-1..5`, the thermal ramp from `priority.tsx`). No hex.
- `tabular-nums` on every column of digits.
- Every card must render an honest empty state at zero data.
- Write the tests the plan asks for **first**, watch them fail, then implement.

## Validate before you report
```
npx next typegen && npx tsc --noEmit && npx vitest run app && npm run build
```
All four must pass. Paste the real output. Take a screenshot of your route at `http://localhost:3000/<route>?key=$DASH_SECRET` (the value is in `.env.local`) and save it to `docs/screenshots/<route>.png`. Then commit, push, and open a PR titled with your workspace letter.

Routes: `/calls`, `/calls/[id]`, `/schedule`. Also run `npx vitest run "app/(dash)/_ui"` — the DST tests must still pass.

## Note added after main moved
`CallOutcome` gained `"no_outcome"` (ended call, null outcome) and `_data/client.ts` now maps
null → `in_progress` only while `ended_at` is null. `_ui/outcome.tsx` has the chip. Preserve
this in the refit — the old behaviour showed eight ended calls as "In progress".
