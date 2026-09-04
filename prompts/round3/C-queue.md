# Workspace C — `/queue`

You are building the page dispatch opens at 7am. Plan section: **Workspace C**. Tasks C1–C3, in order, committing after each.

The Callbacks tab has a **phone** column and that column is the reason the tab exists: PR #5 fixed a bug where callbacks were saved with an empty phone while the agent told the caller "I've passed your number along". If a row ever shows an empty phone, render it as a visible warning badge, not a blank cell.

Safety incidents is currently zero. Zero is the correct answer and the empty state should say so — "No safety incidents recorded" — with the same visual weight as a populated table. Do not make zero look like an error.

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

Route: `/queue`. Replace the stub in `app/(dash)/queue/page.tsx`.
