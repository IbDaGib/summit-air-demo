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

- [ ] **`npx tsc --noEmit` fails on a clean checkout**, on
      `app/layout.tsx: Cannot find name 'LayoutProps'`. That global is generated
      by `next dev` / `next build` / `next typegen`, and CI runs neither before
      typechecking. One line in `.github/workflows/ci.yml` (`- run: npx next
      typegen` before the `tsc` step) fixes it. Left alone here because the app
      shell is not this workspace's to change.

- [ ] **A call that escalated can still reach `book_appointment` in principle.**
      `book_appointment` refuses when the hazard is described in the text it is
      given, and `find_slots`/`book_appointment` refuse a P0 tier outright — but
      neither tool receives a call id, so nothing correlates "this call already
      escalated" across turns. The proper fix is a call id on the tool contract
      (`agent/tools/schemas.ts`, owned by main) and a per-call escalation flag.

- [ ] **`DEMO_FORCE_OUTDOOR_TEMP_F` is load-bearing.** `outdoorTempF` is not in
      the `assess_situation` schema, so the model never supplies it; the handler
      injects it. There is no weather lookup, so with the override unset every
      no-heat call with nobody vulnerable is P2, and with it set every one is P1.
      A real deployment needs a temperature-by-town source, and the override
      needs removing.

- [ ] **`no_heat` with the system still limping is P3.** The brief's rules gate
      P1 and P2 on `systemDown`, so a furnace producing 50°F air at 10°F outside
      with a vulnerable occupant falls to routine. Implemented as specified
      rather than quietly invented; it is a real question for Summit Air.

- [ ] **`save_callback_request` reports success after writing only to the log.**
      It retries once, then emits a `callback_request_log_only` error line
      containing the whole lead and returns `{ status: "saved" }`. The
      alternative was an agent apologising in a loop on the one path every other
      failure falls back to. The log line is the lead, and nothing greps it yet.

- [ ] **`scanForHazard` is keywords, not comprehension.** "There's a funny smell
      coming off the furnace" does not fire. It is the second line of defence
      behind the prompt, not a classifier — but the ways it can miss are worth
      showing rather than hiding. Negation is a 32-character window inside a
      clause, which is a heuristic: a caller who buries "no" more than about
      five words ahead of the hazard word ("I wouldn't say there is any kind of
      a gas smell") escalates anyway. That is the direction to be wrong in.

- [ ] **Tech skills are ignored when matching slots.** `techs.skills` is seeded
      (`gas`, `refrigerant`, `commercial_rooftop`, `mini_split`) but
      `find_slots` filters on county and shift only — its arguments carry no
      issue type. A commercial rooftop job can be offered to a tech who only
      does mini-splits.

- [ ] **Holidays block everyone, including P1.** `find_slots` skips a holiday for
      every tier; a P1 on Labor Day gets the on-call pager via `responseTarget`
      rather than a bookable window. Defensible, but it is a choice, not a rule
      anyone asked for.

## Address normalisation

A caller saying "fourteen twenty Durston Road" is transcribed as "14 20 Durston
Road" and stored that way. A technician can read it, but it is not clean data and
it would not geocode. The fix is a normalisation pass on the address before it
reaches book_appointment — collapse split house numbers, expand "St"/"Ave",
title-case the street. Not built: it wants real address data to test against
rather than guesses at 5am.
