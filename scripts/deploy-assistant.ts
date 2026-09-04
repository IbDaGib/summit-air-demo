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
  // Two things here are deliberate. The leading "Hi there" is disposable padding:
  // the first ~300ms of audio is clipped on some carrier paths and it ate
  // "What's" on 2 of 4 test calls, so a throwaway greeting absorbs the clip
  // instead of real content. And this string is spoken verbatim — authoring
  // notes pasted in here get read out loud, which happened once with a block of
  // seasonal variants the caller heard in full.
  firstMessage:
    "Hi there — thanks for calling Summit Air, this is Casey. Quick heads up, I'm an AI assistant and this call is recorded. What's the system doing, or not doing?",

  model: {
    // Chosen on measured call quality, not on paper. Mistral Medium read its own
    // tool call aloud on a live call ("Tool calls. ID, four h two y y nine b j.
    // Type, function...") and the caller hung up. gpt-5.6-luna handled the same
    // intake cleanly and re-tiered P2 to P1 correctly when a vulnerable occupant
    // was revealed mid-call.
    //
    // Provider and model are env-overridable so swapping is a config change, not
    // a code edit — the point of keeping the agent core transport-agnostic.
    // Mistral Medium remains a verified alternative; note that
    // mistral-large-latest returns 403 tier_not_allowed on lower tiers, which
    // Vapi surfaces only as the opaque "pipeline-error-mistral-llm-failed".
    provider: process.env.VAPI_PROVIDER ?? "openai",
    model: process.env.VAPI_MODEL ?? "gpt-5.6-luna",
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

  // nova-3 with a confidence floor: below 0.4 the transcript is guesswork, and
  // a misheard street address sends a truck to a stranger's house.
  transcriber: {
    provider: "deepgram",
    model: "nova-3",
    language: "en",
    profanityFilter: true,
    confidenceThreshold: 0.4,
  },

  voice: { provider: "vapi", voiceId: "Savannah", language: "en", version: "2" },

  // Endpointing is the real latency lever on a voice call — far more than model
  // choice. Too high and the agent feels slow; too low and it interrupts people
  // mid-sentence while they think about their address.
  // smartEndpointingPlan is the single biggest turn-taking lever — it decides
  // when the caller has actually finished rather than just paused to think.
  startSpeakingPlan: { waitSeconds: 0.4, smartEndpointingPlan: { provider: "vapi" } },
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
