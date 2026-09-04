/**
 * Establishing who is calling — Vapi-specific, so it lives in the adapter.
 *
 * This was briefly under `agent/`, which broke the boundary the whole design
 * rests on: nothing in the agent core may know about Vapi. Greptile caught it
 * against the rule in greptile.json. Resolved identity is passed *into* the
 * core; the core never reaches out for it.
 *
 * Why any of this exists: Vapi carries `call.customer.number` on the
 * end-of-call payload but not in the same place on the tool-call payload, so a
 * fix that worked on one webhook silently failed on the other. The visible
 * symptom was a callback saved with `phone: ""` while the agent told the caller
 * "I've passed this number along".
 */
import { phoneKey } from "../../../agent/tools/handlers/repository";

/** A number is usable only if it has a full national number's worth of digits. */
function usable(v: unknown): v is string {
  return typeof v === "string" && phoneKey(v).length >= 10;
}

/** Pull a caller number out of whatever shape the payload arrived in. */
export function callerPhoneFromPayload(message: unknown): string | undefined {
  const m = message as Record<string, unknown> | undefined;
  if (!m) return undefined;
  const call = m.call as Record<string, unknown> | undefined;

  const candidates = [
    (call?.customer as Record<string, unknown> | undefined)?.number,
    (m.customer as Record<string, unknown> | undefined)?.number,
    call?.from,
    m.from,
  ];

  return candidates.find(usable);
}

/**
 * Ask Vapi for the call record. Needs VAPI_API_KEY in the webhook environment.
 *
 * Returns undefined rather than throwing: a missing caller ID must degrade to
 * "ask the caller to read their number out", never to a failed tool call while
 * someone is mid-sentence. The caller is on the phone, so the timeout is short.
 */
export async function fetchCallerPhone(callId: string): Promise<string | undefined> {
  const key = process.env.VAPI_API_KEY;
  if (!key || !callId) return undefined;

  try {
    const res = await fetch(`https://api.vapi.ai/call/${encodeURIComponent(callId)}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return undefined;
    const body = (await res.json()) as { customer?: { number?: string } };
    return usable(body.customer?.number) ? body.customer.number : undefined;
  } catch {
    return undefined;
  }
}
