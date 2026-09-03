# Workspace D — dispatch dashboard

A read-only operator view. It gets screen-shared during a live demo, so the call
that just happened must be visible within a few seconds.

## Build
1. `app/(dash)/calls/page.tsx` — table of calls, newest first: time, caller,
   town, priority chip, outcome, one-line summary. Poll every 3s. **Do not** wire
   up Supabase Realtime; polling looks identical on a demo and costs 5 minutes.
2. `app/(dash)/calls/[id]/page.tsx` — full transcript, the extracted facts, the
   computed priority with its reason, and the **tool-call trace**: each call with
   arguments, result, and duration in ms. This is the live-debugging surface.
3. `app/(dash)/schedule/page.tsx` — next 5 days x 6 techs, showing booked
   arrival windows. Makes the collision constraint visible.
4. Protect all of it behind a single shared secret in middleware. No auth system.

## Design
Priority is a **thermal ramp**: P0 ember red, P1 amber, P2 steel blue, P3 slate.
Cold-to-hot is the axis of this business, so severity should read at a glance
without reading the label. Tailwind is already installed. Dense and legible over
decorative — this is an operator tool, not a landing page.

## Constraints
Do not touch `agent/**`, `db/migrations/**`, `evals/**`, or `package.json`.
Read from `db/client.ts` and `db/types.ts`; if they don't exist yet, define a
local mock module with the same shape and leave a `TODO` naming the swap.

## Validate
`npx tsc --noEmit` and `npm run build` both pass. Include a screenshot of the call
list with mock data.
