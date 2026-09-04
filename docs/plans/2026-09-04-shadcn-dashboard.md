# Client-Facing Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn the operator dashboard into something a Summit Air stakeholder can be screen-shared — cost, ROI, after-hours coverage, the dispatch work queue — on shadcn/ui, without touching the phone call path.

**Architecture:** Additive. Four new-or-refit pages under `app/(dash)/`, each owned by one workspace, all reading from one shared metrics module (`app/(dash)/_data/metrics.ts`, owned by main, already written and verified against Neon). The shell (shadcn `Sidebar`, `TooltipProvider`, forced-dark) and route stubs are already on `main`, so no two workspaces edit the same file. Nothing under `agent/`, `app/api/vapi/`, or `db/` changes.

**Tech Stack:** Next 16 App Router · React 19 · Tailwind v4 · shadcn/ui (radix-nova style, `components/ui/*`) · recharts via `components/ui/chart.tsx` · lucide-react · Neon via `db/neon.ts`.

**Time box:** ~10 hours to demo. Every task ships something demoable on its own. If a task runs long, ship what renders and log the rest in `KNOWN_ISSUES.md`.

---

## Ground truth you must not re-derive

Already on `main`. Read, do not rewrite:

| Thing | Where | Notes |
|---|---|---|
| Metrics contract | `app/(dash)/_data/metrics.ts` | 11 typed async functions, one SQL each, verified against Neon. Empty-but-valid shapes when `DATABASE_URL` is unset. |
| Dashboard row types | `app/(dash)/_data/types.ts`, `client.ts` | `listCalls`, `getCall`, `listTechs`, `listBookings`. |
| Time helpers | `app/(dash)/_ui/time.ts` | `denverInstant`, `denverDayKey`, formatting pinned to America/Denver. DST-tested. |
| Priority + outcome chips | `app/(dash)/_ui/priority.tsx`, `outcome.tsx` | Thermal ramp: P0 ember → P3 slate. Reuse; do not invent a second palette. |
| Shell | `app/(dash)/layout.tsx`, `_ui/sidebar-nav.tsx` | shadcn Sidebar, two groups: Operations / For Summit Air. Forced dark via `.dark`. |
| shadcn components | `components/ui/` | button card badge table tabs separator skeleton tooltip sidebar sheet input label select **chart** scroll-area |
| Auth | `proxy.ts` | Shared secret via `?key=` → cookie. New routes are covered automatically. |

**Measured numbers to anchor copy** (from real calls, tonight): 10 calls, $1.04 total, **$0.10/call**, **$0.078/min**, avg 80s, cost-per-booking $0.16, **100% after-hours** (every test call was made at night — say so honestly), 6 techs at 30–50% utilisation over the next 5 business days.

**Design rules** (apply to every page):
- Dark, dense, legible. Operator tool first; stakeholder pages get more whitespace but no hero.
- Semantic colour is the thermal ramp only. Charts use `--chart-1..5` tokens via `ChartConfig`. Never hard-code hex.
- `font-variant-numeric: tabular-nums` (`tabular-nums` class) on every column of digits.
- Every number that is money renders through one formatter; every duration through one formatter. Put them in `app/(dash)/_ui/format.ts` (Workspace B creates it in Task B1; A, C, D import it — if it is not there yet, add a local `_format.ts` with the same signatures and leave a `TODO(swap)`).
- Empty state on every card: with zero data the page must still read as intentional, not broken.
- No `"use client"` unless the component has state or a chart. Pages are server components that await metrics.

---

## Task 0 — Shell and contract (DONE on main, listed for context)

- `npx shadcn init -b radix --defaults` + 15 components
- `app/(dash)/_data/metrics.ts` — verified
- `app/(dash)/layout.tsx` — Sidebar shell, `TooltipProvider`
- Stub pages: `/overview`, `/cost`, `/queue`
- `npm run build` green

---

## Workspace A — `/overview` (stakeholder landing page)

**Files:**
- Replace: `app/(dash)/overview/page.tsx`
- Create: `app/(dash)/overview/kpi-tile.tsx`, `app/(dash)/overview/volume-chart.tsx` (client), `app/(dash)/overview/priority-donut.tsx` (client)
- Test: `app/(dash)/overview/kpi.test.ts`

**Reads:** `getCallVolume`, `getPriorityMix`, `getAfterHoursShare`, `getCostSummary`, `getDailySeries(14)`, `getTownBreakdown`

### A1 — KPI derivations, test-first

**Step 1: write the failing test** — `app/(dash)/overview/kpi.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { bookingRate, escalationRate } from "./kpi";

describe("kpi derivations", () => {
  it("booking rate is booked / calls with an outcome, not / total", () => {
    expect(bookingRate({ total: 10, booked: 1, escalated: 0, callback: 1, unresolved: 8 })).toBeCloseTo(0.5);
  });
  it("is 0 with no resolved calls rather than NaN", () => {
    expect(bookingRate({ total: 3, booked: 0, escalated: 0, callback: 0, unresolved: 3 })).toBe(0);
  });
  it("escalation rate counts escalated over total", () => {
    expect(escalationRate({ total: 4, booked: 1, escalated: 1, callback: 1, unresolved: 1 })).toBeCloseTo(0.25);
  });
});
```
**Step 2:** `npx vitest run app/\(dash\)/overview` → FAIL (module not found)
**Step 3:** create `app/(dash)/overview/kpi.ts`:
```ts
import type { CallVolume } from "../_data/metrics";
/** Booked over calls that reached an outcome. Unresolved calls are not failures to book; they never got that far. */
export function bookingRate(v: CallVolume): number {
  const resolved = v.booked + v.escalated + v.callback;
  return resolved === 0 ? 0 : v.booked / resolved;
}
export function escalationRate(v: CallVolume): number {
  return v.total === 0 ? 0 : v.escalated / v.total;
}
```
**Step 4:** run → PASS. **Step 5:** `git commit -m "overview: kpi derivations"`

### A2 — KPI tiles row
`kpi-tile.tsx`: `Card` with `CardDescription` (label, uppercase, tracking-wide, `text-muted-foreground`), a big `tabular-nums` value, and an optional one-line footnote. Six tiles: **Calls answered**, **Booked** (with rate), **Escalated (safety)**, **After-hours %** (footnote: "calls outside 8–5 Mountain, Mon–Fri"), **Avg cost / call**, **Cost per booking**. Grid `grid-cols-2 lg:grid-cols-3 xl:grid-cols-6`.
Commit.

### A3 — Volume chart (client)
`volume-chart.tsx`: `"use client"`, recharts `BarChart` inside `ChartContainer`, stacked bars booked/escalated/other per day from `getDailySeries(14)`. `ChartConfig` with `booked`, `escalated`, `other` → `var(--chart-1..3)`. `ChartTooltipContent`. Pass data as a prop from the server page.
Commit.

### A4 — Priority mix + towns
`priority-donut.tsx`: recharts `PieChart` with the four tiers, colours from `_ui/priority.tsx` tokens (import the same CSS variables; do not redefine). Beside it a compact `Table` of `getTownBreakdown()`: town, county, calls, booked.
Commit.

### A5 — Page assembly
`page.tsx` is a server component: `await Promise.all([...])`, then tiles → chart → (donut | towns) grid. `Skeleton` is not needed (server-rendered). Add one line under the title: *"Figures are from real test calls against the live agent. All customer data is mock."*

**Validate:** `npx next typegen && npx tsc --noEmit && npx vitest run app && npm run build`. Screenshot `/overview` with the key in the URL. Commit, push, open PR.

---

## Workspace B — `/cost` (cost model + ROI calculator)

**Files:**
- Replace: `app/(dash)/cost/page.tsx`
- Create: `app/(dash)/_ui/format.ts`, `app/(dash)/cost/roi.ts`, `app/(dash)/cost/roi-calculator.tsx` (client), `app/(dash)/cost/cost-breakdown.tsx`
- Test: `app/(dash)/_ui/format.test.ts`, `app/(dash)/cost/roi.test.ts`

**Reads:** `getCostSummary`, `getDailySeries(30)`, `getAfterHoursShare`

### B1 — Formatters, test-first
`format.ts` exports `usd(n, opts?)` (`$0.10`, `$1,040`), `usdPerUnit(n, unit)` (`$0.078 / min`), `pct(n)` (`100%`, one decimal below 10), `duration(seconds)` (`1m 20s`). Tests for each including zero and null. Commit.

### B2 — ROI model, test-first (pure, no DB)
`roi.ts`:
```ts
export interface RoiInputs {
  callsPerMonth: number;          // default 600 — a 40-tech shop
  missedCallRate: number;         // 0–1, default 0.25 during peaks
  bookingRateOnAnswered: number;  // 0–1, default 0.55
  avgTicketUsd: number;           // default 425
  installLeadRate: number;        // share of booked that become install leads, default 0.05
  avgInstallUsd: number;          // default 9500
  agentCostPerCallUsd: number;    // default from getCostSummary().avgPerCallUsd
  afterHoursShare: number;        // 0–1, from getAfterHoursShare().pct/100
}
export interface RoiOutputs {
  missedCallsPerMonth: number;
  recoveredBookingsPerMonth: number;
  recoveredServiceRevenueUsd: number;
  recoveredInstallRevenueUsd: number;
  agentMonthlyCostUsd: number;
  netMonthlyUsd: number;
  paybackCalls: number;           // calls until agent cost is covered by one recovered ticket
}
export function computeRoi(i: RoiInputs): RoiOutputs
```
Tests: defaults produce positive net; zero missed-call rate → zero recovered revenue; agent cost scales linearly with calls; `paybackCalls` = `ceil(avgTicketUsd / agentCostPerCallUsd)`. Commit.

### B3 — Cost breakdown card
`cost-breakdown.tsx` (server): a `Table` with the measured numbers from `getCostSummary()` — calls, total, avg/call, avg/min, avg duration, cost per booking — plus a static "where the money goes" row set: platform+telephony ~70%, TTS ~15%, LLM ~15%, extraction <1%. Footnote: *"Measured from Vapi's per-call cost on real test calls. The LLM is the smallest slice — changing the voice provider moves the bill; changing the model does not."* Commit.

### B4 — ROI calculator (client)
`roi-calculator.tsx`: `"use client"`, `useState` on `RoiInputs` seeded from server props. Left column: `Label` + `Input type=number` for each input (six visible; agent cost and after-hours share shown read-only as "measured"). Right column: `Card`s for recovered bookings/month, recovered revenue/month (service + install), agent cost/month, **net/month** large. A `Badge` reading *"Assumptions — edit any number"*. Recompute on change. Commit.

### B5 — Page assembly
Title, one-paragraph framing: *"The case is not labour substitution, it is recovered revenue: a missed call during the first cold snap is a lost $300–500 ticket or an $8–12k install lead."* Then breakdown → calculator → a small 30-day cost line chart (`ChartContainer` + `LineChart` on `getDailySeries(30).costUsd`).

**Validate:** as A. Screenshot. PR.

---

## Workspace C — `/queue` (dispatch work queue)

**Files:**
- Replace: `app/(dash)/queue/page.tsx`
- Create: `app/(dash)/queue/followups.tsx`, `app/(dash)/queue/callbacks.tsx`, `app/(dash)/queue/safety.tsx`, `app/(dash)/queue/utilization.tsx`
- Test: `app/(dash)/queue/sort.test.ts`

**Reads:** `getFollowupQueue`, `getCallbackQueue`, `getSafetyIncidents`, `getTechUtilization`

### C1 — Queue ordering, test-first
`sort.ts`: `sortFollowups(items)` — P0 first, then P1…P3, then untiered; within a tier newest first. Test with a shuffled fixture. Commit.

### C2 — Three tabs
`page.tsx` server component fetches all four; `Tabs` with **Needs a human** (count badge), **Callbacks** (count of unresolved), **Safety incidents** (count; if 0, an explicit "No safety incidents recorded" empty state — this is a good zero). Each tab is a `Table`. Follow-ups: time (Denver), caller, town, priority chip, reason, summary; row links to `/calls/[id]`. Callbacks: created, name, **phone** (this column is the point — see PR #5), reason, notes, resolved badge. Commit.

### C3 — Tech utilisation strip
`utilization.tsx`: one row per tech — name, county, on-call `Badge`, a thin progress bar (`div` with width %, colour from `--chart-2`), `booked/capacity` in `tabular-nums`. Footnote: *"Next five business days, four two-hour windows per day."* Commit.

**Validate:** as A. PR.

---

## Workspace D — refit the existing pages onto shadcn

**Files:**
- Modify: `app/(dash)/calls/page.tsx`, `calls/calls-table.tsx`, `calls/[id]/page.tsx`, `schedule/page.tsx`
- Do **not** modify: `layout.tsx`, `_ui/sidebar-nav.tsx`, `_data/*`, anything another workspace creates
- Delete: `app/(dash)/_ui/nav-link.tsx` (superseded by the sidebar)

### D1 — Calls list → shadcn `Table`
Keep the 3s poll in `calls-table.tsx`. Replace bespoke markup with `Table*`, keep `PriorityChip` and `OutcomeChip`. Add a `Badge` "live" with a pulsing dot while polling. Commit.

### D2 — Call detail → `Tabs`
`calls/[id]/page.tsx`: header `Card` with caller, town, priority + `priorityResult.reason`, outcome, sentiment `Badge`, duration, cost. Then `Tabs`: **Transcript** (existing turn list), **Tool trace** (`Table`: tool, args, result, ms, forced-escalation badge), **Ticket** (summary, requested, tech notes, followup reason). Commit.

### D3 — Schedule → `Card` grid
Keep the existing grid logic and `denverInstant`; wrap in `Card`, use `Badge` for priorities, `Tooltip` on a booking cell showing customer + issue. Commit.

**Validate:** as A, plus `npx vitest run app/\(dash\)/_ui` (time tests must still pass). PR. **Merge D last.**

---

## Merge order and gates

1. A, B, C in any order — disjoint files.
2. D last — it touches existing pages.
3. Each PR: CI green (`typegen → tsc → vitest`), Greptile ≥ 4/5 or findings addressed, `npm run build` output pasted.
4. After all four: one screenshot per route into `docs/screenshots/`, README "Dashboard" section listing the five routes.

## Out of scope (say so if asked)
Realtime subscriptions (polling is fine), auth beyond the shared secret, editing anything from the dashboard, exporting, date-range pickers (30 days is all the data there is), mobile layout beyond "does not break".
