/**
 * The call loop.
 *
 * This drives the REAL agent core: systemPrompt() and turnContext() from
 * agent/prompt, TOOL_LIST from agent/tools/schemas, the deterministic backstop
 * from agent/tools/guard, and whichever ToolHandlers implementation is passed
 * in. Nothing about the agent is re-implemented here — this file is only the
 * transport, standing in for Vapi.
 *
 * Known drift, deliberate: Vapi owns the turn loop on a real call, so this is a
 * second implementation of turn-taking. Prompt, tools, dispatch and the safety
 * backstop are shared; timing, barge-in and endpointing are not testable here.
 */
import { systemPrompt, turnContext } from "../agent/prompt";
import { TOOL_LIST } from "../agent/tools/schemas";
import type { ToolHandlers } from "../agent/tools/schemas";
import { safetyBackstop } from "../agent/tools/guard";
import type { ChatModel, ChatTurn, ToolCallRequest, UsageByModel } from "./models/types";
import { addUsage } from "./models/types";
import type { Caller } from "./caller";
import type { CallRecording, Scenario, ToolCallRecord, TranscriptTurn } from "./types";

/**
 * Mirrors the static firstMessage in scripts/deploy-assistant.ts. Vapi speaks it
 * before the model is ever invoked, so the harness has to as well.
 */
export const GREETING =
  "Thanks for calling Summit Air, this is Casey — I'm an AI assistant and this call may be recorded. What's going on with your system today?";

/** Required intake, in the order OBJECTIVES asks for it. */
const REQUIRED: { key: string; label: string }[] = [
  { key: "issue", label: "what is wrong" },
  { key: "propertyType", label: "residential or commercial" },
  { key: "systemDown", label: "whether the system is completely down" },
  { key: "vulnerableOccupant", label: "whether anyone vulnerable is in the building" },
  { key: "name", label: "their name" },
  { key: "address", label: "the service address" },
  { key: "town", label: "the town" },
  { key: "availability", label: "when they are available" },
];

const MAX_TOOL_ROUNDS = 5;

/** Longest word in a fact, used to spot the fact being stated on the call. */
const distinctive = (value: string): string =>
  value
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w.length >= 4)
    .sort((a, b) => b.length - a.length)[0] ?? "";

function collected(scenario: Scenario, spoken: string, calls: ToolCallRecord[]): Set<string> {
  const have = new Set<string>();

  for (const call of calls) {
    const a = call.args;
    if (call.name === "assess_situation") {
      if (a.issue) have.add("issue");
      if (a.propertyType) have.add("propertyType");
      if (typeof a.systemDown === "boolean") have.add("systemDown");
      if (typeof a.vulnerableOccupant === "boolean") have.add("vulnerableOccupant");
    }
    if (typeof a.town === "string" && a.town) have.add("town");
    if (typeof a.customerName === "string" && a.customerName) have.add("name");
    if (typeof a.addressLine === "string" && a.addressLine) have.add("address");
    if (call.name === "book_appointment") have.add("availability");
  }

  // Facts the caller has actually said out loud count as collected even before
  // they reach a tool call — otherwise the agent gets told to re-ask.
  const heard = spoken.toLowerCase();
  for (const fact of scenario.persona.facts) {
    const token = distinctive(fact.value).toLowerCase();
    if (token && heard.includes(token)) have.add(fact.key);
  }
  return have;
}

const stillNeeded = (have: Set<string>): string[] =>
  REQUIRED.filter((r) => !have.has(r.key)).map((r) => r.label);

/**
 * Dispatch one tool call exactly the way app/api/vapi/tools/route.ts does:
 * deterministic safety backstop first, errors returned to the model rather than
 * thrown into the call.
 */
async function dispatch(
  handlers: ToolHandlers,
  name: string,
  rawArgs: Record<string, unknown>,
  scenario: Scenario,
): Promise<ToolCallRecord> {
  const started = Date.now();
  const args = { ...rawArgs };
  const injected: Record<string, unknown> = {};

  // The runtime owns outdoor temperature, not the model (see policy/types.ts).
  if (
    name === "assess_situation" &&
    typeof scenario.context.outdoorTempF === "number" &&
    args.outdoorTempF === undefined
  ) {
    args.outdoorTempF = scenario.context.outdoorTempF;
    injected.outdoorTempF = scenario.context.outdoorTempF;
  }

  try {
    const fn = (handlers as unknown as Record<string, (a: unknown) => Promise<unknown>>)[name];
    if (typeof fn !== "function") throw new Error(`unknown tool: ${name}`);

    const forced = safetyBackstop(name, args);
    if (forced) {
      const result = await handlers.escalate_emergency(forced);
      return {
        name: "escalate_emergency",
        args: forced as unknown as Record<string, unknown>,
        result,
        forcedFrom: name,
        ms: Date.now() - started,
      };
    }

    const result = await fn(args);
    return {
      name,
      args,
      result,
      ms: Date.now() - started,
      ...(Object.keys(injected).length ? { injected } : {}),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "tool failed";
    return {
      name,
      args,
      result: {
        error: message,
        guidance:
          "This tool is unavailable. Apologize briefly, take the caller's number, and call save_callback_request. Do not tell them an appointment is confirmed.",
      },
      error: message,
      ms: Date.now() - started,
    };
  }
}

export interface RunCallDeps {
  agentModel: ChatModel;
  caller: Caller;
  handlers: ToolHandlers;
}

export async function runCall(scenario: Scenario, deps: RunCallDeps): Promise<CallRecording> {
  const { agentModel, caller, handlers } = deps;
  const transcript: TranscriptTurn[] = [];
  const toolCalls: ToolCallRecord[] = [];
  const usage: UsageByModel = {};
  const messages: ChatTurn[] = [];

  const track = (modelId: string, u: { calls: number; inputTokens: number; outputTokens: number }) =>
    addUsage(usage, modelId, u);

  // The runtime resolves caller ID before the model speaks; turnContext expects
  // the record, not a tool result the model has to fetch.
  const lookup = await dispatch(handlers, "lookup_customer", { phone: scenario.persona.phone }, scenario);
  toolCalls.push(lookup);
  const knownCustomer = (lookup.result ?? null) as Awaited<ReturnType<ToolHandlers["lookup_customer"]>>;

  transcript.push({ role: "agent", text: GREETING });
  messages.push({ role: "assistant", content: GREETING });

  let agentText = GREETING;
  let endedBy: CallRecording["endedBy"] = "turn_budget";
  let endOutcome: string | undefined;
  let error: string | undefined;

  try {
    while (caller.turns < scenario.turnBudget) {
      const callerReply = await caller.speak(agentText);
      transcript.push({ role: "caller", text: callerReply.text });
      messages.push({ role: "user", content: callerReply.text });
      if (callerReply.hungUp) {
        endedBy = "caller_hung_up";
        break;
      }

      let spoke = false;
      for (let round = 0; round < MAX_TOOL_ROUNDS && !spoke; round++) {
        const spokenByCaller = transcript
          .filter((t) => t.role === "caller")
          .map((t) => t.text)
          .join(" ");
        const context = turnContext({
          now: scenario.context.now,
          callerPhone: scenario.persona.phone,
          knownCustomer,
          outdoorTempF: scenario.context.outdoorTempF,
          stillNeeded: stillNeeded(collected(scenario, spokenByCaller, toolCalls)),
        });

        const reply = await agentModel.chat({
          messages: [
            { role: "system", content: `${systemPrompt()}\n\n## Live call state\n\n${context}` },
            ...messages,
          ],
          tools: TOOL_LIST,
          temperature: 0.4,
          maxTokens: 300,
        });
        track(agentModel.id, reply.usage);

        if (reply.text) {
          transcript.push({ role: "agent", text: reply.text });
          agentText = reply.text;
          if (!reply.toolCalls.length) spoke = true;
        }

        if (!reply.toolCalls.length) {
          if (!reply.text) {
            // Nothing said and nothing called: nudge rather than spin.
            agentText = "Sorry, could you repeat that?";
            transcript.push({ role: "agent", text: agentText });
            messages.push({ role: "assistant", content: agentText });
            spoke = true;
          } else {
            messages.push({ role: "assistant", content: reply.text });
          }
          break;
        }

        messages.push({
          role: "assistant",
          content: reply.text,
          toolCalls: reply.toolCalls,
        });

        let ended = false;
        for (const call of reply.toolCalls as ToolCallRequest[]) {
          const record = await dispatch(handlers, call.name, call.args, scenario);
          toolCalls.push(record);
          messages.push({
            role: "tool",
            name: record.name,
            toolCallId: call.id,
            content: JSON.stringify(record.result),
          });
          if (call.name === "end_call" && !record.error) {
            ended = true;
            endOutcome = String(call.args.outcome ?? "");
          }
        }
        if (ended) {
          endedBy = "end_call";
          spoke = true;
        }
      }

      if (endedBy === "end_call") break;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    endedBy = "error";
  }

  return {
    transcript,
    toolCalls,
    endedBy,
    endOutcome,
    callerTurns: caller.turns,
    usage,
    ...(error ? { error } : {}),
  };
}

/** Human-readable transcript with tool calls inline — what the judge reads. */
export function renderTranscript(call: CallRecording): string {
  const lines: string[] = [];
  let toolIdx = 0;
  for (const turn of call.transcript) {
    lines.push(`${turn.role === "agent" ? "AGENT " : "CALLER"}: ${turn.text}`);
  }
  const tools = call.toolCalls
    .map((t) => `  ${++toolIdx}. ${t.name}(${JSON.stringify(t.args)}) -> ${JSON.stringify(t.result)}${t.forcedFrom ? ` [forced from ${t.forcedFrom}]` : ""}`)
    .join("\n");
  return `${lines.join("\n")}\n\nTOOL CALLS (in order):\n${tools}\n\nCall ended by: ${call.endedBy}${call.endOutcome ? ` (${call.endOutcome})` : ""}`;
}
