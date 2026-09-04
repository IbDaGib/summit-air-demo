/**
 * MOCK of `db/client.ts` — the real module does not exist yet.
 *
 * TODO(swap): when Workspace B lands `db/client.ts`, delete this file and change
 * the imports in app/(dash)/** and app/api/dash/** from `../_data/client` to
 * `@/db/client`. Keep these four exported signatures; they are what the
 * dashboard compiles against. The SQL each one stands in for is written above
 * it, so the real implementation is a transcription, not a design exercise.
 *
 * Server-only. Nothing here may be imported from a Client Component — the real
 * version will hold SUPABASE_SERVICE_ROLE_KEY.
 */

import type {
  Booking,
  CallDetail,
  CallSummary,
  Tech,
} from "./types";
import { CALLS, TECHS, seedBookings } from "./fixtures";

/**
 * select c.*, cu.name as caller_name
 *   from calls c left join customers cu on cu.id = c.customer_id
 *  order by c.started_at desc
 *  limit $1
 */
export async function listCalls(limit = 50): Promise<CallSummary[]> {
  return CALLS.slice()
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .slice(0, limit)
    .map(toSummary);
}

/**
 * select c.*, cu.name as caller_name
 *   from calls c left join customers cu on cu.id = c.customer_id
 *  where c.id = $1
 */
export async function getCall(id: string): Promise<CallDetail | null> {
  return CALLS.find((c) => c.id === id) ?? null;
}

/** select * from techs order by name */
export async function listTechs(): Promise<Tech[]> {
  return TECHS.slice().sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * select * from bookings
 *  where status <> 'cancelled'
 *    and arrival_window && tstzrange($1, $2)
 *  order by lower(arrival_window)
 */
export async function listBookings(range: {
  from: string;
  to: string;
}): Promise<Booking[]> {
  const from = Date.parse(range.from);
  const to = Date.parse(range.to);
  return seedBookings()
    .filter((b) => b.status !== "cancelled")
    .filter((b) => Date.parse(b.endsAt) > from && Date.parse(b.startsAt) < to)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

/** Narrows a detail row to the columns the polling list actually sends. */
function toSummary(c: CallDetail): CallSummary {
  return {
    id: c.id,
    startedAt: c.startedAt,
    endedAt: c.endedAt,
    fromNumber: c.fromNumber,
    callerName: c.callerName,
    town: c.town,
    county: c.county,
    priority: c.priority,
    outcome: c.outcome,
    summary: c.summary,
  };
}
