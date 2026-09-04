/**
 * Where finished calls go.
 *
 * In-memory today. `db/client.ts` lands with PR #1 and this becomes an insert
 * into `calls`; the shape below already matches that table's columns so the swap
 * is a substitution, not a refactor.
 *
 * Structured logs are emitted either way — on Vercel they are the record that
 * survives a cold start, and during a demo they are the fastest debug surface.
 */
export interface CallRecord {
  vapi_call_id: string;
  from_number?: string;
  started_at?: string;
  ended_at?: string;
  ended_reason?: string;
  duration_seconds?: number;
  cost_usd?: number;
  priority?: string;
  outcome?: string;
  facts?: Record<string, unknown>;
  transcript?: string;
  summary?: string;
  sentiment?: string;
  requested?: string;
  tech_notes?: string;
  needs_human_followup?: boolean;
  followup_reason?: string;
  recording_url?: string;
  tool_trace?: unknown[];
}

const RING: CallRecord[] = [];
const MAX = 50;

export async function persistCall(rec: CallRecord): Promise<{ stored: "db" | "memory" }> {
  console.log(
    JSON.stringify({
      evt: "call_completed",
      id: rec.vapi_call_id,
      priority: rec.priority,
      outcome: rec.outcome,
      sentiment: rec.sentiment,
      followup: rec.needs_human_followup,
      duration: rec.duration_seconds,
      cost: rec.cost_usd,
      summary: rec.summary,
    }),
  );

  RING.unshift(rec);
  if (RING.length > MAX) RING.pop();
  return { stored: "memory" };
}

export function recentCalls(limit = 25): CallRecord[] {
  return RING.slice(0, limit);
}

export function getCall(id: string): CallRecord | undefined {
  return RING.find((r) => r.vapi_call_id === id);
}
