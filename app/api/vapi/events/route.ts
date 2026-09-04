import { NextResponse } from "next/server";
import { extractCallSummary } from "../../../../agent/postcall/extract";
import { persistCall } from "../../../../agent/postcall/store";
import { hasDbConfig, query } from "../../../../db/neon";
import { snapshot } from "../../../../agent/tools/callState";

/**
 * Vapi server events. The one that matters is `end-of-call-report`: it carries
 * the transcript, timings, cost and recording URL once the call is over.
 *
 * Without this nothing survives a call — no transcript, no summary, no ticket.
 */
export async function GET() {
  if (!hasDbConfig()) return NextResponse.json({ ok: true, db: false });
  const r = await query<{ n: number }>("select count(*)::int n from calls");
  return NextResponse.json({ ok: true, db: true, calls: r[0]?.n ?? 0 });
}

function unauthorized(req: Request): boolean {
  const expected = process.env.VAPI_WEBHOOK_SECRET;
  if (!expected) return false;
  return req.headers.get("x-vapi-secret") !== expected;
}

export async function POST(req: Request) {
  if (unauthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    message?: {
      type?: string;
      endedReason?: string;
      transcript?: string;
      recordingUrl?: string;
      cost?: number;
      startedAt?: string;
      endedAt?: string;
      call?: { id?: string; customer?: { number?: string } };
      artifact?: { transcript?: string; recordingUrl?: string };
    };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const m = body.message;
  if (m?.type !== "end-of-call-report") {
    // status-update, speech-update, hang and friends. Acknowledge and ignore.
    return NextResponse.json({ ok: true });
  }

  const callId = m.call?.id ?? `unknown-${Date.now()}`;
  const transcript = m.transcript ?? m.artifact?.transcript ?? "";
  const state = snapshot(callId);

  const started = m.startedAt ? new Date(m.startedAt) : undefined;
  const ended = m.endedAt ? new Date(m.endedAt) : undefined;

  // Extraction can fail — a missing key, a refusal, a parse error. The ticket
  // has to survive that, so the transcript is written either way.
  let summary = null;
  try {
    summary = await extractCallSummary(transcript);
  } catch (err) {
    console.error(
      JSON.stringify({ evt: "extract_threw", callId, err: String(err).slice(0, 200) }),
    );
  }

  await persistCall({
    vapi_call_id: callId,
    from_number: m.call?.customer?.number,
    started_at: started?.toISOString(),
    ended_at: ended?.toISOString(),
    ended_reason: m.endedReason,
    duration_seconds:
      started && ended ? Math.round((ended.getTime() - started.getTime()) / 1000) : undefined,
    cost_usd: m.cost,
    // Computed by policy during the call. Not re-derived from the transcript.
    priority: state?.priority,
    outcome: state?.outcome ?? (state?.escalated ? "escalated" : undefined),
    facts: state?.facts,
    // The town the caller named on THIS call, not the one on their customer
    // record — a landlord calls about a different property than their own.
    town: (state?.facts?.town as string) ?? undefined,
    transcript,
    summary: summary?.summary,
    sentiment: summary?.sentiment,
    requested: summary?.requested,
    tech_notes: summary?.techNotes,
    needs_human_followup: summary?.needsHumanFollowup ?? state?.escalated ?? false,
    followup_reason: summary?.followupReason,
    recording_url: m.recordingUrl ?? m.artifact?.recordingUrl,
    tool_trace: state?.trace,
  });

  return NextResponse.json({ ok: true });
}
