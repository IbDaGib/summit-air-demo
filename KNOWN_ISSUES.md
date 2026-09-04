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

## Dashboard metrics

- `CallVolume.unresolved` lumps `outcome IS NULL` (in progress / dropped / pre-recording)
  with `outcome = 'no_action'` (a real ending). The doc now says so and /overview labels it
  honestly, but the right fix is an additive `noAction` field so dispatch can see the split.
  Found by the Workspace A quality review.
- `_ui/time.ts` `denverInstant` derives a day offset by shifting `now` by 24h×k *before*
  taking the Denver day key, so for ~1 hour after a DST changeover the /overview legend range
  can be one calendar day off the SQL series. Next transition 2026-11-01; zero demo risk.
  Found by the Workspace A quality review.
- `error.tsx` at `app/(dash)/` catches page errors client-side; a plain HTTP fetch of a
  failing page still sees a 500 with the RSC payload, which is Next's design, not a gap.
  Verified in a real browser — see the commit that closes this line.
- `getFollowupQueue` / `getCallbackQueue` / `getSafetyIncidents` take a `limit` but return no
  total, so a queue page can only say "50+" once it hits the cap. The proper fix is an additive
  `{ items, total }` return (or a companion count query). Found by the Workspace C quality review.
- `/queue`'s `relativeTime` derives "yesterday" by subtracting 24h from the instant before taking
  the Denver day key — the same fall-back-Sunday edge as `denverInstant`, one hour per year.
  Fix is to subtract a calendar day from today's day key instead. Same review.
- `calls.priority_result` is null for every call recorded before 2026-09-04 ~05:30 PDT: the webhook
  stored only the tier. The detail page labels those rows "tier assigned, reason not stored".

## Voice agent (from the Vapi prompt audit)

- **Tool names still appear ~19 times in prompt prose.** The audit's position is that
  caller-facing prose should describe tools by capability, with exact names confined to
  `Tool Call:` lines and schemas. Given the model once read a tool call aloud, that prose is
  plausibly reinforcing the pattern it is told to avoid. Not changed before the demo because
  rewording every hard gate is a behavioural change needing verification calls.
- **No pronunciation dictionary.** The agent says "Innis" for Ennis. Vapi's own voice provider
  may not support pronunciation replacements; the fix is likely an ElevenLabs voice plus a
  dictionary for Ennis, Gallatin and Kalispell.
- **The prompt grew to fit examples.** Rules are 18% shorter than before the condensation, but
  three worked examples and the runtime-context block put the assembled prompt at 13.1k chars
  versus 11.6k originally. Examples earn it — every defect they target was already forbidden
  in prose and happened anyway — but it is ~25% more prompt tokens per turn, which lands on
  the LLM slice of the bill (about 15% of the total, so roughly 4% overall).

## Vapi and Mistral

Do not run this assistant on Mistral through Vapi's native model config. Vapi's Mistral adapter
flattens conversation history: prior tool calls are sent as the literal text
`"Tool calls: [{...}]"` in an assistant turn, and tool results as `user` messages reading
`"Tool result for <id>: ..."` — no `tool_calls` fields, no `role: "tool"`. Shown that format in
its own history, Mistral starts emitting tool calls as content text, which Vapi streams to TTS.
Every spoken-JSON incident on 2026-09-04 was a Mistral call; none was gpt-5.6-luna, which
receives and returns structured `tool_calls` (`call_…` ids). Proven from `artifact.logUrl` on
call 01a06d84 (request and response bodies). The right fix for Mistral is the custom LLM
endpoint, where the message array is ours; until then, the deploy script verifies the live
model after every deploy and refuses to report success on a mismatch.

## Debugging caveat: the bot-side transcript drops words

Vapi's `messages[].message` for `bot` turns is not the text that was spoken; it is a lossy
transcript of the agent's own audio. Three calls logged the greeting as "Going on today?" while
the caller heard "What's going on today?" in full. Do not debug word-level speech — clipped
greetings, missing words, odd pauses — from that field. Use the recording, or the static
`firstMessage`/`request-start` strings, which are what was actually sent to TTS. The "Hi there"
padding on the greeting was added on the strength of that field and fixed nothing.

## record_call_outcome often never fires, and that is fine

The model says the confirmation and "Goodbye" in one turn, and most callers hang up on
"Goodbye" — before the model's next turn, which is where record_call_outcome and endCall would
run. So on a normal successful call the trace frequently shows no outcome tool at all. The ticket
is still correct because the events webhook derives the outcome from the trace: a confirmed
book_appointment is "booked", an escalate_emergency is "escalated", a save_callback_request is
"callback". That derivation is load-bearing, not a fallback. Do not "fix" the tool not firing by
forcing the model to hold the line after goodbye.
