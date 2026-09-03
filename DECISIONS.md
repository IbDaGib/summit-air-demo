# Decisions

Format: decision, why, what it beat.

## Vapi over building the pipeline

Buys VAD, endpointing, barge-in and turn-taking — the commodity layer. Rejected LiveKit/Pipecat + Twilio SIP: better control, but 2–3 days owning interruption handling and SIP. Time went into triage logic and evals instead, which is the part that is actually Summit Air's business.

## Vapi native model config over a custom LLM endpoint

The custom endpoint gives full request-body control — prompt caching, effort tuning, exact eval parity. On a ~14-hour build it was unbounded SSE/tool-delta risk on the critical path. Cost: the eval harness re-implements the turn loop, so there is drift. First thing I would close on day two.

## Mistral Large on the call

The agent core is provider-neutral, so this demonstrates the swap is a one-line change — which means a self-hosting path if calls must never leave the customer's infrastructure. Not a cost decision: the LLM is ~15%% of per-call cost, so the delta barely moves the total. Mitigated the weaker adversarial instruction-following with a deterministic safety backstop in code, which is better architecture regardless of model.

## Claude as the eval judge, not Mistral

Different model family from the one generating, which avoids self-preference bias in LLM-as-judge scoring.

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
