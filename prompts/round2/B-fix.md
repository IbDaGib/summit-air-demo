# Workspace B — round 2

Greptile reviewed PR #2: **Confidence 1/5 — not safe to merge.** It also opened
a Security Review section. Three findings, and two were confirmed on a live call.

> "The customer lookup can return addresses and property-access notes for an
> unverified model-supplied phone number."

This happened for real. The model invented `phone: "unknown"`, which normalised
to `""`, and `endsWith("")` is always true — so the agent greeted an unknown
caller as "Dave, is this you at 412 Cottonwood Road?" including his gate code.

> "Booking retains no prior escalation state."
> "The hazard scanner can misread an explicit gas-smell report."

## Already fixed on main — align, do not duplicate
`git fetch origin && git rebase origin/main` first. Main now has:
- `agent/tools/callState.ts` — per-call state keyed on Vapi's call id.
  `find_slots` and `book_appointment` are blocked after any escalation, at the
  route boundary.
- `app/api/vapi/tools/route.ts` overwrites `args.phone` for `lookup_customer`
  with the carrier-supplied number. The model can no longer assert who is calling.
- `CustomerRecord.callerPhone` echoes the carrier number back.

So your handlers should **trust that the phone argument is carrier-verified**,
but still refuse a number shorter than 10 digits as defence in depth. Do not
build a second escalation-state mechanism.

## Still yours to fix
1. **`safetyScan` negation.** Greptile says an explicit gas-smell report can
   still be suppressed, even after your complaint-phrase fix. Main's `guard.ts`
   solved it by splitting on clause boundaries (`,`, `and`, `but`, `.`) and
   testing each clause independently. Verify against at least these:
   - "No heat, and there's a gas smell in the basement"
   - "The furnace won't fire, but I smell gas"
   - "no cooling upstairs and I smell burning"
   - "there is no gas smell" (must NOT escalate)
   If yours already passes all four, say so with test output and move on.
2. **Redact phone numbers in the escalation failure log** — Greptile flagged
   unredacted callback numbers in operational logs.
3. Address the 4 inline PR comments.

## Also
Your KNOWN_ISSUES finding #3 was confirmed live: "not keeping up" + elderly
occupant tiered **P3 Non-urgent**. Main's stub now returns P2, or P1 when
freezing. Mirror that rule in `computePriority` and test it.

## Validate
`npx next typegen && npx tsc --noEmit && npx vitest run agent`. Paste real output.
