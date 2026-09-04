/**
 * Vapi tool webhook. Vapi POSTs here when the model calls a tool.
 *
 * Payload shape:  { message: { type: "tool-calls", toolCalls: [{ id, function: { name, arguments } }] } }
 * Expected reply: { results: [{ toolCallId, result }] }
 *
 * Verify both against https://docs.vapi.ai if a call fails with a tool error.
 */
import { NextResponse } from "next/server";
import { stubHandlers } from "../../../../agent/tools/handlers/stub";
import { safetyBackstop } from "../../../../agent/tools/guard";
import type { ToolHandlers } from "../../../../agent/tools/schemas";

// One-line swap once Workspace B merges the database-backed handlers.
const handlers: ToolHandlers = stubHandlers;

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

  let body: { message?: { type?: string; toolCalls?: VapiToolCall[] } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const calls = body.message?.toolCalls ?? [];
  if (!calls.length) return NextResponse.json({ results: [] });

  const results = await Promise.all(
    calls.map(async (call) => {
      const name = call.function?.name ?? call.name ?? "";
      const args = parseArgs(call.function?.arguments ?? call.arguments);
      const started = Date.now();

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
        return { toolCallId: call.id, result };
      } catch (err) {
        const message = err instanceof Error ? err.message : "tool failed";
        console.error(JSON.stringify({ evt: "tool_error", name, ms: Date.now() - started, message }));
        // Return a usable error to the model rather than a 500 — the agent must
        // be able to recover inside the conversation and offer a callback.
        return {
          toolCallId: call.id,
          result: {
            error: message,
            guidance:
              "This tool is unavailable. Apologize briefly, take the caller's number, and call save_callback_request. Do not tell them an appointment is confirmed.",
          },
        };
      }
    }),
  );

  return NextResponse.json({ results });
}

export async function GET() {
  return NextResponse.json({ ok: true, tools: Object.keys(handlers) });
}
