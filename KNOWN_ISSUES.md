# Known issues

Written as I built. Feeds the self-critique in the demo.

## Tool handlers and priority policy (Workspace B)

- [ ] **`db/client.ts` and `db/types.ts` do not exist yet.** Workspace A owns
      them, so rather than create files in its territory I put a
      `DispatchRepository` port in `agent/tools/handlers/repository.ts` and wrote
      the Supabase queries against a hand-mirrored copy of the row shapes in
      `supabaseRepository.ts`. When A lands, delete those interfaces and
      re-export from `db/types.ts`; the field names already match the columns.
      The queries have never run against Postgres — the tests cover them through
      the in-memory repository, which enforces the same overlap rule but is not
      the same thing as the real `EXCLUDE` constraint.

- [x] **`npx tsc --noEmit` failed on a clean checkout** on
      `app/layout.tsx: Cannot find name 'LayoutProps'`, because CI typechecked
      without ever running `next typegen`. Fixed on main in `9b18403`.

- [x] **A call that escalated could reach `book_appointment`.** Fixed on main in
      `2301ba1`: `agent/tools/callState.ts` keys escalation on Vapi's call id and
      the route blocks `find_slots` and `book_appointment` outright afterwards.
      The handlers keep only their stateless checks — a hazard in the text they
      were handed, and a P0 slot id — as defence in depth for drivers that do
      not go through the route, such as the eval harness. There is deliberately
      no second copy of the escalation state.

      Still open underneath it: `callState` is in-memory, so a serverless cold
      start mid-call forgets that the call escalated. Persisting to the `calls`
      table is the fix, and it is main's to make.

- [ ] **`DEMO_FORCE_OUTDOOR_TEMP_F` is load-bearing.** `outdoorTempF` is not in
      the `assess_situation` schema, so the model never supplies it; the handler
      injects it. There is no weather lookup, so with the override unset every
      no-heat call with nobody vulnerable is P2, and with it set every one is P1.
      A real deployment needs a temperature-by-town source, and the override
      needs removing.

- [x] **`no_heat` with the system still limping was P3.** Confirmed on a live
      call: "not keeping up" plus an 84-year-old occupant tiered P3 "Non-urgent
      service request". `computePriority` now returns P2 for an underperforming
      system with a vulnerable occupant, or P1 when it is at or below freezing,
      matching the rule main added to the stub. `systemDown` is a binary callers
      do not think in.

- [ ] **`save_callback_request` reports success after writing only to the log.**
      It retries once, then emits a `callback_request_log_only` error line
      containing the whole lead and returns `{ status: "saved" }`. The
      alternative was an agent apologising in a loop on the one path every other
      failure falls back to. The log line is the lead, and nothing greps it yet.

- [ ] **`agent/tools/guard.ts` still suppresses a hedged hazard report.** The
      transport backstop returns `none` for "I have no idea why it smells like
      gas" and "I don't know why it smells like gas", because its `NEGATOR`
      check treats the "no" in "no idea" as a denial. `scanForHazard` was fixed
      for these in round two by blanking the hedge family the same way it blanks
      the complaint family; `guard.ts` needs the same two lines, and it is
      main's file.

- [ ] **`scanForHazard` is keywords, not comprehension.** "There's a funny smell
      coming off the furnace" does not fire. It is the second line of defence
      behind the prompt, not a classifier — but the ways it can miss are worth
      showing rather than hiding. Negation now excludes two families of phrase
      that are not denials ("no heat", "no idea why"), and the remaining
      heuristic still trades in both directions: "there's no reason to think it
      smells like gas" is read as a denial, and "I can't tell if that's gas"
      escalates.

- [ ] **Tech skills are ignored when matching slots.** `techs.skills` is seeded
      (`gas`, `refrigerant`, `commercial_rooftop`, `mini_split`) but
      `find_slots` filters on county and shift only — its arguments carry no
      issue type. A commercial rooftop job can be offered to a tech who only
      does mini-splits.

- [ ] **`lookup_customer` returns `null` for a valid number with no customer, so
      the agent cannot read an unknown caller's number back.** The tool contract
      types the result as `CustomerRecord | null`, and every field but
      `callerPhone` is required, so there is no way to express "no customer, but
      here is the carrier number". Main's stub solves it by returning
      `{ callerPhone } as never` — a partial object cast past the type. I did
      not replicate the cast. The clean fix is a result envelope in
      `agent/tools/schemas.ts` (`{ callerPhone, customer: CustomerRecord | null }`),
      which is main's to change.

- [ ] **Property-access notes are withheld from the model, which is a behaviour
      change worth a second opinion.** `lookup_customer` strips `accessNotes`
      before returning, and `book_appointment` reattaches the notes on file when
      the agent supplied none and the address matches. A gate code therefore
      reaches the technician's ticket but never the model's context or the
      caller's ear. The cost: the agent cannot confirm "still the code 4412?"
      with a returning customer. Reverting is a two-line change in
      `lookupCustomer.ts` if Summit Air would rather it could.

- [ ] **`book_appointment`'s phone argument is still model-supplied.** Only
      `lookup_customer` gets the carrier number substituted at the route. A
      confused model could book under someone else's number; the address-match
      check on access notes limits the damage to a mis-keyed booking row rather
      than a disclosure, but the route should overwrite `phone` for
      `book_appointment` and `save_callback_request` too.

- [ ] **Holidays block everyone, including P1.** `find_slots` skips a holiday for
      every tier; a P1 on Labor Day gets the on-call pager via `responseTarget`
      rather than a bookable window. Defensible, but it is a choice, not a rule
      anyone asked for.
## Dashboard

- [ ] The dashboard reads `app/(dash)/_data/*`, a mock standing in for `db/client.ts`
      and `db/types.ts`, which do not exist yet. Every file there carries a
      `TODO(swap)` naming the import to change. Nothing else in the dashboard
      knows the data is fake.
- [ ] Polling is unconditional: every tick refetches the whole list even when
      nothing changed. Fine for one operator on a demo, wasteful for a room of
      them. An `If-Modified-Since` or a `max(started_at)` cursor would fix it.
- [ ] The 3s poll means a call can be up to 3s stale. Acceptable per the brief;
      Realtime is the upgrade path if that ever stops being true.
- [ ] `DASH_SECRET` is one shared secret with no rotation and no per-user
      identity, so there is no audit trail of who read a transcript. That is the
      deliberate trade in DECISIONS.md, not an oversight — but it is the first
      thing to replace if this outlives the demo.
- [ ] The schedule shows booked windows only. It does not render tech shift
      bounds or holidays, so a window outside a shift would look normal here even
      though the booking path would not create one.

- [ ] No live Supabase project is wired up — the Supabase vars in `.env.local` are
      empty. `db/seed.ts` was validated end to end against a local Postgres +
      PostgREST stand-in (`.context/local-supabase/`), not against the real
      project. First thing to do once a project exists: apply
      `db/migrations/0001_init.sql` and run `npm run seed`.
- [ ] `db/seed.ts` upserts customers on `id`. If a live call ever inserts a
      customer with a seeded phone number under a different id, re-seeding fails
      on the unique phone index instead of merging. Correct fix is an upsert on
      `phone`, which needs the id left out of the payload.
- [ ] `db/types.ts` is hand-written against `0001_init.sql` and nothing checks
      that the two still agree. Codegen would, but it needs a live database, which
      CI does not have.

## Accepted, not fixed

- **Seed replacement is non-destructive but not fully atomic.** The seed upserts
  bookings in batches of 25 and prunes afterwards, so a failure mid-run leaves a
  mixture of old and new rows rather than an empty schedule. The destructive
  failure mode is gone; full atomicity needs a transactional Postgres function,
  which is not worth adding to demo fixtures that are re-runnable by design.
  Greptile flagged this twice on PR #1 and it is a fair call — just not one worth
  spending the remaining time on.
- [ ]
