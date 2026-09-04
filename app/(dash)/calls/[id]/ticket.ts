/**
 * The dispatch-ticket columns migration 0003 added to `calls` that the shared
 * `CallDetail` type does not carry yet: what Vapi billed for the call, what the
 * caller asked for, what the tech should know, and whether a person still has
 * to pick this up.
 *
 * Local to the detail page on purpose. `_data/*` is owned by main and this
 * workspace may not widen it; when `CallDetail` grows these fields, delete this
 * file and read them off the call instead. One narrow select, same lookup
 * predicate as `getCall`, so the two reads always describe the same row.
 */
import { hasDbConfig, one } from "../../../../db/neon";

export interface TicketExtras {
  /** Vapi's per-call cost, USD. Null until Vapi reports it, and for fixtures. */
  costUsd: number | null;
  /** One line: what the caller wanted. Post-call extraction. */
  requested: string | null;
  /** What the technician should know before arriving. Post-call extraction. */
  techNotes: string | null;
  needsHumanFollowup: boolean;
  followupReason: string | null;
}

const EMPTY: TicketExtras = {
  costUsd: null,
  requested: null,
  techNotes: null,
  needsHumanFollowup: false,
  followupReason: null,
};

/** Empty strings from extraction are "nothing to say", not a note that says "". */
const text = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : null;

export async function getTicketExtras(id: string): Promise<TicketExtras> {
  if (!hasDbConfig()) return EMPTY;
  const r = await one<Record<string, unknown>>(
    `select cost_usd, requested, tech_notes, needs_human_followup, followup_reason
     from calls c
     where c.id::text = $1 or c.vapi_call_id = $1
     limit 1`,
    [id],
  );
  if (!r) return EMPTY;
  // numeric(10,4) arrives as a string over the wire.
  const cost = r.cost_usd == null ? null : Number(r.cost_usd);
  return {
    costUsd: cost != null && Number.isFinite(cost) ? cost : null,
    requested: text(r.requested),
    techNotes: text(r.tech_notes),
    needsHumanFollowup: Boolean(r.needs_human_followup),
    followupReason: text(r.followup_reason),
  };
}
