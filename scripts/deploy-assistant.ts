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
const SERVER_URL = process.env.VAPI_SERVER_URL; // e.g. https://<vercel>/api/vapi/tools
const SECRET = process.env.VAPI_WEBHOOK_SECRET;

if (!KEY) throw new Error("VAPI_API_KEY is not set");
if (!SERVER_URL) throw new Error("VAPI_SERVER_URL is not set");

const assistant = {
  name: "Summit Air — inbound",

  // Static so the phone answers instantly. An LLM-generated greeting leaves a
  // second of dead air before the caller hears anything.
  firstMessage:
    "Thanks for calling Summit Air, this is Casey — I'm an AI assistant and this call may be recorded. What's going on with your system today?",

  model: {
    provider: "mistral",
    model: "mistral-large-latest",
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
  serverUrl: SERVER_URL,
  serverUrlSecret: SECRET,
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
