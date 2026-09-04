/**
 * Post-call extraction: turns a finished transcript into a dispatch ticket.
 *
 * Runs offline, so latency does not matter and quality does. Uses
 * magistral-medium-latest — Mistral's reasoning model — rather than the
 * mistral-medium-latest that drives the call.
 *
 * The priority tier is NOT asked for here. It was computed during the call by
 * policy from extracted facts; re-deriving it from prose would discard the
 * deterministic answer and invite a second, disagreeing one.
 */
const MODEL = process.env.EXTRACT_MODEL ?? "magistral-medium-latest";

export interface CallSummary {
  summary: string;
  sentiment: "calm" | "anxious" | "frustrated" | "distressed";
  requested: string;
  techNotes: string;
  needsHumanFollowup: boolean;
  followupReason?: string;
}

const SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    sentiment: { type: "string", enum: ["calm", "anxious", "frustrated", "distressed"] },
    requested: { type: "string" },
    techNotes: { type: "string" },
    needsHumanFollowup: { type: "boolean" },
    followupReason: { type: "string" },
  },
  required: ["summary", "sentiment", "requested", "techNotes", "needsHumanFollowup"],
  additionalProperties: false,
} as const;

const SYSTEM = `You write dispatch tickets for an HVAC company from phone call transcripts.

Write for a dispatcher reading twenty of these on a Monday morning. Be specific and short.

- summary: two sentences maximum. What broke, what was agreed. No preamble.
- requested: one line naming what the caller wanted.
- techNotes: only what changes what the technician does — access, equipment, a
  vulnerable occupant in the home, a pet, a gate code. Empty string if nothing.
- sentiment: how the caller sounded, not how the call was resolved.
  "calm" is an ordinary caller. "anxious" is worried but composed — no heat with
  a baby in the house. "frustrated" is annoyed at the company, a repeat visit, a
  missed appointment. "distressed" is a genuine emergency or real fear, and is
  never used for mere annoyance.
- needsHumanFollowup: true if a safety escalation happened, if a tool failed, if
  the caller asked for a person, if they were upset, or if nothing was booked
  when something should have been.

Never invent details. If the transcript does not say it, leave it out.

The RECORDED FACTS block is the system's own record of what its tools did. It is
authoritative over anything the transcript seems to imply. An offer of arrival
windows is not a booking; "which works better?" with no answer is not a booking.
If bookingConfirmed is false, the summary must not say booked, scheduled, or
confirmed — say what was offered and that the call ended without a booking.`;

/**
 * What the system actually recorded during the call. The extractor must not
 * contradict this: on a real call the agent OFFERED two windows, the caller went
 * quiet, and the summary said "Booked for Tuesday". Nothing was booked.
 */
export interface RecordedFacts {
  bookingConfirmed: boolean;
  escalated: boolean;
  callbackSaved: boolean;
  /** How the call ended per Vapi, e.g. customer-ended-call, silence-timed-out. */
  endedReason?: string;
}

export async function extractCallSummary(
  transcript: string,
  facts?: RecordedFacts,
): Promise<CallSummary | null> {
  const key = process.env.MISTRAL_API_KEY;
  if (!key || !transcript.trim()) return null;

  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content:
            (facts
              ? `RECORDED FACTS (authoritative):\n` +
                `- bookingConfirmed: ${facts.bookingConfirmed}\n` +
                `- escalated: ${facts.escalated}\n` +
                `- callbackSaved: ${facts.callbackSaved}\n` +
                `- endedReason: ${facts.endedReason ?? "unknown"}\n\nTRANSCRIPT:\n`
              : "") + transcript.slice(0, 24_000),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "call_summary", strict: true, schema: SCHEMA },
      },
    }),
  });

  if (!res.ok) {
    console.error(JSON.stringify({ evt: "extract_failed", status: res.status }));
    return null;
  }
  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: Record<string, number>;
  };
  const raw = body.choices?.[0]?.message?.content;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CallSummary;
    console.log(JSON.stringify({ evt: "extract_ok", model: MODEL, usage: body.usage }));
    return parsed;
  } catch {
    console.error(JSON.stringify({ evt: "extract_unparseable", raw: raw.slice(0, 200) }));
    return null;
  }
}
