# Dashboard round 4 — weeks, resolution, toasts, polish

Three parallel workspaces against a contract that is already on `main` (`f07aed7`). The
contract is the only shared surface; each workspace owns one folder and touches nothing else.

## Contract (main-owned, done)

- `db/migrations/0004_resolutions.sql` — `calls.followup_resolved_at`, `callback_requests.resolved_at`. Applied to Neon.
- `app/(dash)/_data/metrics.ts` — `FollowupItem.resolvedAt`, `CallbackItem.resolvedAt`;
  `getFollowupQueue(limit, { includeResolved })`. Open rows first, then priority, then newest.
- `app/(dash)/_data/mutations.ts` — `setFollowupResolved(callId, bool)`, `setCallbackResolved(id, bool)`.
  Plain toggles: no actor, reversible, no audit row. See DECISIONS.md.
- `GET /api/dash/calls?since=<ISO>` — calls started after `since`; body `{ calls, fetchedAt }`.
  Garbage `since` is ignored (returns everything). Behind the dashboard cookie.
- `components/ui/sonner.tsx` + `<Toaster position="bottom-right" richColors closeButton />` and a
  `<CallToaster />` stub, both mounted once in `app/(dash)/layout.tsx`.

## Workspace A — `/schedule` cycles through weeks

Owns `app/(dash)/schedule/**`.

- A1 `week.ts` (pure, tested first): `weekKeyOf(now)` → Monday of the Denver week as `YYYY-MM-DD`;
  `parseWeekParam(param, now)` → a valid Monday key or the current week when the param is missing,
  malformed, or not a Monday; `shiftWeek(key, ±1)`; `weekRange(key)` → `{ from, to }` as Denver
  instants (Mon 00:00 → Sat 00:00) using `denverInstant` from `_ui/time.ts`; `weekLabel(key)` →
  "Sep 8 – 12" style. Cover DST edges (2026-03-08, 2026-11-01 weeks) and a Sunday `now`.
- A2 `page.tsx` reads `searchParams.week` (Next 16: `searchParams` is a Promise — see
  `node_modules/next/dist/docs/`), shows Mon–Fri of that week. Header: "Week of Sep 8 · this week"
  / "next week" / "2 weeks ago" plus the tech count. Today's column keeps its highlight only when
  the shown week contains today.
- A3 Week nav: shadcn `Button` (outline, icon-sized) ← / **Today** / → as `Link`s to `?week=`,
  `Today` disabled on the current week. Server component throughout; no client state.
- A4 Motion: wrap the grid in an element keyed by the week so a week change remounts it with
  `animate-in fade-in-0 slide-in-from-right-2 duration-300` (`tw-animate-css` is installed); the
  direction may flip for ←. Add `loading.tsx` with a `Skeleton` grid the same shape as the table.
- A5 Empty week: the grid still renders with every cell empty and the caption says "No bookings
  this week" — never a blank page.

## Workspace B — `/queue` humans resolve things

Owns `app/(dash)/queue/**`.

- B1 `actions.ts` (`"use server"`): `resolveFollowup(callId, resolved)` and
  `resolveCallback(id, resolved)` wrapping `_data/mutations.ts`, then `revalidatePath("/queue")`.
  Validate the id shape before calling. Auth is the cookie the proxy enforces on `/queue` POSTs —
  verify once with `curl -X POST` and no cookie → 401, and say so in the report.
- B2 `resolve-toggle.tsx` (client): shadcn `Button` ghost + icon (`Check` to resolve, `Undo2` to
  reopen), `useTransition` + `useOptimistic` so the row changes instantly; `Tooltip` label. On
  success `toast("Marked resolved", { action: { label: "Undo", onClick } })`; on failure
  `toast.error` and revert. Sonner is already mounted — do not mount a second `Toaster`.
- B3 Both tables get the toggle as the last column. Resolved rows: `opacity-60`, strike the
  summary, `transition-all duration-300`. Followups: the page reads `?resolved=1` and passes
  `includeResolved` through; a small "Show resolved" `Button` (outline, `Link`) toggles it and the
  section badge counts open rows only. Callbacks already return resolved rows — same toggle,
  same styling.
- B4 `sort.ts`: open rows sort before resolved regardless of priority (metrics already orders this
  way; the sorter must not undo it). Test first in `sort.test.ts`.
- B5 Mobile: the toggle stays reachable; the row-as-link pattern in `followups.tsx` must not swallow
  the button click (`e.stopPropagation` or take the link off the last cell).

## Workspace C — toasts on new calls, subtle polish

Owns `app/(dash)/_ui/call-toaster.tsx` (replace the stub), may add `app/(dash)/_ui/call-toaster.logic.ts`
and `app/(dash)/template.tsx`, and may add transition classes only (no structure) to `_ui/sidebar-nav.tsx`.

- C1 `call-toaster.logic.ts` (pure, tested first): `nextCursor(fetchedAt)`, `pickNew(calls, seenIds)`,
  `toastKind(call)` → `"escalation"` when priority is `P0` or the outcome is escalated, else `"call"`.
  Read the call row type from `app/api/dash/calls/route.ts` / `_data/client.ts` — do not invent fields.
- C2 `CallToaster` (client): on mount fetch `/api/dash/calls?since=<now>` to seed the cursor with the
  server's `fetchedAt` (no toasts for history). Poll every 5s with `since=<cursor>`, skip while
  `document.hidden`, back off to 30s after 3 failures and recover. Dedupe on call id.
- C3 Ordinary call → `toast(title, { description, action: { label: "Open", onClick: router.push(/calls/id) } })`,
  title = caller or town + priority chip text, description = summary if present else "Summary pending".
- C4 Escalation → distinct and persistent: `toast.custom` rendering an ember-bordered card using the
  P0 colour from `_ui/priority.tsx` (`ramp`), `Siren` icon, `duration: Infinity`, a "Open call"
  button. It must not look like the ordinary toast.
- C5 Polish, all subtle, none on data cells: `template.tsx` fades each page in (`animate-in fade-in-0
  duration-200`); sidebar active item gets `transition-colors`; table rows in `/calls` keep their
  existing pulse. No layout shift, no bounce, nothing over 300ms.

## Reviews and merge

Each PR gets a spec-compliance review against this file and a quality review before merge.
Merge order A, B, C (no overlapping files; C's `template.tsx` is new). After merge: prod smoke on
all three routes, screenshots refreshed, README "Dashboard" section updated from read-only to
read-mostly, KNOWN_ISSUES updated with anything the reviews found and left.
