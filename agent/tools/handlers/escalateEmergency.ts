/**
 * escalate_emergency — the one path that must work when everything else fails.
 *
 * The instructions are constants in this file, never a database read and never
 * model output. If Supabase is down, the caller still hears the right words;
 * only the incident row is lost, and that is logged loudly enough to reconstruct.
 *
 * Wording is written to be spoken: phone numbers in words, short sentences, the
 * action first and the reassurance second.
 */
import type { Hazard } from "../../policy/types";
import type { EscalationResult, ToolHandlers } from "../schemas";
import { type HandlerDeps, logEvent, logFailure, maskPhone } from "./deps";

type RealHazard = Exclude<Hazard, "none">;

/** NorthWestern Energy's 24-hour gas emergency line. */
const GAS_UTILITY = "eight eight eight, four six seven, two five five three";

export const ESCALATION_SCRIPTS: Record<RealHazard, string> = {
  gas_smell: [
    "Please stop what you're doing and get everyone out of the building right now.",
    "Don't touch any light switches, the thermostat, or anything electrical on the way out, and don't use anything that could spark — that includes your phone until you're outside.",
    `Once you're outside and well away from the building, call nine one one, or NorthWestern Energy at ${GAS_UTILITY}.`,
    "Don't go back in for any reason until they tell you it's safe.",
    "I'm flagging this as an emergency on our end, and a technician will follow up with you once the building has been cleared.",
  ].join(" "),

  co_alarm: [
    "Get everyone out of the building right away and into fresh air, and then call nine one one from outside.",
    "Carbon monoxide isn't something to wait out, and I don't want you staying in there to finish this call.",
    "If anyone is dizzy, confused, or has a headache, tell the dispatcher that when they answer.",
    "Don't go back inside until the fire department says it's clear.",
    "I'm flagging this as an emergency here and a technician will follow up once it's safe.",
  ].join(" "),

  smoke_or_burning: [
    "Leave the building now and call nine one one from outside.",
    "If your breaker panel is on your way out and you can reach it safely, shut off the power to the heating system — but only if it's on your way, don't go looking for it.",
    "Don't go back in.",
    "I'm flagging this as an emergency on our end, and a technician will follow up once the fire department has cleared the building.",
  ].join(" "),
};

export function escalateEmergency(deps: HandlerDeps): ToolHandlers["escalate_emergency"] {
  return async ({ hazard, callbackPhone, town }): Promise<EscalationResult> => {
    const instructions =
      ESCALATION_SCRIPTS[hazard as RealHazard] ?? ESCALATION_SCRIPTS.smoke_or_burning;

    // Local id first, so the return value never depends on the write succeeding.
    let incidentId = `incident-local-${deps.now().getTime()}`;
    try {
      const saved = await deps.repo.recordSafetyIncident({ hazard, town, phone: callbackPhone });
      incidentId = saved.incidentId;
    } catch (error) {
      // The number is masked to the last four digits: this line goes to the
      // operational log drain, and Vapi already holds the carrier number
      // against the call record if the incident has to be traced to a person.
      logFailure("safety_incident_unrecorded", {
        hazard,
        town,
        callbackPhone: maskPhone(callbackPhone),
        incidentId,
        message: error instanceof Error ? error.message : String(error),
        note: "Instructions were still read to the caller. Trace the full number via the Vapi call record.",
      });
    }

    logEvent("safety_escalation", { hazard, town, incidentId });
    return { instructions, incidentId };
  };
}
