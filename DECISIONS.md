# Decisions

Format: decision, why, what it beat.

## Vapi over building the pipeline

Buys VAD, endpointing, barge-in and turn-taking — the commodity layer. Rejected LiveKit/Pipecat + Twilio SIP: better control, but 2–3 days owning interruption handling and SIP. Time went into triage logic and evals instead, which is the part that is actually Summit Air's business.

## Vapi native model config over a custom LLM endpoint

The custom endpoint gives full request-body control — prompt caching, effort tuning, exact eval parity. On a ~14-hour build it was unbounded SSE/tool-delta risk on the critical path. Cost: the eval harness re-implements the turn loop, so there is drift. First thing I would close on day two.

## Mistral Large on the call

The agent core is provider-neutral, so this demonstrates the swap is a one-line change — which means a self-hosting path if calls must never leave the customer's infrastructure. Not a cost decision: the LLM is ~15%% of per-call cost, so the delta barely moves the total. Mitigated the weaker adversarial instruction-following with a deterministic safety backstop in code, which is better architecture regardless of model.

## Mistral as the eval judge

One provider, one API key, one bill. The judge runs `magistral-medium-latest` —
Mistral's reasoning model — while calls run `mistral-medium-latest`, so the judge
is at least a different model from the one it scores.

The honest limitation: judging within one model family risks self-preference
bias, where a model rates its own family's output more favourably. Three things
bound that exposure:

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

## Dashboard writes are a plain toggle

Resolving a follow-up or callback sets a timestamp; un-resolving clears it. No actor, no reason, no audit row. The dashboard is behind one shared secret, so attribution would be theatre — there is no per-user identity to record. Reversible beats accountable here; if Summit Air wanted names on resolutions the fix is real auth first, not a free-text "who" box.

## Out of scope, deliberately

- SMS/email confirmation — A2P 10DLC registration takes days
- Rescheduling and cancellation — captured as a callback for a human
- Warm transfer to a human — one Vapi config line, not built
- Real CRM/ServiceTitan integration — adapter interface only
- Spanish, payments, outbound calling, RAG, custom voice, multi-tenancy, dashboard auth
