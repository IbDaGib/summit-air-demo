# Decisions

Format: decision, why, what it beat.

## Vapi over building the pipeline

Buys VAD, endpointing, barge-in and turn-taking — the commodity layer. Rejected LiveKit/Pipecat + Twilio SIP: better control, but 2–3 days owning interruption handling and SIP. Time went into triage logic and evals instead, which is the part that is actually Summit Air's business.

## Vapi native model config over a custom LLM endpoint

The custom endpoint gives full request-body control — prompt caching, effort tuning, exact eval parity. On a ~14-hour build it was unbounded SSE/tool-delta risk on the critical path. Cost: the eval harness re-implements the turn loop, so there is drift. First thing I would close on day two.

## gpt-5.6-luna on the call

Chosen on measured call quality rather than on paper. Mistral Medium read its own tool call aloud on a live call — the caller heard "Tool calls. ID, four h two y y nine b j. Type, function. Name, assess situation, arguments, property type, residential" and hung up. gpt-5.6-luna handled the same intake cleanly and correctly re-tiered P2 to P1 the moment a vulnerable occupant was mentioned mid-call.

The agent core is provider-neutral, so this was a config change, not a rewrite: `VAPI_PROVIDER` and `VAPI_MODEL`. Mistral Medium is still verified working and remains the documented alternative, which is also the self-hosting path if calls must never leave a customer's infrastructure. Not a cost decision either way — the LLM is ~15% of per-call cost, so the delta barely moves the total.

The deterministic safety backstop in `guard.ts` was built when the plan was a non-frontier model. It stays regardless: the one thing that must never fail should not depend on any model following instructions.

## A cross-family eval judge

The judge runs `magistral-medium-latest` — Mistral's reasoning model — while
calls run `gpt-5.6-luna`. That was originally a compromise: both were Mistral,
and judging inside one family risks self-preference bias. Moving the call model
to OpenAI turned it into a genuine cross-family judge by accident, which is the
stronger arrangement.

Three things still bound the exposure, and they matter whatever the pairing:

1. **The judge never gates.** Only deterministic assertions fail the build — did
   `escalate_emergency` fire, was `book_appointment` correctly refused, were all
   required fields collected. Judge scores are a trend line, not a pass/fail, so
   a biased score cannot let a broken build through.
2. **The judge is blind.** It sees the transcript and the rubric, never the
   system prompt or which model produced the turns, so it cannot reward
   compliance with instructions it can read.
3. **The rubric is behavioural, not aesthetic** — "did it read the address back",
   not "was it good" — which leaves less room for taste to do the work.

A cross-family judge would be stronger and is the first thing to change if these
scores ever start gating anything.

## Priority computed in code, not by the model

The model reports facts; `computePriority` returns the tier. Deterministic, unit-tested, auditable. The answer to "how do you know it will not miss an emergency" is a passing test.

## Postgres EXCLUDE constraint over calendar integration

Double-booking is rejected by the database, not merely guarded against in application code. Rejected Google Calendar OAuth: hours of plumbing, weaker correctness story.

## Out of scope, deliberately

- SMS/email confirmation — A2P 10DLC registration takes days
- Rescheduling and cancellation — captured as a callback for a human
- Warm transfer to a human — one Vapi config line, not built
- Real CRM/ServiceTitan integration — adapter interface only
- Spanish, payments, outbound calling, RAG, custom voice, multi-tenancy, dashboard auth
