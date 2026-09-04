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
import { assistant, EVENTS_URL, SERVER_URL } from "./assistant-config";

const API = "https://api.vapi.ai";
const KEY = process.env.VAPI_API_KEY;

if (!KEY) throw new Error("VAPI_API_KEY is not set");
if (!SERVER_URL) throw new Error("VAPI_BASE_URL is not set (origin only, no path)");


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
