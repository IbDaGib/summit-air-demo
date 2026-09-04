# Workspace B — `/cost`

You are building the page that makes the business case. Plan section: **Workspace B**. Tasks B1–B5, in order, committing after each.

You also own `app/(dash)/_ui/format.ts` — the money/duration/percent formatters every other workspace imports. **Write it first (B1) and push it early**, because A, C and D are waiting on it. Signatures are in the plan; do not change them without saying so.

The ROI model is a pure function with tests. The defaults in the plan are deliberately conservative; the calculator lets the stakeholder change them live during the demo, which is the point — it is their numbers, not ours.

The one sentence this page exists to land: *the LLM is the smallest slice of the bill, so cost is controlled by the voice provider, not the model.* Make the breakdown table show that without the reader having to do arithmetic.

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

Route: `/cost`. Replace the stub in `app/(dash)/cost/page.tsx`.
