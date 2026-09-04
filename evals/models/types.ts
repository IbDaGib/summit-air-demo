/**
 * The only LLM abstraction in the harness. Both the agent under test and the
 * simulated caller are ChatModels, which is what lets a run swap between the
 * live Mistral models the phone uses and the offline stand-in.
 */
import type { ToolSchema } from "../../agent/tools/schemas";

export interface TokenUsage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

export type UsageByModel = Record<string, TokenUsage>;

export interface ToolCallRequest {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ChatTurn {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** Set on assistant turns that asked for tools. */
  toolCalls?: ToolCallRequest[];
  /** Set on tool turns. */
  toolCallId?: string;
  name?: string;
}

export interface ChatRequest {
  messages: ChatTurn[];
  tools?: ToolSchema[];
  temperature?: number;
  maxTokens?: number;
}

export interface ChatReply {
  text: string;
  toolCalls: ToolCallRequest[];
  usage: TokenUsage;
}

export interface ChatModel {
  /** Model id, used as the key for token accounting and cost. */
  id: string;
  chat(req: ChatRequest): Promise<ChatReply>;
}

export const emptyUsage = (): TokenUsage => ({ calls: 0, inputTokens: 0, outputTokens: 0 });

export function addUsage(into: UsageByModel, modelId: string, u: TokenUsage): UsageByModel {
  const cur = into[modelId] ?? emptyUsage();
  into[modelId] = {
    calls: cur.calls + u.calls,
    inputTokens: cur.inputTokens + u.inputTokens,
    outputTokens: cur.outputTokens + u.outputTokens,
  };
  return into;
}

export function mergeUsage(into: UsageByModel, from: UsageByModel): UsageByModel {
  for (const [id, u] of Object.entries(from)) addUsage(into, id, u);
  return into;
}
