/**
 * MOCK of `db/types.ts` — the real module does not exist yet.
 *
 * TODO(swap): when Workspace B lands `db/types.ts`, delete this file and change
 * the imports in app/(dash)/** from `../_data/types` to `@/db/types`. The names
 * and shapes below are the contract the dashboard compiles against; keep them.
 *
 * Every field maps onto db/migrations/0001_init.sql. Column -> field notes are
 * inline so the real implementation has no guesswork.
 *
 * Timestamps are ISO 8601 strings with an offset (Postgres `timestamptz`).
 * They are NEVER rendered raw — see _ui/time.ts, which converts to
 * America/Denver at the point of display.
 */

import type {
  Priority,
  PriorityResult,
  SituationFacts,
} from "@/agent/policy/types";

// Re-exported so dashboard code has a single import surface, exactly as a real
// db/types.ts would. agent/policy/types.ts is the upstream owner of these.
export type { Priority, PriorityResult, SituationFacts };

export type County = "Gallatin" | "Park" | "Madison";

/** `calls.outcome`. `in_progress` is the null-outcome case: the call is live. */
export type CallOutcome =
  | "booked"
  | "escalated"
  | "callback"
  | "no_action"
  /** `calls.outcome` is null and `ended_at` is null — the call is live right now. */
  | "in_progress"
  /**
   * `calls.outcome` is null but the call has ended: dropped, timed out, or it
   * ended before outcome recording existed. Distinct from `no_action`, which the
   * agent records deliberately, and from `in_progress`, which it is not.
   */
  | "no_outcome";

/** `calls.sentiment`. */
export type Sentiment = "calm" | "anxious" | "frustrated" | "distressed";

/**
 * One entry of `calls.tool_trace` (jsonb array). This is the live-debugging
 * surface: what the model asked for, what came back, and how long it took.
 */
export interface ToolTraceEntry {
  /** Vapi's toolCallId, so a trace row can be tied back to a provider log. */
  toolCallId: string;
  name: string;
  args: Record<string, unknown>;
  /** Handler return value, or the error payload when `error` is set. */
  result: unknown;
  durationMs: number;
  /** ISO instant, or null for trace entries recorded before timestamps existed. */
  startedAt: string | null;
  /** Set when the handler failed. The call itself never sees a throw. */
  error?: string;
  /**
   * True when agent/tools/guard.ts overrode this call and ran the escalation
   * path instead — the model described a hazard while asking for something
   * else. Surfaced here because it is the single most important thing to be
   * able to see after a call.
   */
  forcedEscalation?: boolean;
}

/** One turn of `calls.transcript`, already split by speaker. */
export interface TranscriptTurn {
  role: "agent" | "caller";
  text: string;
  at: string;
}

/** Row shape for the call list. Deliberately narrow — the list polls every 3s. */
export interface CallSummary {
  id: string;
  startedAt: string;
  endedAt: string | null;
  /** `calls.from_number`, E.164. */
  fromNumber: string | null;
  /** Joined from `customers.name`; null when the caller was not recognized. */
  callerName: string | null;
  town: string | null;
  county: County | null;
  /**
   * `calls.priority`. Computed by agent/policy/priority.ts from extracted
   * facts — never read from model output. Null while a call is still in intake.
   */
  priority: Priority | null;
  outcome: CallOutcome;
  /** `calls.summary` — one line, written post-call by the extraction pass. */
  summary: string | null;
}

/** Everything the detail page renders. One row of `calls`, fully expanded. */
export interface CallDetail extends CallSummary {
  vapiCallId: string | null;
  customerId: string | null;
  sentiment: Sentiment | null;
  /** `calls.facts` -> the SituationFacts the model reported. */
  facts: SituationFacts | null;
  /**
   * The output of computePriority() for those facts, persisted alongside them
   * so the ticket shows the reason the tier was assigned. `priority` above is
   * the same value as `priorityResult.tier`.
   */
  priorityResult: PriorityResult | null;
  transcript: TranscriptTurn[];
  toolTrace: ToolTraceEntry[];
  recordingUrl: string | null;
  /** Vapi's per-call cost, USD. Null until Vapi reports it, and for fixtures. */
  costUsd: number | null;
  /** One line: what the caller wanted. Post-call extraction. */
  requested: string | null;
  /** What the technician should know before arriving. Post-call extraction. */
  techNotes: string | null;
  needsHumanFollowup: boolean;
  followupReason: string | null;
}

/** One row of `techs`. */
export interface Tech {
  id: string;
  name: string;
  homeCounty: County;
  skills: string[];
  /** "HH:MM" local to America/Denver. */
  shiftStart: string;
  shiftEnd: string;
  onCall: boolean;
}

/**
 * One row of `bookings`. `arrival_window` (tstzrange) is flattened into
 * startsAt/endsAt because the grid needs both edges.
 */
export interface Booking {
  id: string;
  techId: string;
  customerName: string;
  town: string;
  county: County;
  startsAt: string;
  endsAt: string;
  priority: Priority;
  issueSummary: string;
  status: "confirmed" | "cancelled" | "completed";
  callId: string | null;
}
