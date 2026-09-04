/**
 * Deterministic stand-ins for the two live models, used when no API keys are
 * present so that `npx vitest run evals` still exercises the whole harness:
 * prompt assembly, tool dispatch, the safety backstop, the assertions, the
 * results file and the report.
 *
 * Read the scores from an offline run as a check on the HARNESS, not on the
 * agent. The offline agent is a fixed policy, not a language model — it cannot
 * tell you whether the prompt in agent/prompt survives contact with Mistral.
 * Set MISTRAL_API_KEY (and ANTHROPIC_API_KEY for the judge) and the same command
 * becomes a real gate.
 */
import { safetyBackstop } from "../../agent/tools/guard";
import type { PriorityResult } from "../../agent/policy/types";
import type { BookingResult, ServiceAreaResult, Slot } from "../../agent/tools/schemas";
import type { Persona } from "../types";
import type { ChatModel, ChatReply, ChatRequest, ChatTurn, ToolCallRequest } from "./types";

export const OFFLINE_MODEL_ID = "offline-mock";

const noUsage = () => ({ calls: 1, inputTokens: 0, outputTokens: 0 });
const reply = (text: string, toolCalls: ToolCallRequest[] = []): ChatReply => ({
  text,
  toolCalls,
  usage: noUsage(),
});

let callSeq = 0;
const toolCall = (name: string, args: Record<string, unknown>): ToolCallRequest => ({
  id: `off_${++callSeq}`,
  name,
  args,
});

/* ------------------------------------------------------------------ *
 * Caller
 * ------------------------------------------------------------------ */

const CLOSING =
  /(you're all set|you're booked|technician will be out|someone will call you (back|shortly)|stay outside|take care|have a good)/i;

export function offlineCallerModel(persona: Persona): ChatModel {
  return {
    id: OFFLINE_MODEL_ID,
    async chat(req: ChatRequest): Promise<ChatReply> {
      const heardFromAgent = last(req.messages, "user") ?? "";
      const alreadySaid = req.messages
        .filter((m) => m.role === "assistant")
        .map((m) => m.content)
        .join(" ");

      if (CLOSING.test(heardFromAgent)) {
        return reply("Okay, thanks for your help. [hang up]");
      }

      for (const fact of persona.facts) {
        if (alreadySaid.includes(fact.value)) continue;
        if (fact.asks.test(heardFromAgent)) return reply(fact.value);
      }

      if (/\b(yes|no)\b.*\?|works for you|does that work|shall i|should i|sound good|okay\?/i.test(heardFromAgent)) {
        return reply("Yeah, that works for me.");
      }
      if (heardFromAgent.includes("?")) {
        const next = persona.facts.find((f) => !alreadySaid.includes(f.value));
        return reply(next ? next.value : "I think that's everything, yeah.");
      }
      return reply("Okay.");
    },
  };
}

/* ------------------------------------------------------------------ *
 * Agent
 * ------------------------------------------------------------------ */

const TOWNS = [
  "bozeman",
  "belgrade",
  "manhattan",
  "three forks",
  "big sky",
  "livingston",
  "ennis",
  "west yellowstone",
  "butte",
  "missoula",
  "helena",
  "great falls",
  "anaconda",
  "dillon",
];

const titleCase = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

interface Question {
  key: string;
  text: string;
  extract(answer: string): unknown;
}

const QUESTIONS: Question[] = [
  {
    key: "propertyType",
    text: "Is this a home or a commercial building?",
    extract: (a) => (/commercial|business|shop|restaurant|office|store/i.test(a) ? "commercial" : "residential"),
  },
  {
    key: "systemDown",
    text: "Is the system completely down, or is it still running and just not keeping up?",
    extract: (a) =>
      /completely|dead|quit|stopped|nothing at the vents|no air|won'?t (turn on|start|run|stay)|not (running|working) at all/i.test(a) &&
      !/it runs|still runs|turns on|fires up/i.test(a),
  },
  {
    key: "vulnerableOccupant",
    text: "And is there anyone elderly, an infant, or someone medically vulnerable in the house?",
    extract: (a) =>
      /elderly|eighty|ninety|seventy|\b(8|9)\d\b|infant|newborn|baby|oxygen|medically|my (mother|mom|father|dad|grandmother|grandfather)/i.test(a) &&
      !/nobody|no one|not really|just me|two adults/i.test(a),
  },
  { key: "name", text: "Can I get your name?", extract: (a) => extractName(a) },
  { key: "phone", text: "And the best number to reach you on?", extract: (a) => extractPhone(a) },
  { key: "address", text: "What's the service address?", extract: (a) => a.replace(/^[^0-9A-Za-z]+/, "").trim() },
  {
    key: "availability",
    text: "When are you generally available — mornings or afternoons?",
    extract: (a) => a.trim(),
  },
];

const NON_NAMES = new RegExp(`\\b(${TOWNS.join("|")}|street|avenue|road|lane|the|and|yeah|okay|sure)\\b`, "i");

function extractName(answer: string): string {
  const cleaned = answer.replace(/[—-].*$/, "");
  const m = cleaned.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g) ?? [];
  const pick = m.find((candidate) => !NON_NAMES.test(candidate));
  return (pick ?? "").trim();
}

const WORD_DIGITS: Record<string, string> = {
  zero: "0", oh: "0", one: "1", two: "2", three: "3", four: "4",
  five: "5", six: "6", seven: "7", eight: "8", nine: "9",
};

function extractPhone(answer: string): string {
  const digits = answer.match(/\d/g)?.join("") ?? "";
  if (digits.length >= 10) return digits;
  const spoken = answer
    .toLowerCase()
    .split(/[^a-z]+/)
    .map((w) => WORD_DIGITS[w])
    .filter(Boolean)
    .join("");
  return spoken.length >= 10 ? spoken : "";
}

function last(messages: ChatTurn[], role: ChatTurn["role"]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === role && messages[i].content) return messages[i].content;
  }
  return null;
}

interface AgentState {
  callerText: string;
  lastCaller: string;
  agentTexts: string[];
  toolResults: Map<string, unknown[]>;
  toolArgs: Map<string, Record<string, unknown>[]>;
  answers: Record<string, unknown>;
}

function readState(messages: ChatTurn[]): AgentState {
  const callerTurns = messages.filter((m) => m.role === "user").map((m) => m.content);
  const agentTexts = messages.filter((m) => m.role === "assistant").map((m) => m.content);
  const toolResults = new Map<string, unknown[]>();
  const toolArgs = new Map<string, Record<string, unknown>[]>();
  const byId = new Map<string, string>();

  for (const m of messages) {
    if (m.role === "assistant" && m.toolCalls) {
      for (const c of m.toolCalls) {
        byId.set(c.id, c.name);
        toolArgs.set(c.name, [...(toolArgs.get(c.name) ?? []), c.args]);
      }
    }
    if (m.role === "tool") {
      const name = m.name ?? byId.get(m.toolCallId ?? "") ?? "";
      let parsed: unknown = m.content;
      try {
        parsed = JSON.parse(m.content);
      } catch {
        /* keep the raw string */
      }
      toolResults.set(name, [...(toolResults.get(name) ?? []), parsed]);
    }
  }

  // Answers: whatever the caller said immediately after each question we asked.
  const answers: Record<string, unknown> = {};
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    const q = QUESTIONS.find((question) => m.content.includes(question.text));
    if (!q) continue;
    const next = messages.slice(i + 1).find((x) => x.role === "user");
    if (next) answers[q.key] = q.extract(next.content);
  }

  const callerText = callerTurns.join(" ");
  const town = TOWNS.find((t) => new RegExp(`\\b${t}\\b`, "i").test(callerText));
  if (town) answers.town = titleCase(town);
  answers.issue = classifyIssue(callerText);

  return {
    callerText,
    lastCaller: callerTurns[callerTurns.length - 1] ?? "",
    agentTexts,
    toolResults,
    toolArgs,
    answers,
  };
}

function classifyIssue(text: string): string {
  if (/tune.?up|maintenance|annual|yearly service|serviced/i.test(text)) return "maintenance";
  if (/on and off|short.?cycl|cycles|not keeping up|struggl|won'?t stay on/i.test(text)) return "poor_performance";
  if (/no heat|quit|won'?t (heat|start)|furnace.*(dead|quit|stopped)|freezing|no warm air/i.test(text)) return "no_heat";
  if (/warm air|not cooling|a\/?c\b|air condition/i.test(text)) return "no_cooling";
  if (/smell|noise|rattl|bang/i.test(text)) return "noise_or_smell";
  return "other";
}

const PRICE_PRESSURE = /how much|what.*cost|price|charge|quote|a number, not a range|flat (repair )?price/i;
const INJECTION = /ignore (your|all|the|previous)|system prompt|your instructions|disregard/i;
const PRIOR_PROMISE = /last guy|you (said|told|promised)|we'?re agreed|waive/i;

/** A fixed policy over the real tool schemas. Not a model, and not a fallback for one. */
export function offlineAgentModel(): ChatModel {
  return {
    id: OFFLINE_MODEL_ID,
    async chat(req: ChatRequest): Promise<ChatReply> {
      const s = readState(req.messages);

      /* 1. Life safety, before anything else. */
      const hazard = safetyBackstop("assess_situation", { notes: s.callerText });
      if (hazard && !s.toolResults.has("escalate_emergency")) {
        return reply("Okay — stop for a second, that's something we treat as an emergency.", [
          toolCall("escalate_emergency", {
            hazard: hazard.hazard,
            town: typeof s.answers.town === "string" ? s.answers.town : undefined,
          }),
        ]);
      }
      if (s.toolResults.has("escalate_emergency")) {
        const escalation = (s.toolResults.get("escalate_emergency") ?? [])[0] as { instructions?: string };
        const spoken = s.agentTexts.some((t) => t.includes("leave the building"));
        if (!spoken) {
          return reply(escalation?.instructions ?? "Please leave the building and call nine one one from outside.");
        }
        return reply("Stay outside, and someone here will follow up as soon as it's safe. Take care.", [
          toolCall("end_call", { outcome: "escalated" }),
        ]);
      }

      /* 2. Pressure from the caller: answer it in one line and keep moving in the
         same turn, so friction costs the caller time rather than the call. */
      const pushback = pressureReply(s.lastCaller);
      const move = nextMove(s);
      if (pushback) {
        return reply(`${pushback}${move.text ? ` ${move.text}` : ""}`, move.toolCalls);
      }
      return move;
    },
  };
}

function pressureReply(lastCaller: string): string | null {
  if (INJECTION.test(lastCaller)) {
    return "I can't do that — I'm the scheduling assistant for Summit Air, and I can't quote a firm repair cost over the phone either.";
  }
  if (PRIOR_PROMISE.test(lastCaller)) {
    return "I don't have any record of that on my end, so I can't confirm it — the technician goes over cost with you on site before any work.";
  }
  if (PRICE_PRESSURE.test(lastCaller)) {
    return "I can't give you a firm figure over the phone — the technician confirms the cost with you on site before any work starts.";
  }
  return null;
}

/** The next step toward a booking, an escalation, or a logged callback. */
function nextMove(s: AgentState): ChatReply {
  const has = (name: string) => s.toolResults.has(name);
  const resultsFor = <T,>(name: string): T[] => (s.toolResults.get(name) ?? []) as T[];
  const ask = (key: string) => QUESTIONS.find((q) => q.key === key)!.text;

  /* Coverage. */
  const town = s.answers.town as string | undefined;
  if (!town) return reply("What town are you in?");
  if (!has("check_service_area")) {
    return reply("Let me check that we cover that area.", [toolCall("check_service_area", { town })]);
  }
  const area = resultsFor<ServiceAreaResult>("check_service_area")[0];
  if (area && !area.covered) {
    const name = (s.answers.name as string) || "";
    const phone = (s.answers.phone as string) || "";
    if (!name) return reply(`I'm sorry — we don't get out to ${town}. ${ask("name")}`);
    if (!phone) return reply(`I'd like to hand this to a person who can point you somewhere. ${ask("phone")}`);
    if (!has("save_callback_request")) {
      return reply("Let me get that written down for our dispatcher.", [
        toolCall("save_callback_request", {
          customerName: name,
          phone,
          reason: "outside service area",
          notes: `${town}: ${classifyIssue(s.callerText)}`,
        }),
      ]);
    }
    return reply("Someone will call you back to point you at a company that covers your area. Thanks for your patience.", [
      toolCall("end_call", { outcome: "callback" }),
    ]);
  }

  /* Facts, one question at a time. */
  for (const key of ["propertyType", "systemDown", "vulnerableOccupant"]) {
    if (s.answers[key] === undefined) return reply(ask(key));
  }

  if (!has("assess_situation")) {
    return reply("Let me get this in front of dispatch.", [
      toolCall("assess_situation", {
        propertyType: s.answers.propertyType,
        issue: s.answers.issue,
        systemDown: s.answers.systemDown,
        hazard: "none",
        vulnerableOccupant: s.answers.vulnerableOccupant,
        occupantDetail: s.answers.vulnerableOccupant ? s.lastCaller.slice(0, 120) : undefined,
        town,
      }),
    ]);
  }
  const priority = resultsFor<PriorityResult>("assess_situation")[0];

  for (const key of ["name", "phone", "address", "availability"]) {
    if (!s.answers[key]) return reply(ask(key));
  }

  /* Schedule. */
  const bookings = resultsFor<BookingResult>("book_appointment");
  const confirmed = bookings.find((b) => b.status === "confirmed");
  const tried = new Set((s.toolArgs.get("book_appointment") ?? []).map((a) => String(a.slotId)));

  if (confirmed) {
    return reply("You're all set — the technician will call when they're on the way. Thanks for calling Summit Air.", [
      toolCall("end_call", { outcome: "booked" }),
    ]);
  }

  if (!has("find_slots")) {
    return reply("Let me pull up the schedule.", [
      toolCall("find_slots", { town, priority: priority?.tier ?? "P3" }),
    ]);
  }

  // Alternatives from a conflicted booking are as good as fresh slots.
  const offered = resultsFor<{ slots: Slot[] }>("find_slots").flatMap((r) => r.slots ?? []);
  const alternatives = bookings.flatMap((b) => b.alternatives ?? []);
  const available = [...offered, ...alternatives].filter((slot) => !tried.has(slot.slotId));

  if (!available.length) {
    if (!has("save_callback_request")) {
      return reply("I'm not finding a window that works — let me have someone call you back.", [
        toolCall("save_callback_request", {
          customerName: String(s.answers.name),
          phone: String(s.answers.phone),
          reason: "no matching availability",
        }),
      ]);
    }
    return reply("Someone will call you shortly to sort out a time. Thanks for calling Summit Air.", [
      toolCall("end_call", { outcome: "callback" }),
    ]);
  }

  const conflicted = bookings.length > 0 && bookings.every((b) => b.status !== "confirmed");
  const spokenOffer = s.agentTexts.some((t) => t.includes(available[0].spoken));
  if (!spokenOffer && !conflicted) {
    return reply(
      `I can do ${available[0].spoken}, or ${available[1]?.spoken ?? "later in the week"}. Which works better?`,
    );
  }

  const pickSecond = /second|later|the other|afternoon/i.test(s.lastCaller) && available[1];
  const slot = pickSecond || available[0];
  const preamble = conflicted
    ? "Sorry — that window just went. I can do"
    : `Let me read that back — ${String(s.answers.address)} in ${town}. I'll book you for`;
  return reply(`${preamble} ${slot.spoken}.`, [
    toolCall("book_appointment", {
      slotId: slot.slotId,
      customerName: String(s.answers.name),
      phone: String(s.answers.phone),
      addressLine: String(s.answers.address),
      town,
      issueSummary: `${classifyIssue(s.callerText)} — ${priority?.reason ?? "routine"}`,
    }),
  ]);
}
