/**
 * Vapi tool webhook. Vapi POSTs here when the model calls a tool.
 *
 * Payload shape:  { message: { type: "tool-calls", toolCalls: [{ id, function: { name, arguments } }] } }
 * Expected reply: { results: [{ toolCallId, result }] }
 *
 * Verify both against https://docs.vapi.ai if a call fails with a tool error.
 */
import { NextResponse } from "next/server";
import { handlers } from "../../../../agent/tools/handlers";
import { safetyBackstop } from "../../../../agent/tools/guard";
import {
  callerPhoneFromPayload,
  fetchCallerPhone,
  phoneDigits,
} from "../../../../agent/tools/callerId";
import {
  BLOCKED_AFTER_ESCALATION,
  hasEscalated,
  markEscalated,
  setCallerPhone,
  get as getCallState,
  recordToolCall,
} from "../../../../agent/tools/callState";


type VapiToolCall = {
  id: string;
  function?: { name?: string; arguments?: unknown };
  name?: string;
  arguments?: unknown;
};

const parseArgs = (raw: unknown): Record<string, unknown> => {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return (raw as Record<string, unknown>) ?? {};
};

export async function POST(req: Request) {
  const expected = process.env.VAPI_WEBHOOK_SECRET;
  if (expected) {
    const got = req.headers.get("x-vapi-secret") ?? req.headers.get("x-vapi-signature");
    if (got !== expected) {
      console.warn(JSON.stringify({ evt: "webhook_unauthorized" }));
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  let body: {
    message?: {
      type?: string;
      toolCalls?: VapiToolCall[];
      call?: { id?: string; customer?: { number?: string } };
    };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const calls = body.message?.toolCalls ?? [];
  if (!calls.length) return NextResponse.json({ results: [] });

  // The carrier establishes who is calling — not the model. On a live call the
  // model invented `phone: "unknown"`, which matched a real customer and leaked
  // their name, address and gate code to a stranger.
  const callId = body.message?.call?.id ?? "unknown-call";

  // The tool payload does not always carry the caller number where the
  // end-of-call payload does, so try every shape and then ask Vapi directly.
  // Resolved once per call and cached in callState.
  let callerPhone = getCallState(callId).callerPhone;
  if (!callerPhone) {
    callerPhone = callerPhoneFromPayload(body.message) ?? (await fetchCallerPhone(callId));
    setCallerPhone(callId, callerPhone);
    if (!callerPhone) {
      console.warn(JSON.stringify({ evt: "caller_id_unresolved", callId }));
    }
  }

  const results = await Promise.all(
    calls.map(async (call) => {
      const name = call.function?.name ?? call.name ?? "";
      const args = parseArgs(call.function?.arguments ?? call.arguments);
      const started = Date.now();

      // Caller identity is never taken from the model.
      const known = getCallState(callId).callerPhone;
      if (name === "lookup_customer") {
        args.phone = known ?? "";
      }

      // A callback request without a number is worthless to dispatch, and the
      // agent will happily say "I have your number" regardless. Prefer the
      // carrier number; if there is none and the caller has not read one out,
      // refuse the tool rather than write a dead lead.
      if (name === "save_callback_request") {
        const spoken = typeof args.phone === "string" ? args.phone : "";
        const resolved = known ?? (phoneDigits(spoken).length >= 10 ? spoken : "");
        if (!resolved) {
          console.warn(JSON.stringify({ evt: "callback_without_phone", callId }));
          return {
            toolCallId: call.id,
            result: JSON.stringify({
              error: "missing_phone",
              guidance:
                "No callback number is available and you must not imply that one is. Ask the caller to read their phone number out digit by digit, read it back to confirm, then call this tool again with it. Do not say their details have been passed along until this tool succeeds.",
            }),
          };
        }
        args.phone = resolved;
      }

      // Escalation is terminal for the rest of the call.
      if (hasEscalated(callId) && BLOCKED_AFTER_ESCALATION.has(name)) {
        console.warn(JSON.stringify({ evt: "blocked_after_escalation", callId, name }));
        return {
          toolCallId: call.id,
          result: JSON.stringify({
            error: "blocked",
            guidance:
              "This call has already been escalated as a life-safety emergency. Do not schedule anything. Confirm a callback number, tell the caller a technician will follow up once it is safe, and end the call.",
          }),
        };
      }

      try {
        const fn = (handlers as unknown as Record<string, (a: unknown) => Promise<unknown>>)[name];
        if (typeof fn !== "function") {
          throw new Error(`unknown tool: ${name}`);
        }

        // Deterministic safety backstop: does not depend on the model having
        // followed its instructions.
        const forced = safetyBackstop(name, args);
        const result = forced
          ? await handlers.escalate_emergency(forced)
          : await fn(args);

        if (forced || name === "escalate_emergency") markEscalated(callId);
        recordToolCall(callId, {
          name,
          args,
          result,
          ms: Date.now() - started,
          forced: Boolean(forced),
        });

        console.log(
          JSON.stringify({
            evt: "tool_call",
            name,
            ms: Date.now() - started,
            forcedEscalation: Boolean(forced),
            args,
            result,
          }),
        );
        return { toolCallId: call.id, result: JSON.stringify(result ?? null) };
      } catch (err) {
        const message = err instanceof Error ? err.message : "tool failed";
        console.error(JSON.stringify({ evt: "tool_error", name, ms: Date.now() - started, message }));
        // Return a usable error to the model rather than a 500 — the agent must
        // be able to recover inside the conversation and offer a callback.
        return {
          toolCallId: call.id,
          result: JSON.stringify({
            error: message,
            guidance:
              "This tool is unavailable. Apologize briefly, take the caller's number, and call save_callback_request. Do not tell them an appointment is confirmed.",
          }),
        };
      }
    }),
  );

  return NextResponse.json({ results });
}

export async function GET() {
  return NextResponse.json({ ok: true, tools: Object.keys(handlers) });
}
