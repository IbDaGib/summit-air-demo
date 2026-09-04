/**
 * Pushes the assistant config to Vapi. The repo is the source of truth; nothing
 * is configured by clicking in a dashboard.
 *
 *   npx tsx scripts/deploy-assistant.ts
 *
 * NOTE: verify field names against https://docs.vapi.ai/api-reference before
 * relying on this — Vapi's assistant schema evolves. The shape below is the
 * documented one as of writing.
 */
import { systemPrompt } from "../agent/prompt";
import { TOOL_LIST } from "../agent/tools/schemas";

const API = "https://api.vapi.ai";
const KEY = process.env.VAPI_API_KEY;
// One origin, two endpoints. Tool calls and lifecycle events are different
// concerns and were previously both pointed at /tools, which is why status
// updates showed up as stray POSTs in the tool webhook log.
const BASE = (process.env.VAPI_BASE_URL ?? "").replace(/\/+$/, "");
const SERVER_URL = BASE ? `${BASE}/api/vapi/tools` : undefined;
const EVENTS_URL = BASE ? `${BASE}/api/vapi/events` : undefined;
const SECRET = process.env.VAPI_WEBHOOK_SECRET;

if (!KEY) throw new Error("VAPI_API_KEY is not set");
if (!BASE) throw new Error("VAPI_BASE_URL is not set (origin only, no path)");

/**
 * Spoken while a slow tool runs. Only the two that make a caller wait — the
 * others return in single-digit milliseconds and a filler there is noise.
 */
const REQUEST_START: Record<string, string> = {
  find_slots: "Let me pull up the schedule.",
  book_appointment: "Booking that in now.",
};

const assistant = {
  name: "Summit Air — inbound",

  // Static so the phone answers instantly. An LLM-generated greeting leaves a
  // second of dead air before the caller hears anything.
  // Two things here are deliberate. The leading "Hi there" is disposable padding:
  // the first ~300ms of audio is clipped on some carrier paths and it ate
  // "What's" on 2 of 4 test calls, so a throwaway greeting absorbs the clip
  // instead of real content. And this string is spoken verbatim — authoring
  // notes pasted in here get read out loud, which happened once with a block of
  // seasonal variants the caller heard in full.
  // "Hi there" is disposable padding: the first ~300ms is clipped on some
  // carrier paths and ate "What's" on two of four test calls, so the clip
  // eats a greeting instead of content.
  firstMessage:
    "Hi there — thanks for calling Summit Air, this is Casey. I'm an AI and this call is recorded. What's going on today?",

  model: {
    // Default is gpt-5.6-luna. This was decided on 2026-09-04 and then lost:
    // the edit was deployed from the working tree but never reached a commit,
    // the tree was reset, and every later deploy silently shipped Mistral
    // Medium. Mistral Medium through Vapi returns tool calls INSIDE the content
    // string ({"content":"Tool calls: [{...}]"} with no tool_calls array), which
    // Vapi streams to TTS — so the caller hears the JSON. Proven from Vapi's
    // raw provider log on call 01a06d84. gpt-5.6-luna returns structured
    // tool_calls (call_… ids) and never did this across every call today.
    provider: process.env.VAPI_PROVIDER ?? "openai",
    model: process.env.VAPI_MODEL ?? "gpt-5.6-luna",
    temperature: 0.2,
    maxTokens: 300,
    messages: [{ role: "system", content: systemPrompt() }],
    // Filler is configuration, not a prompt rule. Asking the model to say
    // "let me pull up the schedule" once produced eight stacked fillers on a
    // real call; a request-start message fires exactly once per invocation.
    tools: TOOL_LIST.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
      server: { url: SERVER_URL, secret: SECRET },
      ...(REQUEST_START[t.name]
        ? { messages: [{ type: "request-start", content: REQUEST_START[t.name] }] }
        : {}),
    })),
  },

  transcriber: { provider: "deepgram", model: "nova-2", language: "en-US" },

  voice: { provider: "11labs", voiceId: "sarah", model: "eleven_flash_v2_5" },

  // Endpointing is the real latency lever on a voice call — far more than model
  // choice. Too high and the agent feels slow; too low and it interrupts people
  // mid-sentence while they think about their address.
  startSpeakingPlan: { waitSeconds: 0.4 },
  silenceTimeoutSeconds: 12,
  maxDurationSeconds: 420,

  // The caller must always be able to cut in.
  stopSpeakingPlan: { numWords: 2 },

  endCallFunctionEnabled: true,
  backgroundSound: "office",

  // Lifecycle events go here, not to the tool endpoint. end-of-call-report is
  // the one that matters: it carries the transcript, timings, cost and
  // recording URL, and without it nothing survives the call.
  server: { url: EVENTS_URL, secret: SECRET },
  serverMessages: ["end-of-call-report", "status-update"],
};

async function main() {
  const existing = process.env.VAPI_ASSISTANT_ID;
  const url = existing ? `${API}/assistant/${existing}` : `${API}/assistant`;
  const res = await fetch(url, {
    method: existing ? "PATCH" : "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(assistant),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Vapi ${res.status}: ${body}`);
  const json = JSON.parse(body) as { id: string };
  console.log(existing ? "updated" : "created", "assistant", json.id);

  // Verify what is live, not what was sent. The model default silently
  // reverted once and four deploys shipped the wrong provider before anyone
  // noticed — this makes that impossible to miss.
  const check = await fetch(`${API}/assistant/${json.id}`, {
    headers: { Authorization: `Bearer ${KEY}` },
  });
  const live = (await check.json()) as {
    model?: { provider?: string; model?: string; messages?: { content?: string }[] };
    firstMessage?: string;
  };
  const want = `${assistant.model.provider}/${assistant.model.model}`;
  const got = `${live.model?.provider}/${live.model?.model}`;
  console.log(`live model:  ${got}`);
  console.log(`live prompt: ${(live.model?.messages?.[0]?.content ?? "").length} chars`);
  if (got !== want) {
    throw new Error(`deployed ${want} but Vapi reports ${got} — refusing to call this a success`);
  }
  if (!existing) console.log("Set VAPI_ASSISTANT_ID=" + json.id + " in .env.local");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
