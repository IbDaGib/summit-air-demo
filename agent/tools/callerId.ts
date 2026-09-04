/**
 * Establishing who is calling.
 *
 * Vapi's end-of-call payload carries `call.customer.number`, but the tool-call
 * payload does not put it in the same place — so a fix that worked on one
 * webhook silently failed on the other. The visible symptom was a callback
 * request saved with `phone: ""` while the agent told the caller "I've passed
 * this number along". The agent asserted something untrue.
 *
 * Two layers, in order of preference:
 *   1. Any of the shapes the tool payload might use.
 *   2. Ask Vapi directly for the call, once per call, cached.
 *
 * Never the model. The model previously invented `phone: "unknown"`, which
 * matched a real customer and leaked their address and gate code.
 */

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

  for (const c of candidates) {
    if (typeof c === "string" && c.replace(/\D/g, "").length >= 10) return c;
  }
  return undefined;
}

/**
 * Ask Vapi for the call record. Needs VAPI_API_KEY in the webhook environment.
 *
 * Returns undefined rather than throwing: a missing caller ID must degrade to
 * "ask the caller to read their number out", never to a failed tool call on a
 * live conversation.
 */
export async function fetchCallerPhone(callId: string): Promise<string | undefined> {
  const key = process.env.VAPI_API_KEY;
  if (!key || !callId || callId.startsWith("unknown")) return undefined;

  try {
    const res = await fetch(`https://api.vapi.ai/call/${encodeURIComponent(callId)}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return undefined;
    const body = (await res.json()) as { customer?: { number?: string } };
    const n = body.customer?.number;
    return typeof n === "string" && n.replace(/\D/g, "").length >= 10 ? n : undefined;
  } catch {
    // Timeout or network error. The caller is mid-sentence; do not block them.
    return undefined;
  }
}

/** Digits-only comparison key. Last 10, so formatting never matters. */
export function phoneDigits(phone: string | undefined): string {
  return (phone ?? "").replace(/\D/g, "").slice(-10);
}
