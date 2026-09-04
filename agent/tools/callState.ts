/**
 * Per-call server-side state, keyed by Vapi's call id.
 *
 * Exists because two invariants cannot be enforced from a stateless tool call:
 *
 * 1. Escalation is terminal. Once a life-safety escalation has fired, this call
 *    may not book. The model is not asked to remember that — and cannot lie
 *    about it — because the record lives here, not in the conversation.
 * 2. The caller's phone number is established by the carrier, not by the model.
 *
 * Flagged independently by Greptile on PRs #2 and #3, and demonstrated on a
 * live call where the model invented `phone: "unknown"`.
 *
 * NOTE: in-memory, so it does not survive a serverless cold start. Adequate for
 * a single call, which is its whole lifetime. Persisting to `calls` is the
 * correct fix and is logged in KNOWN_ISSUES.
 */
type CallState = {
  escalated: boolean;
  callerPhone?: string;
  startedAt: number;
  /** Tier computed by policy during the call. Never re-derived afterwards. */
  /**
   * True once caller-ID resolution has been attempted, whether or not it found
   * anything. Without this a call whose lookup fails retries the remote request
   * on every tool webhook, adding seconds to a live conversation.
   */
  callerIdResolved?: boolean;
  priority?: string;
  facts?: Record<string, unknown>;
  outcome?: string;
  /** Every tool call, for the dashboard trace and for live debugging. */
  trace: { name: string; args: unknown; result: unknown; ms: number; forced: boolean }[];
};

const STATE = new Map<string, CallState>();
const TTL_MS = 30 * 60 * 1000;

function sweep() {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, s] of STATE) if (s.startedAt < cutoff) STATE.delete(id);
}

export function get(callId: string): CallState {
  sweep();
  let s = STATE.get(callId);
  if (!s) {
    s = { escalated: false, startedAt: Date.now(), trace: [] };
    STATE.set(callId, s);
  }
  return s;
}

export function setCallerPhone(callId: string, phone?: string) {
  if (phone) get(callId).callerPhone = phone;
}

/** Record that resolution ran. Cached separately from the value it found. */
export function markCallerIdResolved(callId: string, phone?: string) {
  const s = get(callId);
  s.callerIdResolved = true;
  if (phone) s.callerPhone = phone;
}

export function callerIdAttempted(callId: string): boolean {
  return Boolean(get(callId).callerIdResolved);
}

export function markEscalated(callId: string) {
  get(callId).escalated = true;
}

export function hasEscalated(callId: string): boolean {
  return get(callId).escalated;
}

/** Tools that must never run after a life-safety escalation. */
export const BLOCKED_AFTER_ESCALATION = new Set(["find_slots", "book_appointment"]);

export function recordToolCall(
  callId: string,
  entry: { name: string; args: unknown; result: unknown; ms: number; forced: boolean },
) {
  const s = get(callId);
  s.trace.push(entry);
  // The tier is decided once, by policy, during the call. Post-call extraction
  // deliberately does not re-derive it from prose.
  if (entry.name === "assess_situation") {
    const r = entry.result as { tier?: string } | null;
    if (r?.tier) s.priority = r.tier;
    s.facts = entry.args as Record<string, unknown>;
  }
  if (entry.name === "end_call") {
    const a = entry.args as { outcome?: string };
    if (a?.outcome) s.outcome = a.outcome;
  }
}

export function snapshot(callId: string): CallState | undefined {
  return STATE.get(callId);
}
