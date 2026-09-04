/**
 * assess_situation — the model reports facts, this returns the tier.
 *
 * The handler is a thin shell on purpose: all of the judgement lives in the
 * pure, unit-tested computePriority. Nothing here reads a tier out of model
 * output.
 */
import { computePriority } from "../../policy/priority";
import type { PriorityResult, SituationFacts } from "../../policy/types";
import type { ToolHandlers } from "../schemas";
import { type HandlerDeps, logEvent } from "./deps";

/**
 * Outdoor temperature is not something the model can know, so it is not in the
 * tool schema — the runtime supplies it. Until a weather lookup exists, the
 * demo override stands in, which is what makes a September demo of a January
 * scenario behave like January without any date logic.
 */
export function resolveOutdoorTempF(facts: SituationFacts): number | undefined {
  if (typeof facts.outdoorTempF === "number" && Number.isFinite(facts.outdoorTempF)) {
    return facts.outdoorTempF;
  }
  const override = Number(process.env.DEMO_FORCE_OUTDOOR_TEMP_F);
  return Number.isFinite(override) && process.env.DEMO_FORCE_OUTDOOR_TEMP_F !== ""
    ? override
    : undefined;
}

export function assessSituation(deps: HandlerDeps): ToolHandlers["assess_situation"] {
  return async (facts: SituationFacts): Promise<PriorityResult> => {
    const enriched: SituationFacts = { ...facts, outdoorTempF: resolveOutdoorTempF(facts) };
    const result = computePriority(enriched, deps.now());
    logEvent("assess_situation", {
      issue: enriched.issue,
      systemDown: enriched.systemDown,
      hazard: enriched.hazard,
      vulnerableOccupant: enriched.vulnerableOccupant,
      outdoorTempF: enriched.outdoorTempF,
      tier: result.tier,
      blockBooking: result.blockBooking,
    });
    return result;
  };
}
