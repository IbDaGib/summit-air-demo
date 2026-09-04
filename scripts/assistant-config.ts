/**
 * The assistant as deployed to Vapi. Kept separate from the deploy step so the
 * defaults are testable: the model default silently reverted once and four
 * deploys shipped the wrong provider before a caller heard the consequence.
 */
import { systemPrompt } from "../agent/prompt";
import { TOOL_LIST } from "../agent/tools/schemas";

const BASE = (process.env.VAPI_BASE_URL ?? "").replace(/\/+$/, "");
export const SERVER_URL = BASE ? `${BASE}/api/vapi/tools` : undefined;
export const EVENTS_URL = BASE ? `${BASE}/api/vapi/events` : undefined;
const SECRET = process.env.VAPI_WEBHOOK_SECRET;
/**
 * Spoken while a slow tool runs. Only the two that make a caller wait — the
 * others return in single-digit milliseconds and a filler there is noise.
 */
const REQUEST_START: Record<string, string> = {
  find_slots: "Let me pull up the schedule.",
  book_appointment: "Booking that in now.",
};

export const assistant = {
  name: "Summit Air — inbound",

  // Static so the phone answers instantly. An LLM-generated greeting leaves a
  // second of dead air before the caller hears anything.
  //
  // This string is spoken verbatim. Authoring notes pasted in here get read out
  // loud — it happened once with a block of seasonal variants the caller heard
  // in full.
  //
  // "Hi there" is just a greeting. It was added as padding against a supposed
  // ~300ms audio clip that "ate" words on early calls, but that evidence came
  // from Vapi's transcript of the agent's own speech, which drops words the
  // caller actually hears (a caller heard the full sentence while the log showed
  // it truncated). There was no clip. Kept because it sounds fine, not because
  // it fixes anything.
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
  // 20, not 12. An audit suggested 12; on its first live call it hung up on a real
  // caller who was deciding between two offered windows. That pause is the
  // normal shape of the moment the call exists for.
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
