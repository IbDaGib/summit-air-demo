/**
 * check_service_area — is this town ours?
 *
 * Answered from the policy table, not the database: coverage is a fixed
 * business fact, and the agent must never guess it.
 */
import { SERVICE_AREA_MESSAGE, resolveTown } from "../../policy/serviceArea";
import type { ServiceAreaResult, ToolHandlers } from "../schemas";
import { type HandlerDeps, logEvent } from "./deps";

export function checkServiceArea(_deps: HandlerDeps): ToolHandlers["check_service_area"] {
  return async ({ town }): Promise<ServiceAreaResult> => {
    const match = resolveTown(town ?? "");
    logEvent("check_service_area", { heard: town, covered: Boolean(match), town: match?.town });

    if (!match) {
      return {
        covered: false,
        town,
        message: `${SERVICE_AREA_MESSAGE} Take the caller's number and log a callback so someone can check whether we can stretch to them.`,
      };
    }
    // Return the canonical spelling so "Boseman" is filed as "Bozeman".
    return { covered: true, town: match.town, county: match.county };
  };
}
