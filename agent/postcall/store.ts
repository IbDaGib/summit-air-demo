/**
 * Where finished calls go: one row in `calls`.
 *
 * Structured logs are emitted alongside the insert either way — on Vercel they
 * survive a cold start, and during a demo they are the fastest debug surface.
 * If the database is unreachable the log is still written and the webhook still
 * returns 200, because losing a ticket is better than making Vapi retry a call
 * that already ended.
 */
import { hasDbConfig, query } from "../../db/neon";

export interface CallRecord {
  vapi_call_id: string;
  from_number?: string;
  started_at?: string;
  ended_at?: string;
  ended_reason?: string;
  duration_seconds?: number;
  cost_usd?: number;
  priority?: string;
  priority_result?: unknown;
  outcome?: string;
  facts?: Record<string, unknown>;
  town?: string;
  county?: string;
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

export async function persistCall(rec: CallRecord): Promise<{ stored: "db" | "log" }> {
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

  if (!hasDbConfig()) return { stored: "log" };

  try {
    await query(
      `insert into calls (
         vapi_call_id, from_number, customer_id, started_at, ended_at, ended_reason,
         duration_seconds, cost_usd, priority, priority_result, outcome, facts,
         town, county, transcript, summary, sentiment, requested, tech_notes,
         needs_human_followup, followup_reason, recording_url, tool_trace
       )
       select
         $1, $2,
         -- Match the caller to a customer by phone rather than trusting anything
         -- the model reported.
         (select id from customers where right(regexp_replace(phone,'\\D','','g'), 10)
                                       = right(regexp_replace($2,'\\D','','g'), 10) limit 1),
         $3, $4, $5, $6, $7, $8::priority_tier, $9::jsonb, $10, $11::jsonb,
         $12, $13::county_name, $14, $15, $16, $17, $18, $19, $20, $21, $22::jsonb
       on conflict (vapi_call_id) do update set
         ended_at = excluded.ended_at,
         ended_reason = excluded.ended_reason,
         duration_seconds = excluded.duration_seconds,
         cost_usd = excluded.cost_usd,
         priority = excluded.priority,
         priority_result = excluded.priority_result,
         outcome = excluded.outcome,
         facts = excluded.facts,
         transcript = excluded.transcript,
         summary = excluded.summary,
         sentiment = excluded.sentiment,
         requested = excluded.requested,
         tech_notes = excluded.tech_notes,
         needs_human_followup = excluded.needs_human_followup,
         followup_reason = excluded.followup_reason,
         recording_url = excluded.recording_url,
         tool_trace = excluded.tool_trace`,
      [
        rec.vapi_call_id,
        rec.from_number ?? null,
        rec.started_at ?? null,
        rec.ended_at ?? null,
        rec.ended_reason ?? null,
        rec.duration_seconds ?? null,
        rec.cost_usd ?? null,
        rec.priority ?? null,
        rec.priority_result ? JSON.stringify(rec.priority_result) : null,
        rec.outcome ?? null,
        rec.facts ? JSON.stringify(rec.facts) : null,
        rec.town ?? null,
        rec.county ?? null,
        rec.transcript ?? null,
        rec.summary ?? null,
        rec.sentiment ?? null,
        rec.requested ?? null,
        rec.tech_notes ?? null,
        rec.needs_human_followup ?? false,
        rec.followup_reason ?? null,
        rec.recording_url ?? null,
        rec.tool_trace ? JSON.stringify(rec.tool_trace) : null,
      ],
    );
    return { stored: "db" };
  } catch (err) {
    // A lost ticket is better than making Vapi retry a call that already ended.
    console.error(
      JSON.stringify({
        evt: "persist_failed",
        id: rec.vapi_call_id,
        err: (err instanceof Error ? err.message : String(err)).slice(0, 300),
      }),
    );
    return { stored: "log" };
  }
}
