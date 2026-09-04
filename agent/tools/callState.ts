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
type CallState = { escalated: boolean; callerPhone?: string; startedAt: number };

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
    s = { escalated: false, startedAt: Date.now() };
    STATE.set(callId, s);
  }
  return s;
}

export function setCallerPhone(callId: string, phone?: string) {
  if (phone) get(callId).callerPhone = phone;
}

export function markEscalated(callId: string) {
  get(callId).escalated = true;
}

export function hasEscalated(callId: string): boolean {
  return get(callId).escalated;
}

/** Tools that must never run after a life-safety escalation. */
export const BLOCKED_AFTER_ESCALATION = new Set(["find_slots", "book_appointment"]);
