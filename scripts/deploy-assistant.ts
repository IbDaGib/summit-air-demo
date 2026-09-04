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

const assistant = {
  name: "Summit Air — inbound",

  // Static so the phone answers instantly. An LLM-generated greeting leaves a
  // second of dead air before the caller hears anything.
  // Leading "Hi there" is deliberate padding: the first ~300ms of audio is
  // clipped on some carrier paths, and it ate "What's" on 2 of 4 test calls.
  // Now a throwaway greeting absorbs the clip instead of real content.
  firstMessage:
    "Hi there — thanks for calling Summit Air. This is Casey, I'm an AI assistant and this call may be recorded. What's going on with your system today?",

  model: {
    provider: "mistral",
    // Overridable so the tier/latency tradeoff is one env var, not a code edit.
    // mistral-large-latest is NOT available on all Mistral subscription tiers —
    // it returns 403 tier_not_allowed, which Vapi surfaces only as the opaque
    // "pipeline-error-mistral-llm-failed". Verified working: small, medium.
    model: process.env.VAPI_MODEL ?? "mistral-medium-latest",
    temperature: 0.4,
    maxTokens: 300,
    messages: [{ role: "system", content: systemPrompt() }],
    tools: TOOL_LIST.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
      server: { url: SERVER_URL, secret: SECRET },
    })),
  },

  transcriber: { provider: "deepgram", model: "nova-2", language: "en-US" },

  voice: { provider: "11labs", voiceId: "sarah", model: "eleven_flash_v2_5" },

  // Endpointing is the real latency lever on a voice call — far more than model
  // choice. Too high and the agent feels slow; too low and it interrupts people
  // mid-sentence while they think about their address.
  startSpeakingPlan: { waitSeconds: 0.4 },
  silenceTimeoutSeconds: 20,
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
  if (!existing) console.log("Set VAPI_ASSISTANT_ID=" + json.id + " in .env.local");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
