/**
 * Mistral chat-completions client. Mistral Large is the model driving the phone
 * calls (see DECISIONS.md), so the eval harness drives the same one.
 *
 * Raw fetch rather than an SDK: the request shape is the OpenAI-compatible one
 * and this is the only place in the repo that speaks it.
 */
import type { ChatModel, ChatReply, ChatRequest, ChatTurn, ToolCallRequest } from "./types";

/** Read per request, so the wire path can be pointed at a local stub. */
const endpoint = () => `${process.env.MISTRAL_BASE_URL ?? "https://api.mistral.ai/v1"}/chat/completions`;

interface WireToolCall {
  id?: string;
  function?: { name?: string; arguments?: string };
}

interface WireResponse {
  choices?: { message?: { content?: string | null; tool_calls?: WireToolCall[] } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

const parseArgs = (raw: unknown): Record<string, unknown> => {
  if (typeof raw !== "string") return (raw as Record<string, unknown>) ?? {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const toWireMessage = (t: ChatTurn) => {
  if (t.role === "tool") {
    return { role: "tool", name: t.name, tool_call_id: t.toolCallId, content: t.content };
  }
  if (t.role === "assistant" && t.toolCalls?.length) {
    return {
      role: "assistant",
      content: t.content || "",
      tool_calls: t.toolCalls.map((c) => ({
        id: c.id,
        type: "function",
        function: { name: c.name, arguments: JSON.stringify(c.args) },
      })),
    };
  }
  return { role: t.role, content: t.content };
};

export function mistralModel(opts: { model?: string; apiKey?: string } = {}): ChatModel {
  const model = opts.model ?? process.env.EVAL_CALL_MODEL ?? "mistral-large-latest";
  const apiKey = opts.apiKey ?? process.env.MISTRAL_API_KEY ?? "";

  return {
    id: model,
    async chat(req: ChatRequest): Promise<ChatReply> {
      const body: Record<string, unknown> = {
        model,
        messages: req.messages.map(toWireMessage),
        temperature: req.temperature ?? 0.4,
        max_tokens: req.maxTokens ?? 400,
      };
      if (req.tools?.length) {
        body.tools = req.tools.map((t) => ({
          type: "function",
          function: { name: t.name, description: t.description, parameters: t.parameters },
        }));
        body.tool_choice = "auto";
      }

      let lastError = "";
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await fetch(endpoint(), {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(body),
        });

        if (res.ok) {
          const json = (await res.json()) as WireResponse;
          const message = json.choices?.[0]?.message;
          const toolCalls: ToolCallRequest[] = (message?.tool_calls ?? []).map((c, i) => ({
            id: c.id ?? `call_${i}`,
            name: c.function?.name ?? "",
            args: parseArgs(c.function?.arguments),
          }));
          return {
            text: (message?.content ?? "").trim(),
            toolCalls,
            usage: {
              calls: 1,
              inputTokens: json.usage?.prompt_tokens ?? 0,
              outputTokens: json.usage?.completion_tokens ?? 0,
            },
          };
        }

        lastError = `${res.status} ${await res.text()}`;
        // 429 and 5xx are worth another go; a 400 never is.
        if (res.status !== 429 && res.status < 500) break;
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      }
      throw new Error(`mistral request failed: ${lastError}`);
    },
  };
}
