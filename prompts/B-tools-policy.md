# Workspace B — tool handlers and priority policy

The most important workspace. Implement `agent/tools/handlers/*` and
`agent/policy/*` against the contracts in `agent/tools/schemas.ts` and
`agent/policy/types.ts`.

**Both of those files are owned by main. Do not edit them.** The eval harness and
the Vapi webhook both compile against them; changing a shape breaks two other
workspaces.

## Build

### `agent/policy/priority.ts` — the centerpiece
```ts
export function computePriority(facts: SituationFacts, now: Date): PriorityResult
```
- **Pure.** No I/O, no LLM, no `new Date()` inside — `now` is a parameter.
- Rules, highest wins:
  - `hazard !== "none"` → **P0**, `blockBooking: true`.
  - `systemDown` + `no_heat` + (`vulnerableOccupant` or `outdoorTempF <= 32`) → **P1**.
    Below freezing is urgent even with nobody vulnerable — frozen pipes.
  - `systemDown` + `no_cooling` + `vulnerableOccupant` → **P1**.
  - `commercial` + `revenueStopped` → **P1**.
  - `systemDown`, no aggravating factor → **P2**.
  - `maintenance` / `install_quote` → **P3**.
- `reason` explains the tier in one sentence for the dispatch ticket.
- **Never infer season from the calendar month.** Urgency comes from
  `outdoorTempF` and what the caller reports. The demo is in September and the
  scenario is January.

### `agent/policy/serviceArea.ts`
Town → county lookup. Gallatin: Bozeman, Belgrade, Manhattan, Three Forks, Big Sky.
Park: Livingston. Madison: Ennis, West Yellowstone. Normalize case and whitespace,
tolerate common misspellings from speech-to-text (`Boseman`, `Belgrad`).

### `agent/policy/safetyScan.ts`
```ts
export function scanForHazard(utterance: string): Hazard
```
A deterministic keyword scan — gas, propane, rotten eggs, carbon monoxide, CO
alarm, smoke, burning. **This is a backstop that does not depend on the model
following instructions.** The runtime calls it on every caller turn and forces
escalation on a hit. Include the negation cases you can cheaply catch
("no gas smell", "the smoke detector needs batteries").

### `agent/tools/handlers/*`
One file per tool, implementing the matching method on `ToolHandlers`. Use
`db/client.ts` if it exists; if Workspace A hasn't landed, code against
`db/types.ts` and leave the query. `book_appointment` must catch the Postgres
exclusion-violation error (code `23P01`) and return
`{ status: "conflict", alternatives }` — never throw into the call.

## Tests — required
`agent/policy/priority.test.ts` covering: gas smell; no heat + elderly; no heat at
25°F with nobody vulnerable; commercial restaurant down; routine tune-up; and a
caller who *says* it's an emergency but whose facts are routine.
Plus `agent/policy/safetyScan.test.ts` including the negation cases.

## Constraints
Do not touch `db/migrations/**`, `app/**`, `evals/**`, `package.json`,
`agent/tools/schemas.ts`, `agent/policy/types.ts`, or anything in `agent/prompt/`.

## Validate
`npx vitest run agent` and `npx tsc --noEmit` both pass. Paste the test output.
