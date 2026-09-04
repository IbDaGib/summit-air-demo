# Workspace A — `/overview`

You are building the page a Summit Air stakeholder sees first when the dashboard is screen-shared. Plan section: **Workspace A**. Tasks A1–A5, in order, committing after each.

The measured numbers you are rendering, so you know what "right" looks like: 10 calls, $1.04 total, $0.10 per call, 80s average, 1 booked, 100% after-hours. Small numbers — the tiles must look intentional at this scale, not sparse.

Note on `unresolved`: 8 of 10 calls have no recorded outcome. That is honest (they were early test calls before outcome recording existed). Label it plainly — "no recorded outcome" — never hide it or fold it into another bucket.

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

Route: `/overview`. Replace the stub in `app/(dash)/overview/page.tsx`.
