/**
 * Dashboard reads, straight off Neon.
 *
 * Replaced the mock module once the real database existed. `hasDbConfig()`
 * still gates every call so `next build` and a fresh checkout without
 * DATABASE_URL fall back to fixtures instead of failing.
 */
import { hasDbConfig, query } from "../../../db/neon";
import { CALLS, TECHS, seedBookings } from "./fixtures";
import type { Booking, CallDetail, CallSummary, Tech, ToolTraceEntry, TranscriptTurn } from "./types";

/** Vapi hands us one transcript string; the detail page wants turns. */
function splitTranscript(raw: string | null, startedAt: string): TranscriptTurn[] {
  if (!raw) return [];
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = /^(AI|Assistant|Agent|User|Caller|Customer)\s*:\s*(.*)$/i.exec(line);
      const role: TranscriptTurn["role"] =
        m && /^(ai|assistant|agent)$/i.test(m[1]) ? "agent" : "caller";
      return { role, text: m ? m[2] : line, at: startedAt };
    });
}

function toTrace(raw: unknown): ToolTraceEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((e, i) => {
    const x = e as Record<string, unknown>;
    return {
      toolCallId: String(x.toolCallId ?? `t${i}`),
      name: String(x.name ?? "unknown"),
      args: (x.args ?? {}) as Record<string, unknown>,
      result: x.result,
      durationMs: Number(x.ms ?? x.durationMs ?? 0),
      // `at` is what callState records now; older rows have neither, and "" used
      // to reach the Denver formatter and throw. Null renders as no clock.
      startedAt:
        typeof x.at === "string" && x.at
          ? x.at
          : typeof x.startedAt === "string" && x.startedAt
            ? x.startedAt
            : null,
      error: typeof x.error === "string" ? x.error : undefined,
      forcedEscalation: Boolean(x.forced ?? x.forcedEscalation),
    };
  });
}

const CALL_COLUMNS = `
  c.id, c.vapi_call_id, c.customer_id, c.from_number, c.started_at, c.ended_at,
  c.priority, c.priority_result, c.outcome, c.summary, c.sentiment, c.facts,
  c.transcript, c.tool_trace, c.recording_url,
  c.cost_usd, c.requested, c.tech_notes, c.needs_human_followup, c.followup_reason,
  coalesce(c.town, cu.town) as town,
  coalesce(c.county, cu.county) as county,
  cu.name as caller_name`;

type CallRow = Record<string, unknown>;

function toSummary(r: CallRow): CallSummary {
  return {
    id: String(r.id),
    startedAt: new Date(String(r.started_at)).toISOString(),
    endedAt: r.ended_at ? new Date(String(r.ended_at)).toISOString() : null,
    fromNumber: (r.from_number as string) ?? null,
    callerName: (r.caller_name as string) ?? null,
    town: (r.town as string) ?? null,
    county: (r.county as CallSummary["county"]) ?? null,
    priority: (r.priority as CallSummary["priority"]) ?? null,
    // A null outcome only means "in progress" while the call is still open.
    // Eight ended calls were showing "In progress" hours later.
    outcome: ((r.outcome as string) ??
      (r.ended_at ? "no_outcome" : "in_progress")) as CallSummary["outcome"],
    summary: (r.summary as string) ?? null,
  };
}

export async function listCalls(limit = 50): Promise<CallSummary[]> {
  if (!hasDbConfig()) return CALLS.slice(0, limit);
  const rows = await query<CallRow>(
    `select ${CALL_COLUMNS} from calls c
     left join customers cu on cu.id = c.customer_id
     order by c.started_at desc limit $1`,
    [limit],
  );
  return rows.map(toSummary);
}

/** Complete call window for the toaster; unlike the calls page, this must not cap rows. */
export async function listCallsSince(since: string): Promise<CallSummary[]> {
  if (!hasDbConfig()) {
    const after = Date.parse(since);
    return CALLS.filter((call) => Date.parse(call.startedAt) > after);
  }
  const rows = await query<CallRow>(
    `select ${CALL_COLUMNS} from calls c
     left join customers cu on cu.id = c.customer_id
     where c.started_at > $1
     order by c.started_at desc`,
    [since],
  );
  return rows.map(toSummary);
}

export async function getCall(id: string): Promise<CallDetail | null> {
  if (!hasDbConfig()) return CALLS.find((c: CallDetail) => c.id === id) ?? null;
  const rows = await query<CallRow>(
    `select ${CALL_COLUMNS} from calls c
     left join customers cu on cu.id = c.customer_id
     where c.id::text = $1 or c.vapi_call_id = $1 limit 1`,
    [id],
  );
  const r = rows[0];
  if (!r) return null;
  const base = toSummary(r);
  return {
    ...base,
    vapiCallId: (r.vapi_call_id as string) ?? null,
    customerId: (r.customer_id as string) ?? null,
    sentiment: (r.sentiment as CallDetail["sentiment"]) ?? null,
    facts: (r.facts as CallDetail["facts"]) ?? null,
    priorityResult: (r.priority_result as CallDetail["priorityResult"]) ?? null,
    transcript: splitTranscript((r.transcript as string) ?? null, base.startedAt),
    toolTrace: toTrace(r.tool_trace),
    recordingUrl: (r.recording_url as string) ?? null,
    ...ticketFields(r),
  };
}

export async function listTechs(): Promise<Tech[]> {
  if (!hasDbConfig()) return TECHS;
  const rows = await query<CallRow>(
    `select id, name, home_county, skills, shift_start, shift_end, on_call
     from techs order by name`,
  );
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    homeCounty: r.home_county as Tech["homeCounty"],
    skills: (r.skills as string[]) ?? [],
    shiftStart: String(r.shift_start).slice(0, 5),
    shiftEnd: String(r.shift_end).slice(0, 5),
    onCall: Boolean(r.on_call),
  }));
}

export async function listBookings(range: { from: string; to: string }): Promise<Booking[]> {
  if (!hasDbConfig()) return seedBookings(new Date(range.from));
  const rows = await query<CallRow>(
    `select id, tech_id, customer_name, town, county, priority, issue_summary,
            status, call_id,
            lower(arrival_window) as starts_at,
            upper(arrival_window) as ends_at
     from bookings
     where arrival_window && tstzrange($1, $2, '[)')
       and status <> 'cancelled'
     order by lower(arrival_window)`,
    [range.from, range.to],
  );
  return rows.map((r) => ({
    id: String(r.id),
    techId: String(r.tech_id),
    customerName: String(r.customer_name),
    town: String(r.town),
    county: r.county as Booking["county"],
    startsAt: new Date(String(r.starts_at)).toISOString(),
    endsAt: new Date(String(r.ends_at)).toISOString(),
    priority: r.priority as Booking["priority"],
    issueSummary: String(r.issue_summary),
    status: r.status as Booking["status"],
    callId: (r.call_id as string) ?? null,
  }));
}

/** Empty strings from extraction are "nothing to say", not a note that says "". */
const text = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : null;

/**
 * The dispatch-ticket columns migration 0003 added. Pure, so it is testable
 * without a database; `numeric(10,4)` arrives as a string over the wire.
 */
export function ticketFields(r: Record<string, unknown>): Pick<
  CallDetail,
  "costUsd" | "requested" | "techNotes" | "needsHumanFollowup" | "followupReason"
> {
  const cost = r.cost_usd == null ? null : Number(r.cost_usd);
  return {
    costUsd: cost != null && Number.isFinite(cost) ? cost : null,
    requested: text(r.requested),
    techNotes: text(r.tech_notes),
    needsHumanFollowup: Boolean(r.needs_human_followup),
    followupReason: text(r.followup_reason),
  };
}
