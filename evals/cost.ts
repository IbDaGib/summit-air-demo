/**
 * Token cost. Rates are per million tokens, current as of 2026-09; they are a
 * reporting detail, not a gate, so a stale rate misprices a run but never fails
 * one.
 */
import type { UsageByModel } from "./models/types";

export const RATES: Record<string, { inputPerM: number; outputPerM: number }> = {
  "mistral-large-latest": { inputPerM: 2, outputPerM: 6 },
  "claude-opus-5": { inputPerM: 5, outputPerM: 25 },
};

export function costOf(modelId: string, usage: { inputTokens: number; outputTokens: number }): number {
  const rate = RATES[modelId];
  if (!rate) return 0; // offline stand-ins and unknown models cost nothing
  return (usage.inputTokens * rate.inputPerM + usage.outputTokens * rate.outputPerM) / 1_000_000;
}

export function totalCost(usage: UsageByModel): number {
  return Object.entries(usage).reduce((sum, [id, u]) => sum + costOf(id, u), 0);
}
