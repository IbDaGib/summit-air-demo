# Summit Air — AI inbound phone agent

An AI agent that answers Summit Air's inbound line, works out what's wrong with the
caller's HVAC system, separates a routine tune-up from a no-heat emergency, and either
books a service call or escalates a safety situation — then hands dispatch a clean,
prioritised ticket.

> **Summit Air here is the fictional company from the case study. All data is mock.**

**Call it:** `+1 (603) 441-7065`

Try these three, in order:

| Say this | What should happen |
|---|---|
| "I need my furnace looked at before winter" | Intake, then a booked arrival window |
| "My furnace won't turn on and I smell gas" | Immediate escalation. **No appointment.** |
| "No heat, and there's a gas smell in the basement" | Also escalates — see [the negation bug](#the-bug-worth-reading-about) |

---

## Architecture

```mermaid
flowchart TB
    Caller([caller]) -->|PSTN| Vapi[Vapi<br/>telephony · STT · TTS · VAD · barge-in]
    Vapi -->|tool calls| Tools["/api/vapi/tools"]
    Vapi -->|end-of-call-report| Events["/api/vapi/events"]
    Vapi <-->|inference| LLM[openai · gpt-5.6-luna]

    Tools --> Guard[guard.ts<br/>deterministic hazard scan]
    Tools --> State[callState.ts<br/>caller ID · escalation lock]
    Guard --> Handlers
    State --> Handlers
    Handlers[agent/tools/handlers] --> Policy[agent/policy<br/>priority · serviceArea · scheduling]
    Handlers --> Repo[(DispatchRepository)]
    Repo --> Neon[(Neon Postgres<br/>EXCLUDE constraint)]

    Events --> Extract[postcall/extract.ts<br/>magistral-medium-latest]
    Extract --> Neon
    Neon --> Dash["/calls · /schedule"]

    Evals[evals/] -.->|same prompt, same tools, same guards| Handlers
```

`agent/` is the product. `app/` is plumbing. **Nothing under `agent/` imports Vapi** — which
is what lets the eval harness drive the same prompt, the same tool schemas, and the same
guards that the phone drives.

### Four invariants, enforced rather than hoped for

**1. The model never chooses the priority.** It reports *facts* — `no_heat`, `systemDown`,
`vulnerableOccupant`, `town`. A pure function turns facts into P0–P3 with a reason string.
`computePriority(facts, now)` takes the clock as a parameter, does no I/O, and never reads
`getMonth()`. The answer to *"how do you know it won't miss an emergency?"* is a test, not a
vibe.

**2. Life safety doesn't depend on the model following instructions.** `guard.ts` scans every
tool call's free-text fields for gas, propane, rotten eggs, CO, smoke and burning, splitting
on clause boundaries so a hazard in the second half of a sentence still lands. On a hit it
forces the escalation path regardless of what the model decided.

**3. Escalation is terminal.** Per-call state keyed on Vapi's call id blocks `find_slots` and
`book_appointment` after any escalation, forced or model-initiated, and hands the model
guidance to take a callback number and end the call. The model isn't asked to remember —
and can't lie about it.

**4. Double-booking is impossible at the database level.**

```sql
constraint bookings_no_overlap
  exclude using gist (tech_id with =, arrival_window with &&)
  where (status <> 'cancelled')
```

Not guarded against in application code — *refused by Postgres*. `db/checks/no_overlap.sql`
proves it with four cases, including the back-to-back window that shows the constraint isn't
simply rejecting everything. A lost race surfaces as `SQLSTATE 23P01`, which the handler
turns into "that window just went — I can do this instead" rather than a 500 on a live call.

### Caller identity comes from the carrier

`lookup_customer` ignores whatever phone number the model passes and uses
`message.call.customer.number`. This is not theoretical: on the first working call the model
invented `phone: "unknown"`, which normalised to `""`, and `"...".endsWith("")` is always
true — so the agent greeted a stranger as *"Dave, is this you at 412 Cottonwood Road?"*,
gate code included.

---

## Prompting

Composed from four files, **safety first**, so the hard rules sit at the top of the
assembled prompt rather than buried under conversational instructions.

| File | Carries |
|---|---|
| `prompt/safety.ts` | Hard stops. Gas, CO, smoke, medical. No firm prices. No injection compliance. |
| `prompt/identity.ts` | Casey — a warm dispatcher, explicitly *not* a salesperson. Discloses AI + recording. |
| `prompt/objectives.ts` | Required fields, tool order, and the rule that a failed tool never becomes a fake booking. |
| `prompt/style.ts` | Two sentences per turn. One question. Numbers as words. Read the address back. |

Two deliberate choices:

**The repo is the source of truth, and drift is the failure mode.** `scripts/deploy-assistant.ts`
pushes the prompt, all eight tool schemas, the model, the voice, the transcriber, endpointing and
`serverMessages`. Iterating on wording in the Vapi dashboard is fine and fast — but port it back
and redeploy before doing anything else. Three times during this build a dashboard edit created a
problem: one cleared `serverMessages` and left the tool URLs pointing at a laptop tunnel, one
pasted authoring notes into `firstMessage` so the caller heard "Seasonal variants, swap the last
line if you want a warmer open" read aloud, and one silently reverted the prompt and dropped the
rule that stops the model speaking its own tool calls.

**Static prompt deploys to Vapi; per-turn state is meant to be appended by the runtime** —
local time, outdoor temperature, known-customer record, and the still-needed field list, so
the model never has to remember what it already collected. See
[Known limitations](#known-limitations) for where this currently stops short.

**No month-based seasonality anywhere.** Urgency derives from reported conditions and
outdoor temperature. This demo runs in September and the canonical scenario is January; a
`getMonth()` check would fail live.

---

## Stack, and what each choice beat

| Layer | Choice | Why | Rejected |
|---|---|---|---|
| Voice pipeline | **Vapi** | Buys VAD, endpointing, barge-in, turn-taking — the commodity layer | LiveKit/Pipecat + Twilio SIP: better control, 2–3 days owning interruption handling |
| Agent config | **Vapi native model config** | Prompt and tools live in the repo, pushed by `scripts/deploy-assistant.ts` | Custom LLM endpoint: full request-body control, but unbounded SSE risk on a one-day build |
| Call model | **`openai / gpt-5.6-luna`** | Chosen on measured call quality. Mistral Medium read its own tool call aloud on a live call and the caller hung up | `mistral-medium-latest` — verified working and still a one-env-var swap; `mistral-large-latest` returns 403 `tier_not_allowed` on lower tiers |
| Offline model | **`magistral-medium-latest`** (Mistral) | Extraction and the eval judge. Now a genuinely **cross-family** judge, since the call runs on OpenAI — a judge should not be the family it scores | Judging with the calling model, which invites self-preference bias |
| Data | **Neon Postgres** | Transactions, `btree_gist`, exclusion constraints | Supabase — outaged mid-build; the migration moved unchanged |
| Scheduling | **`EXCLUDE USING gist`** | The database refuses double-booking | Google Calendar OAuth; app-level checks that race |
| Evals | **Vitest + simulated caller + LLM judge** | Same repo, no vendor account, runs in CI | Promptfoo, Braintrust — config and accounts to learn |

**Config lives in the repo, not the dashboard.** `scripts/deploy-assistant.ts` pushes the
prompt, all eight tool schemas, the model, the voice, endpointing, and `serverMessages`. The
only thing ever set by hand is the Mistral provider credential. This matters more than it
sounds: a hand-edit to the Vapi dashboard mid-build set the events URL to a bare origin,
cleared `serverMessages`, and left the eight tool URLs pointing at a laptop tunnel — a demo
that works until the laptop sleeps. Redeploying from the repo fixed all three at once.

---

## Evals

Five scenarios — gas smell, no-heat-plus-elderly, routine maintenance, out-of-area,
adversarial — each run three times, driving the **real** prompt, tool schemas, guards and
handlers. A simulated caller reveals facts only when asked.

**Hard assertions gate the build. Judge scores trend.** A judge's 1–5 is stochastic; gating
on it produces a flaky build, so no test asserts on a judge number. The gate is: did
`escalate_emergency` fire, was `book_appointment` correctly refused, were required fields
collected, did it stay inside the turn budget.

Results are keyed to the git SHA and a hash of the prompt, so a regression is a diff between
two runs rather than a memory.

```bash
npx vitest run evals
```

---

## Cost

Measured on real calls, not estimated:

| Component | Per 4-minute call |
|---|---|
| Vapi platform + STT + TTS + telephony | ~$0.33 |
| `gpt-5.6-luna` (~2,900 prompt tokens/turn) | ~$0.05 |
| Post-call extraction (~400 in / 70 out) | ~$0.01 |
| **Total** | **~$0.38** |

A 92-second call cost **$0.1456** end to end — about **$0.095/min**.

The useful shape of that: **the LLM is roughly 15% of the bill.** Voice synthesis and the
platform fee are ~70%. If Summit Air asked to cut cost, the answer is a different TTS
provider, not a smaller model.

The case isn't labour substitution, it's recovered revenue. A missed call during the first
cold snap is a lost $300–500 service ticket or an $8–12k install lead. Fifteen missed calls
on one bad afternoon pays for the year.

---

## The bug worth reading about

The deterministic safety scan had a hole. This did **not** escalate:

> *"No heat, and there's a gas smell in the basement"*

The negation window spanned the comma, read *"No"* as negating the gas smell, and stayed
silent — on the single most likely phrasing on a real HVAC call. "No heat" is what
everybody says.

Three fixes, each with a regression test: complaint phrases (`no heat`, `no cooling`,
`won't fire`) no longer act as negators; negation cannot cross a clause boundary; and every
clause is checked independently rather than just the first match.

It's here because it's the shape of bug that matters in this system — not a crash, not a
type error, but a safety feature that silently does nothing on the exact input it exists
for. Found by a subagent writing its own scanner, then confirmed present in the shared one.

---

## Known limitations

Honest list. See `KNOWN_ISSUES.md` for the rest.

- **`turnContext()` is not reaching the model.** Vapi's native model config owns the message
  array, so local time, outdoor temperature and the still-needed field list are written but
  never injected. Context currently rides in tool results instead. The fix is the custom LLM
  endpoint, which was deferred as unbounded risk on a one-day build — this is the first thing
  I'd change.
- **No weather source.** `outdoorTempF` has no supplier, so the freezing-pipes branch of the
  priority policy only fires when `DEMO_FORCE_OUTDOOR_TEMP_F` is set.
- **Per-call state is in-memory**, so it does not survive a serverless cold start. Adequate
  for one call, which is its whole lifetime; it belongs in the `calls` row.
- **No SMS confirmation.** A2P 10DLC registration takes days.
- **No rescheduling or cancellation** — captured as a callback for a human.
- **Free-tier phone number** is a 603 area code, not Montana's 406. In production you'd port
  their existing number over SIP so customers keep dialling what's on the truck.

---

## Running it

```bash
npm install
cp .env.example .env.local          # then fill it in

npx tsx --env-file=.env.local scripts/apply-migrations.mts   # schema + RPC
npx tsx --env-file=.env.local db/seed.ts                     # 6 techs, 14 customers, 66 bookings
npx tsx --env-file=.env.local scripts/deploy-assistant.ts    # push config to Vapi

npm run dev
npx vitest run                       # 173 tests
```

Dashboard is at `/calls`, `/calls/[id]` (transcript + tool trace) and `/schedule`, behind a
shared secret in `DASH_SECRET`.

---

## How this was built

Four Claude Code subagents in isolated git worktrees, each with a written brief naming the
files it owned and the files it must not touch, plus a validation command it had to run
before reporting done. The contract they built against — `agent/tools/schemas.ts` and
`agent/policy/types.ts` — was written first and owned by `main`, which is why four agents
could work in parallel against code that didn't exist yet.

`greptile.json` encodes the invariants above as review rules, so a PR that imports Vapi into
`agent/`, reads a priority tier off model output, or lets a booking follow an escalation gets
flagged at review. Review findings went back to the agent that wrote the code.

See `DECISIONS.md` for the full decision record with rejected alternatives.
